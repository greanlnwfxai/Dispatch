import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type {
  DeliveryTaskDetailDto as DeliveryTaskDetailContractDto,
  DeliveryTaskSummaryDto as DeliveryTaskSummaryContractDto,
  ListDeliveryTasksResponseBody,
} from "@dispatch/contracts";
import type { DeliveryTaskStatus, DestinationSource, FreeTextFallbackReason } from "@dispatch/shared-types";
import {
  findDuplicateTaskReferences,
  validateDestinationSelection,
  validateGoodsLineInput,
  validateTaskReferenceInput,
  type CreateDeliveryTaskInput,
  type DeliveryTaskDetailRecord,
  type DeliveryTaskItemInput,
  type DeliveryTaskRecord,
  type DestinationSelectionInput,
  type ListDeliveryTasksFilter,
  type TaskReferenceInput,
  type UpdateDeliveryTaskDraftInput,
} from "@dispatch/domain";
import { PrismaCustomerMasterRepository } from "../infrastructure/database/repositories/prisma-customer-master.repository";
import { PrismaCustomerMasterSearchRepository } from "../infrastructure/database/repositories/prisma-customer-master-search.repository";
import { PrismaDeliveryTaskRepository } from "../infrastructure/database/repositories/prisma-delivery-task.repository";
import { PrismaTaskNumberGenerator } from "../infrastructure/database/repositories/prisma-task-number.generator";
import { CreateDeliveryTaskDto } from "./dto/create-delivery-task.dto";
import { DeliveryTaskItemDto } from "./dto/delivery-task-item.dto";
import { ListDeliveryTasksQueryDto } from "./dto/list-delivery-tasks-query.dto";
import { TaskReferenceDto } from "./dto/task-reference.dto";
import { UpdateDeliveryTaskDraftDto } from "./dto/update-delivery-task-draft.dto";

interface DestinationSelectionRequest {
  searchId: string;
  destinationSource: string;
  customerId?: string | null;
  customerDestinationId?: string | null;
  freeTextFallbackReason?: string | null;
  customerName?: string;
  destinationName?: string;
  address?: string;
  contactName?: string | null;
  contactPhone?: string | null;
  deliveryInstructions?: string | null;
  locationReference?: string | null;
  accessNotes?: string | null;
}

