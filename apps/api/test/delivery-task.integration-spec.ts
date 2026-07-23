import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DISPATCH_ROLE_CODES } from "@dispatch/shared-types";
import type { CreateDeliveryTaskInput } from "@dispatch/domain";
import { PrismaCustomerMasterSearchRepository } from "../src/infrastructure/database/repositories/prisma-customer-master-search.repository";
import { PrismaDeliveryTaskRepository } from "../src/infrastructure/database/repositories/prisma-delivery-task.repository";
import { PrismaTaskNumberGenerator } from "../src/infrastructure/database/repositories/prisma-task-number.generator";
import { PrismaService } from "../src/infrastructure/database/prisma/prisma.service";

/**
 * Delivery Task database integration coverage (MVP-02). Requires a
 * reachable PostgreSQL via DATABASE_URL with the MVP-02 migration
 * deployed. Creates its own uniquely scoped test User + Customer Master
 * fixtures and deletes exactly those rows afterward — never touches the
 * real operator account, the six seeded roles, or unrelated data.
 */
const prisma = new PrismaClient();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Delivery Task — database integration", () => {
  let prismaService: PrismaService;
  let deliveryTaskRepository: PrismaDeliveryTaskRepository;
  let searchRepository: PrismaCustomerMasterSearchRepository;
  let taskNumberGenerator: PrismaTaskNumberGenerator;

  const marker = `mvp02-test-${randomUUID()}`;
  let testUserId: string;
  let customerId: string;
  let destinationId: string;
  const taskIds: string[] = [];
  const searchIds: string[] = [];
  const otherUserIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    prismaService = new PrismaService();
    await prismaService.$connect();
    deliveryTaskRepository = new PrismaDeliveryTaskRepository(prismaService);
    searchRepository = new PrismaCustomerMasterSearchRepository(prismaService);
    taskNumberGenerator = new PrismaTaskNumberGenerator(prismaService);

    const testUser = await prisma.user.create({
      data: { displayName: `${marker}-actor (safe to delete)` },
    });
    testUserId = testUser.id;

    const customer = await prisma.customer.create({ data: { name: `${marker}-customer`, isActive: true } });
    customerId = customer.id;
    const destination = await prisma.customerDestination.create({
      data: {
        customerId,
        destinationName: `${marker}-destination-original`,
        address: "Original Address",
        isActive: true,
      },
    });
    destinationId = destination.id;
  });

  afterAll(async () => {
    // Children first (FK RESTRICT from DeliveryTask -> Customer/CustomerDestination/CustomerMasterSearch/User).
    await prisma.taskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.deliveryTask.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.customerMasterSearch.deleteMany({ where: { id: { in: searchIds } } });
    await prisma.customerDestination.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { id: { in: [testUserId, ...otherUserIds] } } });
    await prismaService.$disconnect();
    await prisma.$disconnect();
  });

  async function createSearchEvidence(matchedIds: string[]): Promise<string> {
    const search = await searchRepository.create({
      searchedByUserId: testUserId,
      normalizedQuery: marker,
      matchedCustomerDestinationIds: matchedIds,
      resultCount: matchedIds.length,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    searchIds.push(search.id);
    return search.id;
  }

  async function createCompleteFreeTextDraft(overrides: Partial<CreateDeliveryTaskInput> = {}) {
    const searchId = await createSearchEvidence([]);
    const input: CreateDeliveryTaskInput = {
      destinationSource: "FREE_TEXT",
      customerId: null,
      customerDestinationId: null,
      customerSearchId: searchId,
      freeTextFallbackReason: "AD_HOC_DESTINATION",
      customerName: `${marker}-concurrent-customer`,
      destinationName: `${marker}-concurrent-destination`,
      address: "Concurrent Address",
      contactName: null,
      contactPhone: null,
      deliveryInstructions: null,
      locationReference: null,
      accessNotes: null,
      customerCodeSnapshot: null,
      destinationCodeSnapshot: null,
      createdByUserId: testUserId,
      plannedDeliveryDate: new Date("2026-08-20T00:00:00Z"),
      items: [{ lineNumber: 1, description: "Original boxes", plannedQuantity: "1", unit: "BOX", notes: null }],
      references: [{ referenceType: "SO", referenceValue: `${marker}-original-ref` }],
      ...overrides,
    };
    const taskNumber = await taskNumberGenerator.next();
    const created = await deliveryTaskRepository.createDraft(input, taskNumber);
    taskIds.push(created.id);
    return created;
  }

  async function createRepositoryConnection() {
    const client = new PrismaService();
    await client.$connect();
    return {
      client,
      repository: new PrismaDeliveryTaskRepository(client),
    };
  }

  async function waitForBlockedTaskLocks(expectedBlocked: number): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query ILIKE '%FOR UPDATE%'
          AND query ILIKE '%delivery_tasks%'
      `;
      if (Number(rows[0]?.count ?? 0) >= expectedBlocked) {
        return;
      }
      await delay(25);
    }
    throw new Error(`Timed out waiting for ${expectedBlocked} blocked delivery_tasks row lock waiter(s).`);
  }

  async function withHeldTaskLock(taskId: string, run: (releaseLock: () => void) => Promise<void>): Promise<void> {
    const locker = new PrismaClient();
    await locker.$connect();
    let releaseLock!: () => void;
    let released = false;
    let lockAcquired!: () => void;
    const releaseLockPromise = new Promise<void>((resolve) => {
      releaseLock = () => {
        if (!released) {
          released = true;
          resolve();
        }
      };
    });
    const lockAcquiredPromise = new Promise<void>((resolve) => {
      lockAcquired = resolve;
    });
    const lockTransaction = locker.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "delivery_tasks"
          WHERE "id" = ${taskId}::uuid
          FOR UPDATE
        `;
        lockAcquired();
        await releaseLockPromise;
      },
      { maxWait: 5000, timeout: 15000 },
    );

    await lockAcquiredPromise;
    try {
      await run(releaseLock);
    } finally {
      releaseLock();
      await lockTransaction;
      await locker.$disconnect();
    }
  }

  it("does not disturb the six seeded roles", async () => {
    const roles = await prisma.role.findMany({ orderBy: { code: "asc" } });
    expect(roles.map((r) => r.code).sort()).toEqual([...DISPATCH_ROLE_CODES].sort());
  });

  it("MASTER-sourced snapshot is immutable: a later Master update does not change a previously created Task", async () => {
    const searchId = await createSearchEvidence([destinationId]);
    const input: CreateDeliveryTaskInput = {
      destinationSource: "MASTER",
      customerId,
      customerDestinationId: destinationId,
      customerSearchId: searchId,
      freeTextFallbackReason: null,
      customerName: "placeholder — overwritten by canonical load in TasksService, using raw values here",
      destinationName: `${marker}-destination-original`,
      address: "Original Address",
      contactName: null,
      contactPhone: null,
      deliveryInstructions: null,
      locationReference: null,
      accessNotes: null,
      customerCodeSnapshot: null,
      destinationCodeSnapshot: null,
      createdByUserId: testUserId,
      plannedDeliveryDate: new Date("2026-08-01T00:00:00Z"),
      items: [{ lineNumber: 1, description: "Boxes", plannedQuantity: "5", unit: "BOX", notes: null }],
      references: [],
    };
    const taskNumber = await taskNumberGenerator.next();
    const created = await deliveryTaskRepository.createDraft(input, taskNumber);
    taskIds.push(created.id);

    expect(created.destinationName).toBe(`${marker}-destination-original`);
    expect(created.address).toBe("Original Address");

    // Master record changes after the fact...
    await prisma.customerDestination.update({
      where: { id: destinationId },
      data: { destinationName: `${marker}-destination-CHANGED`, address: "CHANGED Address" },
    });

    // ...but the previously created Task's snapshot must be unaffected.
    const reread = await deliveryTaskRepository.findById(created.id);
    expect(reread?.destinationName).toBe(`${marker}-destination-original`);
    expect(reread?.address).toBe("Original Address");
  });

  it("FREE_TEXT Task has null Master foreign keys and never creates/links a Customer Master record", async () => {
    const searchId = await createSearchEvidence([]);
    const beforeCustomerCount = await prisma.customer.count();
    const beforeDestinationCount = await prisma.customerDestination.count();

    const input: CreateDeliveryTaskInput = {
      destinationSource: "FREE_TEXT",
      customerId: null,
      customerDestinationId: null,
      customerSearchId: searchId,
      freeTextFallbackReason: "AD_HOC_DESTINATION",
      customerName: `${marker}-ad-hoc-customer`,
      destinationName: `${marker}-ad-hoc-destination`,
      address: "Ad Hoc Address",
      contactName: null,
      contactPhone: null,
      deliveryInstructions: null,
      locationReference: null,
      accessNotes: null,
      customerCodeSnapshot: null,
      destinationCodeSnapshot: null,
      createdByUserId: testUserId,
      plannedDeliveryDate: new Date("2026-08-02T00:00:00Z"),
      items: [{ lineNumber: 1, description: "Pallets", plannedQuantity: "2", unit: "PALLET", notes: null }],
      references: [],
    };
    const taskNumber = await taskNumberGenerator.next();
    const created = await deliveryTaskRepository.createDraft(input, taskNumber);
    taskIds.push(created.id);

    expect(created.customerId).toBeNull();
    expect(created.customerDestinationId).toBeNull();

    const afterCustomerCount = await prisma.customer.count();
    const afterDestinationCount = await prisma.customerDestination.count();
    expect(afterCustomerCount).toBe(beforeCustomerCount);
    expect(afterDestinationCount).toBe(beforeDestinationCount);
  });

  it("Task numbers are unique under concurrent generation", async () => {
    const numbers = await Promise.all(Array.from({ length: 20 }, () => taskNumberGenerator.next()));
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const number of numbers) {
      expect(number).toMatch(/^DSP-\d{8}$/);
    }
  });

  it("submit is atomic: an incomplete Task is rejected with no partial mutation and no extra status-history event", async () => {
    const searchId = await createSearchEvidence([]);
    const input: CreateDeliveryTaskInput = {
      destinationSource: "FREE_TEXT",
      customerId: null,
      customerDestinationId: null,
      customerSearchId: searchId,
      freeTextFallbackReason: "NO_SUITABLE_MASTER",
      customerName: `${marker}-incomplete-customer`,
      destinationName: `${marker}-incomplete-destination`,
      address: "Incomplete Address",
      contactName: null,
      contactPhone: null,
      deliveryInstructions: null,
      locationReference: null,
      accessNotes: null,
      customerCodeSnapshot: null,
      destinationCodeSnapshot: null,
      createdByUserId: testUserId,
      plannedDeliveryDate: null, // missing — submission must be rejected (BR-TASK-004)
      items: [], // missing — submission must be rejected (BR-TASK-008)
      references: [],
    };
    const taskNumber = await taskNumberGenerator.next();
    const created = await deliveryTaskRepository.createDraft(input, taskNumber);
    taskIds.push(created.id);

    const result = await deliveryTaskRepository.submit({ taskId: created.id, actorUserId: testUserId });
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("INCOMPLETE");
    expect(result.validationErrors?.map((e) => e.code)).toEqual(
      expect.arrayContaining(["PLANNED_DELIVERY_DATE_REQUIRED", "AT_LEAST_ONE_ITEM_REQUIRED"]),
    );

    const reread = await deliveryTaskRepository.findById(created.id);
    expect(reread?.status).toBe("DRAFT");
    expect(reread?.submittedAt).toBeNull();
    expect(reread?.events).toHaveLength(1);
    expect(reread?.events[0]?.eventType).toBe("TASK_CREATED");
  });

  it("a complete submission transitions status atomically and appends an append-only status-history event", async () => {
    const searchId = await createSearchEvidence([]);
    const input: CreateDeliveryTaskInput = {
      destinationSource: "FREE_TEXT",
      customerId: null,
      customerDestinationId: null,
      customerSearchId: searchId,
      freeTextFallbackReason: "AD_HOC_DESTINATION",
      customerName: `${marker}-complete-customer`,
      destinationName: `${marker}-complete-destination`,
      address: "Complete Address",
      contactName: null,
      contactPhone: null,
      deliveryInstructions: null,
      locationReference: null,
      accessNotes: null,
      customerCodeSnapshot: null,
      destinationCodeSnapshot: null,
      createdByUserId: testUserId,
      plannedDeliveryDate: new Date("2026-08-03T00:00:00Z"),
      items: [{ lineNumber: 1, description: "Crates", plannedQuantity: "3", unit: "CRATE", notes: null }],
      references: [],
    };
    const taskNumber = await taskNumberGenerator.next();
    const created = await deliveryTaskRepository.createDraft(input, taskNumber);
    taskIds.push(created.id);

    const result = await deliveryTaskRepository.submit({ taskId: created.id, actorUserId: testUserId });
    expect(result.ok).toBe(true);
    expect(result.task?.status).toBe("WAITING_PREPARATION");
    expect(result.task?.submittedAt).not.toBeNull();

    const events = result.task?.events ?? [];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ eventType: "TASK_CREATED", previousStatus: null, newStatus: "DRAFT" });
    expect(events[1]).toMatchObject({
      eventType: "TASK_SUBMITTED",
      previousStatus: "DRAFT",
      newStatus: "WAITING_PREPARATION",
    });

    // Re-submitting an already-submitted Task must be rejected (DRAFT-only), and must not append another event.
    const secondAttempt = await deliveryTaskRepository.submit({ taskId: created.id, actorUserId: testUserId });
    expect(secondAttempt.ok).toBe(false);
    expect(secondAttempt.failureReason).toBe("NOT_DRAFT");

    const reread = await deliveryTaskRepository.findById(created.id);
    expect(reread?.events).toHaveLength(2);
  });

  describe("row-lock serialization for concurrent DRAFT mutations", () => {
    it("allows exactly one of two concurrent submits to transition and append TASK_SUBMITTED", async () => {
      const created = await createCompleteFreeTextDraft({
        customerName: `${marker}-submit-race-customer`,
        destinationName: `${marker}-submit-race-destination`,
        references: [{ referenceType: "SO", referenceValue: `${marker}-submit-race-ref` }],
      });
      const connectionA = await createRepositoryConnection();
      const connectionB = await createRepositoryConnection();

      try {
        await withHeldTaskLock(created.id, async (releaseLock) => {
          const submitA = connectionA.repository.submit({ taskId: created.id, actorUserId: testUserId });
          const submitB = connectionB.repository.submit({ taskId: created.id, actorUserId: testUserId });
          await waitForBlockedTaskLocks(2);
          releaseLock();

          const [resultA, resultB] = await Promise.all([submitA, submitB]);
          const successes = [resultA, resultB].filter((result) => result.ok);
          const failures = [resultA, resultB].filter((result) => !result.ok);

          expect(successes).toHaveLength(1);
          expect(failures).toHaveLength(1);
          expect(failures[0]?.failureReason).toBe("NOT_DRAFT");
        });

        const final = await deliveryTaskRepository.findById(created.id);
        expect(final?.status).toBe("WAITING_PREPARATION");
        expect(final?.submittedAt).not.toBeNull();
        expect(final?.items).toHaveLength(1);
        expect(final?.references).toHaveLength(1);
        expect(final?.events.filter((event) => event.eventType === "TASK_SUBMITTED")).toHaveLength(1);
      } finally {
        await connectionA.client.$disconnect();
        await connectionB.client.$disconnect();
      }
    });

    it("rejects a queued edit after submit wins, leaving snapshot/items/references unchanged", async () => {
      const created = await createCompleteFreeTextDraft({
        customerName: `${marker}-submit-wins-customer`,
        destinationName: `${marker}-submit-wins-destination`,
        items: [{ lineNumber: 1, description: "Original submit-wins item", plannedQuantity: "2", unit: "BOX", notes: null }],
        references: [{ referenceType: "SO", referenceValue: `${marker}-submit-wins-original` }],
      });
      const submitConnection = await createRepositoryConnection();
      const editConnection = await createRepositoryConnection();

      try {
        await withHeldTaskLock(created.id, async (releaseLock) => {
          const submit = submitConnection.repository.submit({ taskId: created.id, actorUserId: testUserId });
          await waitForBlockedTaskLocks(1);

          const edit = editConnection.repository.updateDraft({
            taskId: created.id,
            updatedByUserId: testUserId,
            plannedDeliveryDate: new Date("2026-09-01T00:00:00Z"),
            items: [{ lineNumber: 1, description: "Rejected edit item", plannedQuantity: "9", unit: "BOX", notes: null }],
            references: [{ referenceType: "SO", referenceValue: `${marker}-rejected-edit` }],
          });
          await waitForBlockedTaskLocks(2);
          releaseLock();

          const [submitResult, editResult] = await Promise.all([submit, edit]);
          expect(submitResult.ok).toBe(true);
          expect(editResult).toBeNull();
        });

        const final = await deliveryTaskRepository.findById(created.id);
        expect(final?.status).toBe("WAITING_PREPARATION");
        expect(final?.plannedDeliveryDate?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
        expect(final?.items).toHaveLength(1);
        expect(final?.items[0]?.description).toBe("Original submit-wins item");
        expect(final?.references).toHaveLength(1);
        expect(final?.references[0]).toMatchObject({
          referenceType: "SO",
          referenceValue: `${marker}-submit-wins-original`,
        });
        expect(final?.events.filter((event) => event.eventType === "TASK_UPDATED")).toHaveLength(0);
        expect(final?.events.filter((event) => event.eventType === "TASK_SUBMITTED")).toHaveLength(1);
      } finally {
        await submitConnection.client.$disconnect();
        await editConnection.client.$disconnect();
      }
    });

    it("lets a queued submit validate and submit the freshly committed edit when edit wins", async () => {
      const created = await createCompleteFreeTextDraft({
        customerName: `${marker}-edit-wins-customer`,
        destinationName: `${marker}-edit-wins-destination`,
        items: [{ lineNumber: 1, description: "Original edit-wins item", plannedQuantity: "2", unit: "BOX", notes: null }],
        references: [{ referenceType: "SO", referenceValue: `${marker}-edit-wins-original` }],
      });
      const editConnection = await createRepositoryConnection();
      const submitConnection = await createRepositoryConnection();

      try {
        await withHeldTaskLock(created.id, async (releaseLock) => {
          const edit = editConnection.repository.updateDraft({
            taskId: created.id,
            updatedByUserId: testUserId,
            plannedDeliveryDate: new Date("2026-09-02T00:00:00Z"),
            items: [{ lineNumber: 1, description: "Edited complete item", plannedQuantity: "7", unit: "CASE", notes: null }],
            references: [{ referenceType: "SO", referenceValue: `${marker}-edit-wins-updated` }],
          });
          await waitForBlockedTaskLocks(1);

          const submit = submitConnection.repository.submit({ taskId: created.id, actorUserId: testUserId });
          await waitForBlockedTaskLocks(2);
          releaseLock();

          const [editResult, submitResult] = await Promise.all([edit, submit]);
          expect(editResult?.status).toBe("DRAFT");
          expect(submitResult.ok).toBe(true);
        });

        const final = await deliveryTaskRepository.findById(created.id);
        expect(final?.status).toBe("WAITING_PREPARATION");
        expect(final?.plannedDeliveryDate?.toISOString()).toBe("2026-09-02T00:00:00.000Z");
        expect(final?.items).toHaveLength(1);
        expect(final?.items[0]).toMatchObject({ description: "Edited complete item", plannedQuantity: "7", unit: "CASE" });
        expect(final?.references).toHaveLength(1);
        expect(final?.references[0]).toMatchObject({
          referenceType: "SO",
          referenceValue: `${marker}-edit-wins-updated`,
        });
        expect(final?.events.filter((event) => event.eventType === "TASK_UPDATED")).toHaveLength(1);
        expect(final?.events.filter((event) => event.eventType === "TASK_SUBMITTED")).toHaveLength(1);
      } finally {
        await editConnection.client.$disconnect();
        await submitConnection.client.$disconnect();
      }
    });
  });

  it("restricts direct DeliveryTask deletion while TaskEvent audit history exists", async () => {
    const created = await createCompleteFreeTextDraft({
      customerName: `${marker}-restrict-delete-customer`,
      destinationName: `${marker}-restrict-delete-destination`,
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.deliveryTask.delete({ where: { id: created.id } });
      }),
    ).rejects.toThrow();

    const [taskCount, eventCount] = await Promise.all([
      prisma.deliveryTask.count({ where: { id: created.id } }),
      prisma.taskEvent.count({ where: { taskId: created.id } }),
    ]);
    expect(taskCount).toBe(1);
    expect(eventCount).toBe(1);
  });

  // Blocking-review-finding fix — see docs/CTO_SUMMARY_MVP_02.md "Issues
  // Found and Fixed". A DRAFT Task must not transition to
  // WAITING_PREPARATION unless its Customer Master search evidence is
  // re-validated against data re-read inside the submit transaction, not
  // only at the original create-time selection boundary.
  describe("submit-time search evidence revalidation", () => {
    it("rejects a search that expired between DRAFT creation and submit, leaving the Task in DRAFT with no new history event", async () => {
      const searchId = await createSearchEvidence([]);
      const input: CreateDeliveryTaskInput = {
        destinationSource: "FREE_TEXT",
        customerId: null,
        customerDestinationId: null,
        customerSearchId: searchId,
        freeTextFallbackReason: "AD_HOC_DESTINATION",
        customerName: `${marker}-expiry-customer`,
        destinationName: `${marker}-expiry-destination`,
        address: "Expiry Address",
        contactName: null,
        contactPhone: null,
        deliveryInstructions: null,
        locationReference: null,
        accessNotes: null,
        customerCodeSnapshot: null,
        destinationCodeSnapshot: null,
        createdByUserId: testUserId,
        plannedDeliveryDate: new Date("2026-08-04T00:00:00Z"),
        items: [{ lineNumber: 1, description: "Crates", plannedQuantity: "1", unit: "CRATE", notes: null }],
        references: [],
      };
      const taskNumber = await taskNumberGenerator.next();
      const created = await deliveryTaskRepository.createDraft(input, taskNumber);
      taskIds.push(created.id);

      // Evidence was valid at DRAFT creation; it expires before submit.
      await prisma.customerMasterSearch.update({
        where: { id: searchId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const result = await deliveryTaskRepository.submit({ taskId: created.id, actorUserId: testUserId });
      expect(result.ok).toBe(false);
      expect(result.failureReason).toBe("SEARCH_EVIDENCE_INVALID");

      const reread = await deliveryTaskRepository.findById(created.id);
      expect(reread?.status).toBe("DRAFT");
      expect(reread?.submittedAt).toBeNull();
      expect(reread?.destinationName).toBe(`${marker}-expiry-destination`);
      expect(reread?.events).toHaveLength(1);
      expect(reread?.events[0]?.eventType).toBe("TASK_CREATED");
    });

    it("rejects a foreign user's search evidence even though the Task links it, leaving the Task in DRAFT", async () => {
      const otherUser = await prisma.user.create({ data: { displayName: `${marker}-other-user (safe to delete)` } });
      otherUserIds.push(otherUser.id);
      const foreignSearch = await searchRepository.create({
        searchedByUserId: otherUser.id,
        normalizedQuery: `${marker}-foreign`,
        matchedCustomerDestinationIds: [],
        resultCount: 0,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      searchIds.push(foreignSearch.id);

      const input: CreateDeliveryTaskInput = {
        destinationSource: "FREE_TEXT",
        customerId: null,
        customerDestinationId: null,
        customerSearchId: foreignSearch.id,
        freeTextFallbackReason: "AD_HOC_DESTINATION",
        customerName: `${marker}-foreign-customer`,
        destinationName: `${marker}-foreign-destination`,
        address: "Foreign Address",
        contactName: null,
        contactPhone: null,
        deliveryInstructions: null,
        locationReference: null,
        accessNotes: null,
        customerCodeSnapshot: null,
        destinationCodeSnapshot: null,
        createdByUserId: testUserId,
        plannedDeliveryDate: new Date("2026-08-05T00:00:00Z"),
        items: [{ lineNumber: 1, description: "Crates", plannedQuantity: "1", unit: "CRATE", notes: null }],
        references: [],
      };
      const taskNumber = await taskNumberGenerator.next();
      const created = await deliveryTaskRepository.createDraft(input, taskNumber);
      taskIds.push(created.id);

      // testUserId did not run this search — foreign_evidence submit attempt.
      const result = await deliveryTaskRepository.submit({ taskId: created.id, actorUserId: testUserId });
      expect(result.ok).toBe(false);
      expect(result.failureReason).toBe("SEARCH_EVIDENCE_INVALID");

      const reread = await deliveryTaskRepository.findById(created.id);
      expect(reread?.status).toBe("DRAFT");
      expect(reread?.events).toHaveLength(1);
    });

    it("rejects a MASTER Task whose destination is not covered by its (re-read) search evidence", async () => {
      const uncoveredSearchId = await createSearchEvidence([]); // matches nothing
      const input: CreateDeliveryTaskInput = {
        destinationSource: "MASTER",
        customerId,
        customerDestinationId: destinationId,
        customerSearchId: uncoveredSearchId,
        freeTextFallbackReason: null,
        customerName: `${marker}-uncovered-customer`,
        destinationName: `${marker}-destination-original`,
        address: "Original Address",
        contactName: null,
        contactPhone: null,
        deliveryInstructions: null,
        locationReference: null,
        accessNotes: null,
        customerCodeSnapshot: null,
        destinationCodeSnapshot: null,
        createdByUserId: testUserId,
        plannedDeliveryDate: new Date("2026-08-06T00:00:00Z"),
        items: [{ lineNumber: 1, description: "Boxes", plannedQuantity: "1", unit: "BOX", notes: null }],
        references: [],
      };
      const taskNumber = await taskNumberGenerator.next();
      const created = await deliveryTaskRepository.createDraft(input, taskNumber);
      taskIds.push(created.id);

      const result = await deliveryTaskRepository.submit({ taskId: created.id, actorUserId: testUserId });
      expect(result.ok).toBe(false);
      expect(result.failureReason).toBe("SEARCH_EVIDENCE_INVALID");

      const reread = await deliveryTaskRepository.findById(created.id);
      expect(reread?.status).toBe("DRAFT");
      expect(reread?.events).toHaveLength(1);
    });

    it("submits a FREE_TEXT Task successfully when its search evidence and fallback reason both remain valid at submit", async () => {
      const searchId = await createSearchEvidence([]);
      const input: CreateDeliveryTaskInput = {
        destinationSource: "FREE_TEXT",
        customerId: null,
        customerDestinationId: null,
        customerSearchId: searchId,
        freeTextFallbackReason: "NO_SUITABLE_MASTER",
        customerName: `${marker}-valid-freetext-customer`,
        destinationName: `${marker}-valid-freetext-destination`,
        address: "Valid Free-text Address",
        contactName: null,
        contactPhone: null,
        deliveryInstructions: null,
        locationReference: null,
        accessNotes: null,
        customerCodeSnapshot: null,
        destinationCodeSnapshot: null,
        createdByUserId: testUserId,
        plannedDeliveryDate: new Date("2026-08-07T00:00:00Z"),
        items: [{ lineNumber: 1, description: "Pallets", plannedQuantity: "4", unit: "PALLET", notes: null }],
        references: [],
      };
      const taskNumber = await taskNumberGenerator.next();
      const created = await deliveryTaskRepository.createDraft(input, taskNumber);
      taskIds.push(created.id);

      const result = await deliveryTaskRepository.submit({ taskId: created.id, actorUserId: testUserId });
      expect(result.ok).toBe(true);
      expect(result.task?.status).toBe("WAITING_PREPARATION");
      expect(result.task?.events).toHaveLength(2);
    });
  });
});
