import { PrismaDeliveryTaskRepository } from "./prisma-delivery-task.repository";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Repository-level coverage for the blocking-review-finding fix (see
 * docs/CTO_SUMMARY_MVP_02.md "Issues Found and Fixed"): submit() must
 * re-read and revalidate Customer Master search evidence inside the same
 * transaction as the status transition, and must not perform any write
 * when that revalidation fails. Uses a fully mocked `tx` client (no real
 * database) so these atomicity assertions run fast and without Docker.
 */

const TASK_ID = "55555555-5555-5555-5555-555555555555";
const ACTOR_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "99999999-9999-9999-9999-999999999999";
const SEARCH_ID = "22222222-2222-2222-2222-222222222222";
const DESTINATION_ID = "44444444-4444-4444-4444-444444444444";

function baseTask(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    status: "DRAFT",
    destinationSource: "FREE_TEXT",
    customerId: null,
    customerDestinationId: null,
    customerSearchId: SEARCH_ID,
    freeTextFallbackReason: "AD_HOC_DESTINATION",
    plannedDeliveryDate: new Date("2026-08-01T00:00:00Z"),
    destinationName: "Ad hoc destination",
    address: "Ad hoc address",
    items: [{ plannedQuantity: "1", unit: "BOX", description: "Boxes" }],
    ...overrides,
  };
}

function validSearchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SEARCH_ID,
    searchedByUserId: ACTOR_ID,
    searchedAt: new Date(Date.now() - 1000),
    expiresAt: new Date(Date.now() + 60_000),
    matchedCustomerDestinationIds: [] as string[],
    ...overrides,
  };
}

function buildRepository(task: unknown, search: unknown, activeDestination: unknown = null) {
  const tx = {
    deliveryTask: {
      findUnique: jest.fn().mockResolvedValue(task),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue(task ? [{ id: TASK_ID }] : []),
    customerMasterSearch: {
      findUnique: jest.fn().mockResolvedValue(search),
    },
    customerDestination: {
      findFirst: jest.fn().mockResolvedValue(activeDestination),
    },
    taskEvent: {
      create: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const repository = new PrismaDeliveryTaskRepository(prisma);
  return { repository, tx };
}

describe("PrismaDeliveryTaskRepository.submit — search evidence revalidation (atomicity)", () => {
  it("rejects and performs no write when search evidence has expired", async () => {
    const { repository, tx } = buildRepository(baseTask(), validSearchRow({ expiresAt: new Date(Date.now() - 1000) }));
    const result = await repository.submit({ taskId: TASK_ID, actorUserId: ACTOR_ID });
    expect(result).toEqual({
      ok: false,
      failureReason: "SEARCH_EVIDENCE_INVALID",
      validationErrors: [{ code: "SEARCH_EVIDENCE_INVALID", message: expect.any(String) }],
    });
    expect(tx.deliveryTask.update).not.toHaveBeenCalled();
    expect(tx.taskEvent.create).not.toHaveBeenCalled();
  });

  it("rejects and performs no write when search evidence belongs to a different user", async () => {
    const { repository, tx } = buildRepository(baseTask(), validSearchRow({ searchedByUserId: OTHER_USER_ID }));
    const result = await repository.submit({ taskId: TASK_ID, actorUserId: ACTOR_ID });
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("SEARCH_EVIDENCE_INVALID");
    expect(tx.deliveryTask.update).not.toHaveBeenCalled();
    expect(tx.taskEvent.create).not.toHaveBeenCalled();
  });

  it("rejects and performs no write when no search evidence record exists for the Task's searchId", async () => {
    const { repository, tx } = buildRepository(baseTask(), null);
    const result = await repository.submit({ taskId: TASK_ID, actorUserId: ACTOR_ID });
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("SEARCH_EVIDENCE_INVALID");
    expect(tx.deliveryTask.update).not.toHaveBeenCalled();
    expect(tx.taskEvent.create).not.toHaveBeenCalled();
  });

  it("rejects and performs no write for a MASTER Task whose destination is not covered by the re-read search evidence", async () => {
    const task = baseTask({
      destinationSource: "MASTER",
      customerId: "33333333-3333-3333-3333-333333333333",
      customerDestinationId: DESTINATION_ID,
      freeTextFallbackReason: null,
    });
    const { repository, tx } = buildRepository(task, validSearchRow({ matchedCustomerDestinationIds: [] }), {
      id: DESTINATION_ID,
    });
    const result = await repository.submit({ taskId: TASK_ID, actorUserId: ACTOR_ID });
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("SEARCH_EVIDENCE_INVALID");
    expect(tx.deliveryTask.update).not.toHaveBeenCalled();
    expect(tx.taskEvent.create).not.toHaveBeenCalled();
  });

  it("rejects and performs no write for a MASTER Task whose destination is no longer an active Master record", async () => {
    const task = baseTask({
      destinationSource: "MASTER",
      customerId: "33333333-3333-3333-3333-333333333333",
      customerDestinationId: DESTINATION_ID,
      freeTextFallbackReason: null,
    });
    const { repository, tx } = buildRepository(
      task,
      validSearchRow({ matchedCustomerDestinationIds: [DESTINATION_ID] }),
      null, // no longer active
    );
    const result = await repository.submit({ taskId: TASK_ID, actorUserId: ACTOR_ID });
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("SEARCH_EVIDENCE_INVALID");
    expect(tx.deliveryTask.update).not.toHaveBeenCalled();
  });

  it("submits and writes exactly once when search evidence and MASTER coverage are valid", async () => {
    const task = baseTask({
      destinationSource: "MASTER",
      customerId: "33333333-3333-3333-3333-333333333333",
      customerDestinationId: DESTINATION_ID,
      freeTextFallbackReason: null,
    });
    const search = validSearchRow({ matchedCustomerDestinationIds: [DESTINATION_ID] });
    const { repository, tx } = buildRepository(task, search, { id: DESTINATION_ID });
    (tx.deliveryTask.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      ...task,
      status: "WAITING_PREPARATION",
      submittedAt: new Date(),
      items: [],
      references: [],
      events: [],
    });

    const result = await repository.submit({ taskId: TASK_ID, actorUserId: ACTOR_ID });

    expect(result.ok).toBe(true);
    expect(tx.deliveryTask.update).toHaveBeenCalledTimes(1);
    expect(tx.deliveryTask.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "WAITING_PREPARATION" }) }),
    );
    expect(tx.taskEvent.create).toHaveBeenCalledTimes(1);
  });
});
