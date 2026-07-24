import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  AssignedTaskDetailDto,
  AssignmentCandidateDto,
  AssignmentRecordDto,
  AssignmentHistoryResponseBody,
  CurrentAssignmentResponseBody,
  ListAssignedTasksResponseBody,
  ListAssignmentCandidatesResponseBody,
} from "@dispatch/contracts";
import type { AssignmentValidationError } from "@dispatch/domain";
import {
  validateInitialAssignmentInput,
  validateInitialAssignmentStatus,
  validateReassignmentInput,
  validateReassignmentStatus,
} from "@dispatch/domain";
import { ACTIVE_ASSIGNMENT_WORKLOAD_STATUSES } from "@dispatch/shared-types";
import { PrismaService } from "../infrastructure/database/prisma/prisma.service";
import { AssignTaskDto, ListAssignedTasksQueryDto, ListAssignmentCandidatesQueryDto, ReassignTaskDto } from "./dto/assignment.dto";

const ASSIGNMENT_INCLUDE = {
  primaryAssignee: { select: { id: true, displayName: true } },
  actor: { select: { id: true, displayName: true } },
  supportingEmployees: { include: { supportUser: { select: { id: true, displayName: true } } } },
} satisfies Prisma.TaskAssignmentInclude;

type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];
type AssignmentWithInclude = Prisma.TaskAssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

type AssignResult =
  | { status: "OK" }
  | { status: "NOT_FOUND" }
  | { status: "INVALID_STATE"; errors: AssignmentValidationError[] }
  | { status: "VALIDATION"; errors: AssignmentValidationError[] };

type ReassignResult =
  | { status: "OK" }
  | { status: "NOT_FOUND" }
  | { status: "INVALID_STATE"; errors: AssignmentValidationError[] }
  | { status: "VALIDATION"; errors: AssignmentValidationError[] }
  | { status: "STALE" };

const INTERNAL_DELIVERY_EMPLOYEE_ROLE_CODE = "INTERNAL_DELIVERY_EMPLOYEE";

/**
 * MVP-04 — Delivery Task Assignment (BDR-ASSIGN-001 through
 * BDR-ASSIGN-005). Every mutating command locks the `delivery_tasks` row
 * (`SELECT ... FOR UPDATE`) before reading task status or the current
 * assignment pointer, re-validates state under that lock, and writes the
 * new TaskAssignment/TaskAssignmentSupport/TaskCurrentAssignment/TaskEvent
 * rows atomically — mirroring PreparationService's established pattern.
 * The `task_current_assignments` primary key on `taskId` is a database-
 * level backstop for "one current assignment per task" independent of the
 * row lock; a `P2002` unique-constraint violation on that insert is caught
 * and translated to a 409, never surfaced as a raw database error.
 */
