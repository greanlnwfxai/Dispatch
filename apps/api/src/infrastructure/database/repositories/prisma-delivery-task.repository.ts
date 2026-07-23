import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  DeliveryTask,
  DeliveryTaskItem,
  DestinationSource as PrismaDestinationSource,
  FreeTextFallbackReason as PrismaFreeTextFallbackReason,
  TaskEvent,
  TaskReference,
} from "@prisma/client";
import {
  validateDeliveryTaskSubmission,
  validateSubmitSearchEvidence,
  type CreateDeliveryTaskInput,
  type DeliveryTaskDetailRecord,
  type DeliveryTaskItemRecord,
  type DeliveryTaskRecord,
  type DeliveryTaskRepository,
  type DeliveryTaskSubmissionSnapshot,
  type ListDeliveryTasksFilter,
  type ListDeliveryTasksResult,
  type SubmitDeliveryTaskResult,
  type TaskEventRecord,
  type TaskReferenceRecord,
  type UpdateDeliveryTaskDraftInput,
} from "@dispatch/domain";
import { PrismaService } from "../prisma/prisma.service";

const TASK_DETAIL_INCLUDE = {
  items: { orderBy: { lineNumber: "asc" } },
  references: { orderBy: { createdAt: "asc" } },
  events: { orderBy: { occurredAt: "asc" } },
} satisfies Prisma.DeliveryTaskInclude;

type DeliveryTaskWithDetail = DeliveryTask & {
  items: DeliveryTaskItem[];
  references: TaskReference[];
  events: TaskEvent[];
};

type DeliveryTaskTransactionClient = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

/**
 * Delivery Task persistence adapter (MVP-02). `createDraft` persists the
 * Task + items + references + creation TaskEvent in a single transaction.
 * `updateDraft` and `submit` both acquire a PostgreSQL row lock on the
 * target Task before reading status or business data, then re-read the
 * locked row inside the same transaction. That serializes edit/submit and
 * submit/submit races so a competing transaction observes the latest
 * committed status before any draft-only write can occur. `submit` also
 * re-reads items and Customer Master search evidence under that lock, runs
 * `validateSubmitSearchEvidence` (ownership, expiry, chronology, and — for
 * MASTER — re-verified destination coverage against the re-read search and
 * an active-Master re-check) followed by `validateDeliveryTaskSubmission`
 * (VR-TASK-001a), and only then transitions status + appends one TaskEvent.
 * No partial mutation occurs on failed validation or stale state. The
 * already-stored Historical Destination Snapshot is never rewritten here;
 * the active-Master re-check is existence-only.
 */
@Injectable()
export class PrismaDeliveryTaskRepository implements DeliveryTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createDraft(input: CreateDeliveryTaskInput, taskNumber: string): Promise<DeliveryTaskDetailRecord> {
    const now = new Date();
    const created = await this.prisma.deliveryTask.create({
      data: {
        taskNumber,
        plannedDeliveryDate: input.plannedDeliveryDate,
        createdByUserId: input.createdByUserId,
        updatedByUserId: input.createdByUserId,
        destinationSource: input.destinationSource as PrismaDestinationSource,
        customerId: input.customerId,
        customerDestinationId: input.customerDestinationId,
        customerSearchId: input.customerSearchId,
        freeTextFallbackReason: input.freeTextFallbackReason as PrismaFreeTextFallbackReason | null,
        customerName: input.customerName,
        destinationName: input.destinationName,
        address: input.address,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        deliveryInstructions: input.deliveryInstructions,
        locationReference: input.locationReference,
        accessNotes: input.accessNotes,
        customerCodeSnapshot: input.customerCodeSnapshot,
        destinationCodeSnapshot: input.destinationCodeSnapshot,
        snapshotCreatedAt: now,
        items: {
          create: input.items.map((item) => ({
            lineNumber: item.lineNumber,
            description: item.description,
            plannedQuantity: new Prisma.Decimal(item.plannedQuantity),
            unit: item.unit,
            notes: item.notes,
          })),
        },
        references: {
          create: input.references.map((reference) => ({
            referenceType: reference.referenceType,
            referenceValue: reference.referenceValue,
          })),
        },
        events: {
          create: {
            eventType: "TASK_CREATED",
            previousStatus: null,
            newStatus: "DRAFT",
            actorUserId: input.createdByUserId,
          },
        },
      },
      include: TASK_DETAIL_INCLUDE,
    });