/**
 * CreateDeliveryTask / UpdateDeliveryTaskDraft / SubmitDeliveryTask /
 * GetDeliveryTask / ListDeliveryTasks use cases (MVP-02). Business
 * validation is delegated to the pure functions in `@dispatch/domain`;
 * this service only resolves search evidence, loads canonical Master data,
 * and translates results into HTTP-safe outcomes. Every exception message
 * here is generic and internal-safe — no Prisma/SQL/host detail ever
 * reaches the response body.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly deliveryTaskRepository: PrismaDeliveryTaskRepository,
    private readonly customerMasterRepository: PrismaCustomerMasterRepository,
    private readonly customerMasterSearchRepository: PrismaCustomerMasterSearchRepository,
    private readonly taskNumberGenerator: PrismaTaskNumberGenerator,
  ) {}

  async create(actorUserId: string, dto: CreateDeliveryTaskDto): Promise<DeliveryTaskDetailContractDto> {
    const destination = await this.resolveDestinationSelection(actorUserId, dto);
    const items = this.buildItemInputs(dto.items);
    const references = this.buildReferenceInputs(dto.references);

    const input: CreateDeliveryTaskInput = {
      ...destination,
      createdByUserId: actorUserId,
      plannedDeliveryDate: dto.plannedDeliveryDate ? new Date(dto.plannedDeliveryDate) : null,
      items,
      references,
    };

    const taskNumber = await this.taskNumberGenerator.next();
    const created = await this.deliveryTaskRepository.createDraft(input, taskNumber);
    return this.toDetailDto(created);
  }

  async update(
    actorUserId: string,
    taskId: string,
    dto: UpdateDeliveryTaskDraftDto,
  ): Promise<DeliveryTaskDetailContractDto> {
    const existing = await this.deliveryTaskRepository.findById(taskId);
    if (!existing) {
      throw new NotFoundException("Task not found.");
    }
    if (existing.status !== "DRAFT") {
      throw new ConflictException("Only a DRAFT Task may be edited.");
    }

    const wantsDestinationChange =
      dto.destinationSource !== undefined ||
      dto.searchId !== undefined ||
      dto.customerId !== undefined ||
      dto.customerDestinationId !== undefined ||
      dto.freeTextFallbackReason !== undefined ||
      dto.customerName !== undefined ||
      dto.destinationName !== undefined ||
      dto.address !== undefined ||
      dto.contactName !== undefined ||
      dto.contactPhone !== undefined ||
      dto.deliveryInstructions !== undefined ||
      dto.locationReference !== undefined ||
      dto.accessNotes !== undefined;

    let destination: DestinationSelectionInput | undefined;
    if (wantsDestinationChange) {
      if (!dto.destinationSource || !dto.searchId) {
        throw new BadRequestException(
          "destinationSource and searchId are both required when changing destination fields.",
        );
      }
      destination = await this.resolveDestinationSelection(actorUserId, {
        searchId: dto.searchId,
        destinationSource: dto.destinationSource,
        customerId: dto.customerId,
        customerDestinationId: dto.customerDestinationId,
        freeTextFallbackReason: dto.freeTextFallbackReason,
        customerName: dto.customerName,
        destinationName: dto.destinationName,
        address: dto.address,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        deliveryInstructions: dto.deliveryInstructions,
        locationReference: dto.locationReference,
        accessNotes: dto.accessNotes,
      });
    }

    const items = dto.items !== undefined ? this.buildItemInputs(dto.items) : undefined;
    const references = dto.references !== undefined ? this.buildReferenceInputs(dto.references) : undefined;

    const updateInput: UpdateDeliveryTaskDraftInput = {
      taskId,
      updatedByUserId: actorUserId,
      plannedDeliveryDate:
        dto.plannedDeliveryDate === undefined
          ? undefined
          : dto.plannedDeliveryDate
            ? new Date(dto.plannedDeliveryDate)
            : null,
      destination,
      items,
      references,
    };

    const updated = await this.deliveryTaskRepository.updateDraft(updateInput);
    if (!updated) {
      // Lost a race against a concurrent submit — the re-check inside the
      // repository transaction found the Task was no longer DRAFT.
      throw new ConflictException("Only a DRAFT Task may be edited.");
    }
    return this.toDetailDto(updated);
  }

  async findById(taskId: string): Promise<DeliveryTaskDetailContractDto> {
    const task = await this.deliveryTaskRepository.findById(taskId);
    if (!task) {
      throw new NotFoundException("Task not found.");
    }
    return this.toDetailDto(task);
  }

  async list(query: ListDeliveryTasksQueryDto): Promise<ListDeliveryTasksResponseBody> {
    const filter: ListDeliveryTasksFilter = {
      status: query.status,
      taskNumber: query.taskNumber,
      plannedDeliveryDateFrom: query.plannedDeliveryDateFrom ? new Date(query.plannedDeliveryDateFrom) : undefined,
      plannedDeliveryDateTo: query.plannedDeliveryDateTo ? new Date(query.plannedDeliveryDateTo) : undefined,
      page: query.page,
      pageSize: query.pageSize,
    };
    const result = await this.deliveryTaskRepository.list(filter);
    return {
      items: result.items.map((task) => this.toSummaryDto(task)),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async submit(actorUserId: string, taskId: string): Promise<DeliveryTaskDetailContractDto> {
    const result = await this.deliveryTaskRepository.submit({ taskId, actorUserId });
    if (!result.ok) {
      if (result.failureReason === "NOT_FOUND") {
        throw new NotFoundException("Task not found.");
      }
      if (result.failureReason === "NOT_DRAFT") {
        throw new ConflictException("Task is not in DRAFT status.");
      }
      if (result.failureReason === "SEARCH_EVIDENCE_INVALID") {
        // Deliberately identical status/message/shape for every evidence
        // failure mode (missing/foreign/expired/out-of-order/uncovered) —
        // see validateSubmitSearchEvidence in @dispatch/domain for why.
        throw new UnprocessableEntityException({
          message: "Task cannot be submitted: Customer Master search evidence is missing, expired, or invalid.",
          errors: result.validationErrors,
        });
      }
      throw new BadRequestException({
        message: "Task is incomplete and cannot be submitted.",
        errors: result.validationErrors,
      });
    }
    return this.toDetailDto(result.task!);
  }

  /**
   * §4.3 search-first enforcement + §4.4 snapshot authority, applied at the
   * selection boundary (create/PATCH) — expiry/ownership/matched-set are
   * checked here. `PrismaDeliveryTaskRepository.submit` independently
   * re-checks the same evidence (ownership/expiry/chronology/MASTER
   * coverage) against data re-read inside the submit transaction, since a
   * search can expire or a Master destination can be deactivated between
   * DRAFT save and submission — see `validateSubmitSearchEvidence` in
   * `@dispatch/domain`.
   */
  private async resolveDestinationSelection(
    actorUserId: string,
    input: DestinationSelectionRequest,
  ): Promise<DestinationSelectionInput> {
    const search = await this.customerMasterSearchRepository.findById(input.searchId);
    const now = new Date();
    if (!search || search.searchedByUserId !== actorUserId || search.expiresAt <= now) {
      throw new BadRequestException("Invalid or expired Customer Master search reference.");
    }

    let selection: DestinationSelectionInput;

    if (input.destinationSource === "MASTER") {
      if (!input.customerDestinationId) {
        throw new BadRequestException("customerDestinationId is required when destinationSource is MASTER.");
      }
      if (!search.matchedCustomerDestinationIds.includes(input.customerDestinationId)) {
        throw new BadRequestException("Selected Customer Destination was not part of the performed search.");
      }
      const canonical = await this.customerMasterRepository.findActiveDestinationById(input.customerDestinationId);
      if (!canonical) {
        throw new BadRequestException("Selected Customer Destination is not available.");
      }
      selection = {
        destinationSource: "MASTER",
        customerId: canonical.customerId,
        customerDestinationId: canonical.customerDestinationId,
        customerSearchId: input.searchId,
        freeTextFallbackReason: null,
        customerName: canonical.customerName,
        destinationName: canonical.destinationName,
        address: canonical.address,
        contactName: canonical.contactName,
        contactPhone: canonical.contactPhone,
        deliveryInstructions: canonical.deliveryInstructions,
        locationReference: canonical.locationReference,
        accessNotes: canonical.accessNotes,
        customerCodeSnapshot: canonical.customerCode,
        destinationCodeSnapshot: canonical.destinationCode,
      };
    } else if (input.destinationSource === "FREE_TEXT") {
      if (!input.destinationName || !input.address || !input.customerName) {
        throw new BadRequestException("customerName, destinationName, and address are required for FREE_TEXT.");
      }
      if (!input.freeTextFallbackReason) {
        throw new BadRequestException("freeTextFallbackReason is required when destinationSource is FREE_TEXT.");
      }
      selection = {
        destinationSource: "FREE_TEXT",
        customerId: null,
        customerDestinationId: null,
        customerSearchId: input.searchId,
        freeTextFallbackReason: input.freeTextFallbackReason,
        customerName: input.customerName,
        destinationName: input.destinationName,
        address: input.address,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        deliveryInstructions: input.deliveryInstructions ?? null,
        locationReference: input.locationReference ?? null,
        accessNotes: input.accessNotes ?? null,
        customerCodeSnapshot: null,
        destinationCodeSnapshot: null,
      };
    } else {
      throw new BadRequestException("destinationSource must be MASTER or FREE_TEXT.");
    }

    const errors = validateDestinationSelection(selection);
    if (errors.length > 0) {
      throw new BadRequestException({ message: "Invalid destination selection.", errors });
    }

    return selection;
  }

  private buildItemInputs(items: DeliveryTaskItemDto[] | undefined): DeliveryTaskItemInput[] {
    const list: DeliveryTaskItemInput[] = (items ?? []).map((item) => ({
      lineNumber: item.lineNumber,
      description: item.description,
      plannedQuantity: item.plannedQuantity,
      unit: item.unit,
      notes: item.notes ?? null,
    }));

    const seenLineNumbers = new Set<number>();
    for (const item of list) {
      const errors = validateGoodsLineInput(item);
      if (errors.length > 0) {
        throw new BadRequestException({ message: "Invalid goods line.", errors });
      }
      if (seenLineNumbers.has(item.lineNumber)) {
        throw new BadRequestException(`Duplicate lineNumber ${item.lineNumber}.`);
      }
      seenLineNumbers.add(item.lineNumber);
    }
    return list;
  }

  private buildReferenceInputs(references: TaskReferenceDto[] | undefined): TaskReferenceInput[] {
    const list = references ?? [];
    for (const reference of list) {
      const errors = validateTaskReferenceInput(reference);
      if (errors.length > 0) {
        throw new BadRequestException({ message: "Invalid business reference.", errors });
      }
    }
    const duplicates = findDuplicateTaskReferences(list);
    if (duplicates.length > 0) {
      throw new BadRequestException({ message: "Duplicate business reference type/value pair on the same Task.", duplicates });
    }
    return list;
  }

  private toSummaryDto(task: DeliveryTaskRecord): DeliveryTaskSummaryContractDto {
    return {
      id: task.id,
      taskNumber: task.taskNumber,
      status: task.status as DeliveryTaskStatus,
      plannedDeliveryDate: task.plannedDeliveryDate ? task.plannedDeliveryDate.toISOString() : null,
      destinationSource: task.destinationSource as DestinationSource,
      destinationName: task.destinationName,
      customerName: task.customerName,
      createdByUserId: task.createdByUserId,
      createdAt: task.createdAt.toISOString(),
    };
  }

  private toDetailDto(task: DeliveryTaskDetailRecord): DeliveryTaskDetailContractDto {
    return {
      ...this.toSummaryDto(task),
      address: task.address,
      contactName: task.contactName,
      contactPhone: task.contactPhone,
      deliveryInstructions: task.deliveryInstructions,
      locationReference: task.locationReference,
      accessNotes: task.accessNotes,
      customerId: task.customerId,
      customerDestinationId: task.customerDestinationId,
      customerCodeSnapshot: task.customerCodeSnapshot,
      destinationCodeSnapshot: task.destinationCodeSnapshot,
      freeTextFallbackReason: task.freeTextFallbackReason as FreeTextFallbackReason | null,
      submittedAt: task.submittedAt ? task.submittedAt.toISOString() : null,
      updatedByUserId: task.updatedByUserId,
      items: task.items.map((item) => ({
        lineNumber: item.lineNumber,
        description: item.description,
        plannedQuantity: item.plannedQuantity,
        unit: item.unit,
        notes: item.notes,
      })),
      references: task.references.map((reference) => ({
        referenceType: reference.referenceType,
        referenceValue: reference.referenceValue,
      })),
      events: task.events.map((event) => ({
        eventType: event.eventType,
        previousStatus: event.previousStatus as DeliveryTaskStatus | null,
        newStatus: event.newStatus as DeliveryTaskStatus,
        actorUserId: event.actorUserId,
        occurredAt: event.occurredAt.toISOString(),
      })),
    };
  }
}