@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async listCandidates(query: ListAssignmentCandidatesQueryDto): Promise<ListAssignmentCandidatesResponseBody> {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(query.pageSize) || 20)));
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      isActive: true,
      roleAssignments: { some: { role: { code: INTERNAL_DELIVERY_EMPLOYEE_ROLE_CODE } } },
      ...(search ? { displayName: { contains: search, mode: "insensitive" } } : {}),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    const workloadCounts = await this.countActiveWorkload(users.map((user) => user.id));
    const items: AssignmentCandidateDto[] = users.map((user) => ({
      userId: user.id,
      displayName: user.displayName,
      activeTaskCount: workloadCounts.get(user.id) ?? 0,
    }));
    return { items, page, pageSize, total };
  }

  async getCurrentAssignment(taskId: string): Promise<CurrentAssignmentResponseBody> {
    const task = await this.prisma.deliveryTask.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new NotFoundException("Task not found.");
    const pointer = await this.prisma.taskCurrentAssignment.findUnique({
      where: { taskId },
      include: { currentAssignment: { include: ASSIGNMENT_INCLUDE } },
    });
    return { assignment: pointer ? this.toAssignmentRecordDto(pointer.currentAssignment) : null };
  }

  async getAssignmentHistory(taskId: string): Promise<AssignmentHistoryResponseBody> {
    const task = await this.prisma.deliveryTask.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new NotFoundException("Task not found.");
    const items = await this.prisma.taskAssignment.findMany({
      where: { taskId },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return { items: items.map((item) => this.toAssignmentRecordDto(item)) };
  }

  async assign(taskId: string, actorUserId: string, dto: AssignTaskDto): Promise<CurrentAssignmentResponseBody> {
    const supportingIds = [...new Set(dto.supportingEmployeeUserIds)];
    const shapeErrors = validateInitialAssignmentInput({
      primaryAssigneeUserId: dto.primaryAssigneeUserId,
      supportingEmployeeUserIds: dto.supportingEmployeeUserIds,
      note: dto.note,
    });
    if (shapeErrors.length > 0) throw new BadRequestException({ message: "Assignment input is invalid.", errors: shapeErrors });

    let result: AssignResult;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        if (!(await this.lockTask(tx, taskId))) return { status: "NOT_FOUND" };
        const task = await tx.deliveryTask.findUnique({ where: { id: taskId }, select: { status: true } });
        if (!task) return { status: "NOT_FOUND" };

        const statusErrors = validateInitialAssignmentStatus(task.status);
        const existingPointer = await tx.taskCurrentAssignment.findUnique({ where: { taskId }, select: { taskId: true } });
        if (statusErrors.length > 0 || existingPointer) {
          return {
            status: "INVALID_STATE",
            errors:
              statusErrors.length > 0
                ? statusErrors
                : [{ code: "TASK_ALREADY_ASSIGNED", message: "Task already has a current assignment." }],
          };
        }

        const personnelErrors = await this.validatePersonnel(tx, dto.primaryAssigneeUserId, supportingIds);
        if (personnelErrors.length > 0) return { status: "VALIDATION", errors: personnelErrors };

        const assignment = await tx.taskAssignment.create({
          data: {
            taskId,
            assignmentType: "INITIAL",
            primaryAssigneeUserId: dto.primaryAssigneeUserId,
            actorUserId,
            note: dto.note?.trim() || null,
            supportingEmployees: { create: supportingIds.map((supportUserId) => ({ supportUserId })) },
          },
        });
        await tx.taskCurrentAssignment.create({
          data: { taskId, currentAssignmentId: assignment.id, primaryAssigneeUserId: dto.primaryAssigneeUserId },
        });
        await tx.deliveryTask.update({ where: { id: taskId }, data: { status: "ASSIGNED", updatedByUserId: actorUserId } });
        await tx.taskEvent.create({
          data: {
            taskId,
            eventType: "TASK_ASSIGNED",
            previousStatus: "READY_FOR_DISPATCH",
            newStatus: "ASSIGNED",
            actorUserId,
            metadata: {
              assignmentId: assignment.id,
              primaryAssigneeUserId: dto.primaryAssigneeUserId,
              supportingEmployeeCount: supportingIds.length,
            },
          },
        });
        return { status: "OK" };
      });
    } catch (err) {
      throw this.translateUniqueConstraintConflict(err, "Task already has a current assignment.");
    }

    if (result.status === "NOT_FOUND") throw new NotFoundException("Task not found.");
    if (result.status === "VALIDATION") throw new BadRequestException({ message: "Assignment input is invalid.", errors: result.errors });
    if (result.status === "INVALID_STATE") {
      throw new ConflictException({ message: "Task cannot be assigned in its current state.", errors: result.errors });
    }
    return this.getCurrentAssignment(taskId);
  }

  async reassign(taskId: string, actorUserId: string, dto: ReassignTaskDto): Promise<CurrentAssignmentResponseBody> {
    const supportingIds = [...new Set(dto.supportingEmployeeUserIds)];
    const shapeErrors = validateReassignmentInput({
      primaryAssigneeUserId: dto.primaryAssigneeUserId,
      supportingEmployeeUserIds: dto.supportingEmployeeUserIds,
      reason: dto.reason,
      expectedCurrentAssignmentId: dto.expectedCurrentAssignmentId,
    });
    if (shapeErrors.length > 0) throw new BadRequestException({ message: "Reassignment input is invalid.", errors: shapeErrors });

    let result: ReassignResult;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        if (!(await this.lockTask(tx, taskId))) return { status: "NOT_FOUND" };
        const task = await tx.deliveryTask.findUnique({ where: { id: taskId }, select: { status: true } });
        if (!task) return { status: "NOT_FOUND" };

        const statusErrors = validateReassignmentStatus(task.status);
        if (statusErrors.length > 0) return { status: "INVALID_STATE", errors: statusErrors };

        const current = await tx.taskCurrentAssignment.findUnique({ where: { taskId } });
        if (!current) {
          return {
            status: "INVALID_STATE",
            errors: [{ code: "NO_CURRENT_ASSIGNMENT", message: "Task has no current assignment to reassign." }],
          };
        }
        if (current.currentAssignmentId !== dto.expectedCurrentAssignmentId) {
          return { status: "STALE" };
        }

        const personnelErrors = await this.validatePersonnel(tx, dto.primaryAssigneeUserId, supportingIds);
        if (personnelErrors.length > 0) return { status: "VALIDATION", errors: personnelErrors };

        const assignment = await tx.taskAssignment.create({
          data: {
            taskId,
            assignmentType: "REASSIGNMENT",
            previousAssignmentId: current.currentAssignmentId,
            primaryAssigneeUserId: dto.primaryAssigneeUserId,
            actorUserId,
            reason: dto.reason.trim(),
            supportingEmployees: { create: supportingIds.map((supportUserId) => ({ supportUserId })) },
          },
        });
        await tx.taskCurrentAssignment.update({
          where: { taskId },
          data: { currentAssignmentId: assignment.id, primaryAssigneeUserId: dto.primaryAssigneeUserId },
        });
        await tx.taskEvent.create({
          data: {
            taskId,
            eventType: "TASK_REASSIGNED",
            previousStatus: "ASSIGNED",
            newStatus: "ASSIGNED",
            actorUserId,
            metadata: {
              assignmentId: assignment.id,
              previousAssignmentId: current.currentAssignmentId,
              previousPrimaryAssigneeUserId: current.primaryAssigneeUserId,
              newPrimaryAssigneeUserId: dto.primaryAssigneeUserId,
            },
          },
        });
        return { status: "OK" };
      });
    } catch (err) {
      throw this.translateUniqueConstraintConflict(err, "The assignment has changed since it was loaded.");
    }

    if (result.status === "NOT_FOUND") throw new NotFoundException("Task not found.");
    if (result.status === "VALIDATION") throw new BadRequestException({ message: "Reassignment input is invalid.", errors: result.errors });
    if (result.status === "INVALID_STATE") {
      throw new ConflictException({ message: "Task cannot be reassigned in its current state.", errors: result.errors });
    }
    if (result.status === "STALE") {
      throw new ConflictException({
        message: "The assignment has changed since it was loaded. Refresh and try again.",
        code: "STALE_ASSIGNMENT",
      });
    }
    return this.getCurrentAssignment(taskId);
  }

  async listMyAssignedTasks(principalUserId: string, query: ListAssignedTasksQueryDto): Promise<ListAssignedTasksResponseBody> {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(query.pageSize) || 20)));
    const where: Prisma.TaskCurrentAssignmentWhereInput = { primaryAssigneeUserId: principalUserId };
    const [pointers, total] = await Promise.all([
      this.prisma.taskCurrentAssignment.findMany({
        where,
        include: {
          task: { select: { id: true, taskNumber: true, status: true, destinationName: true, plannedDeliveryDate: true } },
          currentAssignment: { select: { createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.taskCurrentAssignment.count({ where }),
    ]);
    return {
      items: pointers.map((pointer) => ({
        id: pointer.task.id,
        taskNumber: pointer.task.taskNumber,
        status: pointer.task.status,
        destinationName: pointer.task.destinationName,
        plannedDeliveryDate: pointer.task.plannedDeliveryDate ? this.toDateOnly(pointer.task.plannedDeliveryDate) : null,
        assignedAt: pointer.currentAssignment.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }

  /**
   * Single scoped query: a supporting-only or unrelated employee gets
   * exactly the same 404 as a nonexistent Task id — record scope is
   * enforced at the query, not by fetch-then-check (BR-SECURITY-004).
   */
  async getMyAssignedTaskDetail(principalUserId: string, taskId: string): Promise<AssignedTaskDetailDto> {
    const pointer = await this.prisma.taskCurrentAssignment.findFirst({
      where: { taskId, primaryAssigneeUserId: principalUserId },
      include: {
        task: true,
        currentAssignment: { include: { supportingEmployees: { include: { supportUser: { select: { id: true, displayName: true } } } } } },
      },
    });
    if (!pointer) throw new NotFoundException("Assigned task not found.");
    const preparation = await this.prisma.preparationRecord.findUnique({ where: { taskId }, select: { readyConfirmedAt: true } });
    return {
      id: pointer.task.id,
      taskNumber: pointer.task.taskNumber,
      status: pointer.task.status,
      destinationName: pointer.task.destinationName,
      plannedDeliveryDate: pointer.task.plannedDeliveryDate ? this.toDateOnly(pointer.task.plannedDeliveryDate) : null,
      assignedAt: pointer.currentAssignment.createdAt.toISOString(),
      address: pointer.task.address,
      contactName: pointer.task.contactName,
      contactPhone: pointer.task.contactPhone,
      deliveryInstructions: pointer.task.deliveryInstructions,
      locationReference: pointer.task.locationReference,
      accessNotes: pointer.task.accessNotes,
      preparationReady: preparation?.readyConfirmedAt != null,
      supportingEmployees: pointer.currentAssignment.supportingEmployees.map((support) => ({
        userId: support.supportUser.id,
        displayName: support.supportUser.displayName,
      })),
    };
  }

  private async countActiveWorkload(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const grouped = await this.prisma.taskCurrentAssignment.groupBy({
      by: ["primaryAssigneeUserId"],
      where: {
        primaryAssigneeUserId: { in: userIds },
        task: { status: { in: [...ACTIVE_ASSIGNMENT_WORKLOAD_STATUSES] } },
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.primaryAssigneeUserId, row._count._all]));
  }

  /**
   * Cross-entity checks Postgres cannot express as a single-table CHECK:
   * primary assignee and every supporting employee must reference an
   * existing active user currently holding INTERNAL_DELIVERY_EMPLOYEE.
   * Re-run fresh under the task lock on every call — role/active-status can
   * change between requests.
   */
  private async validatePersonnel(
    tx: Tx,
    primaryAssigneeUserId: string,
    supportingEmployeeUserIds: string[],
  ): Promise<AssignmentValidationError[]> {
    const requestedIds = [...new Set([primaryAssigneeUserId, ...supportingEmployeeUserIds])];
    const validUsers = await tx.user.findMany({
      where: {
        id: { in: requestedIds },
        isActive: true,
        roleAssignments: { some: { role: { code: INTERNAL_DELIVERY_EMPLOYEE_ROLE_CODE } } },
      },
      select: { id: true },
    });
    const validIds = new Set(validUsers.map((user) => user.id));
    const errors: AssignmentValidationError[] = [];
    if (!validIds.has(primaryAssigneeUserId)) {
      errors.push({
        code: "PRIMARY_ASSIGNEE_INVALID",
        message: "Primary assignee must be an active user currently holding INTERNAL_DELIVERY_EMPLOYEE.",
      });
    }
    if (supportingEmployeeUserIds.some((supportId) => !validIds.has(supportId))) {
      errors.push({
        code: "SUPPORTING_EMPLOYEE_INVALID",
        message: "Every supporting employee must be an active user currently holding INTERNAL_DELIVERY_EMPLOYEE.",
      });
    }
    return errors;
  }

  private async lockTask(tx: Tx, taskId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "delivery_tasks" WHERE "id" = ${taskId}::uuid FOR UPDATE
    `;
    return rows.length === 1;
  }

  private translateUniqueConstraintConflict(err: unknown, message: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException({ message, code: "TASK_ALREADY_ASSIGNED" });
    }
    return err;
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toAssignmentRecordDto(assignment: AssignmentWithInclude): AssignmentRecordDto {
    return {
      id: assignment.id,
      taskId: assignment.taskId,
      assignmentType: assignment.assignmentType,
      primaryAssignee: { userId: assignment.primaryAssignee.id, displayName: assignment.primaryAssignee.displayName },
      supportingEmployees: assignment.supportingEmployees.map((support) => ({
        userId: support.supportUser.id,
        displayName: support.supportUser.displayName,
      })),
      actor: { userId: assignment.actor.id, displayName: assignment.actor.displayName },
      note: assignment.note,
      reason: assignment.reason,
      previousAssignmentId: assignment.previousAssignmentId,
      createdAt: assignment.createdAt.toISOString(),
    };
  }
}