    return this.toDetailRecord(created);
  }

  async findById(id: string): Promise<DeliveryTaskDetailRecord | null> {
    const task = await this.prisma.deliveryTask.findUnique({ where: { id }, include: TASK_DETAIL_INCLUDE });
    return task ? this.toDetailRecord(task) : null;
  }

  async list(filter: ListDeliveryTasksFilter): Promise<ListDeliveryTasksResult> {
    const where: Prisma.DeliveryTaskWhereInput = {};
    if (filter.status) {
      where.status = filter.status as DeliveryTask["status"];
    }
    if (filter.taskNumber) {
      where.taskNumber = { contains: filter.taskNumber, mode: "insensitive" };
    }
    if (filter.plannedDeliveryDateFrom || filter.plannedDeliveryDateTo) {
      where.plannedDeliveryDate = {
        ...(filter.plannedDeliveryDateFrom ? { gte: filter.plannedDeliveryDateFrom } : {}),
        ...(filter.plannedDeliveryDateTo ? { lte: filter.plannedDeliveryDateTo } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.deliveryTask.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.deliveryTask.count({ where }),
    ]);

    return { items: items.map((task) => this.toRecord(task)), total };
  }

  async updateDraft(input: UpdateDeliveryTaskDraftInput): Promise<DeliveryTaskDetailRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockTaskRow(tx, input.taskId);
      if (!locked) {
        return null;
      }

      const existing = await tx.deliveryTask.findUnique({ where: { id: input.taskId } });
      if (!existing || existing.status !== "DRAFT") {
        return null;
      }

      const data: Prisma.DeliveryTaskUncheckedUpdateInput = { updatedByUserId: input.updatedByUserId };

      if (input.plannedDeliveryDate !== undefined) {
        data.plannedDeliveryDate = input.plannedDeliveryDate;
      }

      if (input.destination) {
        const destination = input.destination;
        data.destinationSource = destination.destinationSource as PrismaDestinationSource;
        data.customerId = destination.customerId;
        data.customerDestinationId = destination.customerDestinationId;
        data.customerSearchId = destination.customerSearchId;
        data.freeTextFallbackReason = destination.freeTextFallbackReason as PrismaFreeTextFallbackReason | null;
        data.customerName = destination.customerName;
        data.destinationName = destination.destinationName;
        data.address = destination.address;
        data.contactName = destination.contactName;
        data.contactPhone = destination.contactPhone;
        data.deliveryInstructions = destination.deliveryInstructions;
        data.locationReference = destination.locationReference;
        data.accessNotes = destination.accessNotes;
        data.customerCodeSnapshot = destination.customerCodeSnapshot;
        data.destinationCodeSnapshot = destination.destinationCodeSnapshot;
        data.snapshotCreatedAt = new Date();
      }

      await tx.deliveryTask.update({ where: { id: input.taskId }, data });

      if (input.items) {
        await tx.deliveryTaskItem.deleteMany({ where: { taskId: input.taskId } });
        if (input.items.length > 0) {
          await tx.deliveryTaskItem.createMany({
            data: input.items.map((item) => ({
              taskId: input.taskId,
              lineNumber: item.lineNumber,
              description: item.description,
              plannedQuantity: new Prisma.Decimal(item.plannedQuantity),
              unit: item.unit,
              notes: item.notes,
            })),
          });
        }
      }

      if (input.references) {
        await tx.taskReference.deleteMany({ where: { taskId: input.taskId } });
        if (input.references.length > 0) {
          await tx.taskReference.createMany({
            data: input.references.map((reference) => ({
              taskId: input.taskId,
              referenceType: reference.referenceType,
              referenceValue: reference.referenceValue,
            })),
          });
        }
      }

      await tx.taskEvent.create({
        data: {
          taskId: input.taskId,
          eventType: "TASK_UPDATED",
          previousStatus: "DRAFT",
          newStatus: "DRAFT",
          actorUserId: input.updatedByUserId,
        },
      });

      const updated = await tx.deliveryTask.findUnique({ where: { id: input.taskId }, include: TASK_DETAIL_INCLUDE });
      return updated ? this.toDetailRecord(updated) : null;
    });
  }

  async submit(input: { taskId: string; actorUserId: string }): Promise<SubmitDeliveryTaskResult> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockTaskRow(tx, input.taskId);
      if (!locked) {
        return { ok: false, failureReason: "NOT_FOUND" };
      }

      const task = await tx.deliveryTask.findUnique({ where: { id: input.taskId }, include: { items: true } });
      if (!task) {
        return { ok: false, failureReason: "NOT_FOUND" };
      }
      if (task.status !== "DRAFT") {
        return { ok: false, failureReason: "NOT_DRAFT" };
      }

      const now = new Date();

      const search = await tx.customerMasterSearch.findUnique({ where: { id: task.customerSearchId } });

      let activeMasterDestinationFound = false;
      if (task.destinationSource === "MASTER" && task.customerDestinationId) {
        const activeDestination = await tx.customerDestination.findFirst({
          where: { id: task.customerDestinationId, isActive: true, customer: { isActive: true } },
        });
        activeMasterDestinationFound = activeDestination !== null;
      }

      const searchEvidenceErrors = validateSubmitSearchEvidence({
        now,
        actorUserId: input.actorUserId,
        destinationSource: task.destinationSource,
        customerDestinationId: task.customerDestinationId,
        search: search
          ? {
              searchedByUserId: search.searchedByUserId,
              searchedAt: search.searchedAt,
              expiresAt: search.expiresAt,
              matchedCustomerDestinationIds: search.matchedCustomerDestinationIds,
            }
          : null,
        activeMasterDestinationFound,
      });
      if (searchEvidenceErrors.length > 0) {
        return { ok: false, failureReason: "SEARCH_EVIDENCE_INVALID", validationErrors: searchEvidenceErrors };
      }

      const snapshot: DeliveryTaskSubmissionSnapshot = {
        status: task.status,
        plannedDeliveryDate: task.plannedDeliveryDate,
        destinationSource: task.destinationSource,
        destinationName: task.destinationName,
        address: task.address,
        customerSearchId: task.customerSearchId,
        freeTextFallbackReason: task.freeTextFallbackReason,
        items: task.items.map((item) => ({
          plannedQuantity: item.plannedQuantity.toString(),
          unit: item.unit,
          description: item.description,
        })),
      };

      const validationErrors = validateDeliveryTaskSubmission(snapshot);
      if (validationErrors.length > 0) {
        return { ok: false, failureReason: "INCOMPLETE", validationErrors };
      }

      await tx.deliveryTask.update({
        where: { id: input.taskId },
        data: {
          status: "WAITING_PREPARATION",
          submittedAt: now,
          updatedByUserId: input.actorUserId,
        },
      });

      await tx.taskEvent.create({
        data: {
          taskId: input.taskId,
          eventType: "TASK_SUBMITTED",
          previousStatus: "DRAFT",
          newStatus: "WAITING_PREPARATION",
          actorUserId: input.actorUserId,
        },
      });

      const updated = await tx.deliveryTask.findUniqueOrThrow({
        where: { id: input.taskId },
        include: TASK_DETAIL_INCLUDE,
      });
      return { ok: true, task: this.toDetailRecord(updated) };
    });
  }

  private async lockTaskRow(tx: DeliveryTaskTransactionClient, taskId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "delivery_tasks"
      WHERE "id" = ${taskId}::uuid
      FOR UPDATE
    `;
    return rows.length === 1;
  }

  private toRecord(task: DeliveryTask): DeliveryTaskRecord {
    return {
      id: task.id,
      taskNumber: task.taskNumber,
      status: task.status,
      plannedDeliveryDate: task.plannedDeliveryDate,
      createdByUserId: task.createdByUserId,
      updatedByUserId: task.updatedByUserId,
      submittedAt: task.submittedAt,
      destinationSource: task.destinationSource,
      customerId: task.customerId,
      customerDestinationId: task.customerDestinationId,
      customerSearchId: task.customerSearchId,
      freeTextFallbackReason: task.freeTextFallbackReason,
      customerName: task.customerName,
      destinationName: task.destinationName,
      address: task.address,
      contactName: task.contactName,
      contactPhone: task.contactPhone,
      deliveryInstructions: task.deliveryInstructions,
      locationReference: task.locationReference,
      accessNotes: task.accessNotes,
      customerCodeSnapshot: task.customerCodeSnapshot,
      destinationCodeSnapshot: task.destinationCodeSnapshot,
      snapshotCreatedAt: task.snapshotCreatedAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private toDetailRecord(task: DeliveryTaskWithDetail): DeliveryTaskDetailRecord {
    return {
      ...this.toRecord(task),
      items: task.items.map((item): DeliveryTaskItemRecord => ({
        id: item.id,
        taskId: item.taskId,
        lineNumber: item.lineNumber,
        description: item.description,
        plannedQuantity: item.plannedQuantity.toString(),
        unit: item.unit,
        notes: item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      references: task.references.map((reference): TaskReferenceRecord => ({
        id: reference.id,
        taskId: reference.taskId,
        referenceType: reference.referenceType,
        referenceValue: reference.referenceValue,
        createdAt: reference.createdAt,
      })),
      events: task.events.map((event): TaskEventRecord => ({
        id: event.id,
        taskId: event.taskId,
        eventType: event.eventType,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        actorUserId: event.actorUserId,
        occurredAt: event.occurredAt,
        metadata: event.metadata as Record<string, unknown> | null,
      })),
    };
  }
}
