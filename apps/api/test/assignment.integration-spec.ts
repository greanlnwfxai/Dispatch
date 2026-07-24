import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { AssignmentService } from "../src/assignment/assignment.service";
import { PrismaService } from "../src/infrastructure/database/prisma/prisma.service";

/**
 * MVP-04 assignment database integration and concurrency coverage.
 * Requires a reachable PostgreSQL via DATABASE_URL with the MVP-04
 * migration deployed. Exercises real row-level locking (not mocked
 * transactions) and the `task_current_assignments` primary-key backstop
 * directly, mirroring the established pattern in
 * delivery-task.integration-spec.ts.
 */
const prisma = new PrismaClient();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("MVP-04 assignment — database integration and concurrency", () => {
  const marker = `mvp04-integration-${randomUUID()}`;
  const userIds: string[] = [];
  const searchIds: string[] = [];
  const taskIds: string[] = [];
  let actorUserId: string;
  let primaryAId: string;
  let primaryBId: string;

  async function createUser(suffix: string, roleCodes: string[]): Promise<string> {
    const user = await prisma.user.create({ data: { displayName: `${marker}-${suffix} (safe to delete)` } });
    userIds.push(user.id);
    for (const code of roleCodes) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code } });
      await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id } });
    }
    return user.id;
  }

  async function createReadyForDispatchTask(): Promise<string> {
    const search = await prisma.customerMasterSearch.create({
      data: {
        searchedByUserId: actorUserId,
        normalizedQuery: marker,
        matchedCustomerDestinationIds: [],
        resultCount: 0,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    searchIds.push(search.id);
    const task = await prisma.deliveryTask.create({
      data: {
        taskNumber: `MVP04-${randomUUID().slice(0, 8)}`,
        status: "READY_FOR_DISPATCH",
        plannedDeliveryDate: new Date("2026-09-01T00:00:00Z"),
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        submittedAt: new Date(),
        destinationSource: "FREE_TEXT",
        customerSearchId: search.id,
        freeTextFallbackReason: "AD_HOC_DESTINATION",
        customerName: `${marker}-customer`,
        destinationName: `${marker}-destination`,
        address: "MVP-04 concurrency address",
        snapshotCreatedAt: new Date(),
        events: {
          create: { eventType: "PREPARATION_READY_CONFIRMED", previousStatus: "PREPARING", newStatus: "READY_FOR_DISPATCH", actorUserId },
        },
      },
    });
    taskIds.push(task.id);
    return task.id;
  }

  async function createServiceConnection() {
    const client = new PrismaService();
    await client.$connect();
    return { client, service: new AssignmentService(client) };
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

  beforeAll(async () => {
    await prisma.$connect();
    actorUserId = await createUser("actor", ["DISPATCHER"]);
    primaryAId = await createUser("primary-a", ["INTERNAL_DELIVERY_EMPLOYEE"]);
    primaryBId = await createUser("primary-b", ["INTERNAL_DELIVERY_EMPLOYEE"]);
  });

  afterAll(async () => {
    await prisma.taskAssignmentSupport.deleteMany({ where: { assignment: { taskId: { in: taskIds } } } });
    await prisma.taskCurrentAssignment.deleteMany({ where: { taskId: { in: taskIds } } });
    const assignments = await prisma.taskAssignment.findMany({
      where: { taskId: { in: taskIds } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    for (const assignment of assignments) {
      await prisma.taskAssignment.delete({ where: { id: assignment.id } });
    }
    await prisma.taskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.deliveryTask.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.customerMasterSearch.deleteMany({ where: { id: { in: searchIds } } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("allows exactly one of two concurrent initial assignments to succeed, with no duplicate current assignment or event", async () => {
    const taskId = await createReadyForDispatchTask();
    const connA = await createServiceConnection();
    const connB = await createServiceConnection();
    try {
      await withHeldTaskLock(taskId, async (releaseLock) => {
        const assignA = connA.service
          .assign(taskId, actorUserId, { primaryAssigneeUserId: primaryAId, supportingEmployeeUserIds: [] })
          .then(
            () => ({ ok: true as const }),
            () => ({ ok: false as const }),
          );
        const assignB = connB.service
          .assign(taskId, actorUserId, { primaryAssigneeUserId: primaryBId, supportingEmployeeUserIds: [] })
          .then(
            () => ({ ok: true as const }),
            () => ({ ok: false as const }),
          );
        await waitForBlockedTaskLocks(2);
        releaseLock();

        const [resultA, resultB] = await Promise.all([assignA, assignB]);
        const successes = [resultA, resultB].filter((result) => result.ok);
        const failures = [resultA, resultB].filter((result) => !result.ok);
        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);
      });

      const task = await prisma.deliveryTask.findUniqueOrThrow({ where: { id: taskId } });
      expect(task.status).toBe("ASSIGNED");
      expect(await prisma.taskCurrentAssignment.count({ where: { taskId } })).toBe(1);
      expect(await prisma.taskAssignment.count({ where: { taskId } })).toBe(1);
      const events = await prisma.taskEvent.findMany({ where: { taskId, eventType: "TASK_ASSIGNED" } });
      expect(events).toHaveLength(1);
    } finally {
      await connA.client.$disconnect();
      await connB.client.$disconnect();
    }
  });

  it("rejects a concurrent stale reassignment racing against a winning reassignment, with no residue from the loser", async () => {
    const taskId = await createReadyForDispatchTask();
    const seed = await createServiceConnection();
    let originalAssignmentId: string;
    try {
      const initial = await seed.service.assign(taskId, actorUserId, { primaryAssigneeUserId: primaryAId, supportingEmployeeUserIds: [] });
      originalAssignmentId = initial.assignment!.id;
    } finally {
      await seed.client.$disconnect();
    }

    const connA = await createServiceConnection();
    const connB = await createServiceConnection();
    try {
      await withHeldTaskLock(taskId, async (releaseLock) => {
        const reassignA = connA.service
          .reassign(taskId, actorUserId, {
            primaryAssigneeUserId: primaryBId,
            supportingEmployeeUserIds: [],
            reason: "Racing reassignment A.",
            expectedCurrentAssignmentId: originalAssignmentId,
          })
          .then(
            () => ({ ok: true as const }),
            () => ({ ok: false as const }),
          );
        const reassignB = connB.service
          .reassign(taskId, actorUserId, {
            primaryAssigneeUserId: primaryAId,
            supportingEmployeeUserIds: [],
            reason: "Racing reassignment B.",
            expectedCurrentAssignmentId: originalAssignmentId,
          })
          .then(
            () => ({ ok: true as const }),
            () => ({ ok: false as const }),
          );
        await waitForBlockedTaskLocks(2);
        releaseLock();

        const [resultA, resultB] = await Promise.all([reassignA, reassignB]);
        const successes = [resultA, resultB].filter((result) => result.ok);
        const failures = [resultA, resultB].filter((result) => !result.ok);
        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);
      });

      // Exactly one reassignment landed on top of the seed INITIAL — no
      // third row and no residue from the loser.
      expect(await prisma.taskAssignment.count({ where: { taskId } })).toBe(2);
      expect(await prisma.taskCurrentAssignment.count({ where: { taskId } })).toBe(1);
      const reassignEvents = await prisma.taskEvent.findMany({ where: { taskId, eventType: "TASK_REASSIGNED" } });
      expect(reassignEvents).toHaveLength(1);
    } finally {
      await connA.client.$disconnect();
      await connB.client.$disconnect();
    }
  });

  it("the task_current_assignments primary key protects against a duplicate current assignment independent of the application row lock", async () => {
    const taskId = await createReadyForDispatchTask();
    const assignmentOne = await prisma.taskAssignment.create({
      data: { taskId, assignmentType: "INITIAL", primaryAssigneeUserId: primaryAId, actorUserId, note: null },
    });
    const assignmentTwo = await prisma.taskAssignment.create({
      data: {
        taskId,
        assignmentType: "REASSIGNMENT",
        previousAssignmentId: assignmentOne.id,
        primaryAssigneeUserId: primaryBId,
        actorUserId,
        reason: "Direct-insert database-constraint check.",
      },
    });

    await prisma.taskCurrentAssignment.create({
      data: { taskId, currentAssignmentId: assignmentOne.id, primaryAssigneeUserId: primaryAId },
    });

    await expect(
      prisma.taskCurrentAssignment.create({
        data: { taskId, currentAssignmentId: assignmentTwo.id, primaryAssigneeUserId: primaryBId },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(await prisma.taskCurrentAssignment.count({ where: { taskId } })).toBe(1);
    const pointer = await prisma.taskCurrentAssignment.findUniqueOrThrow({ where: { taskId } });
    expect(pointer.currentAssignmentId).toBe(assignmentOne.id);
  });
});
