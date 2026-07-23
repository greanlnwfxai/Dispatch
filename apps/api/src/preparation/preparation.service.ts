import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  ListPreparationCorrectionsResponseBody,
  PreparationDetailDto,
  PreparationEvidenceDto,
} from "@dispatch/contracts";
import {
  validatePostTransitDiscrepancyStatus,
  validatePreparationCorrectionInput,
  validatePreparationCorrectionReviewInput,
  validatePreparationIssueInput,
  validatePreparationIssueResolveInput,
  validatePreparationReady,
  validatePreparationStart,
  validatePreparationUpdate,
} from "@dispatch/domain";
import { PrismaService } from "../infrastructure/database/prisma/prisma.service";
import {
  CreatePreparationCorrectionDto,
  CreatePreparationDiscrepancyReportDto,
  CreatePreparationIssueDto,
  ListPreparationCorrectionsQueryDto,
  ResolvePreparationIssueDto,
  ReviewPreparationCorrectionDto,
  UpdatePreparationDto,
} from "./dto/preparation.dto";
import { EvidenceStorageService } from "./storage/evidence-storage.service";

const PREPARATION_INCLUDE = {
  task: true,
  items: { orderBy: { lineNumber: "asc" } },
  issues: { orderBy: { reportedAt: "asc" } },
  evidence: { orderBy: { createdAt: "asc" } },
  discrepancyReports: { orderBy: { reportedAt: "desc" } },
  corrections: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.PreparationRecordInclude;

type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];
type UploadFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };
type PreparationWithInclude = Prisma.PreparationRecordGetPayload<{ include: typeof PREPARATION_INCLUDE }>;

@Injectable()
export class PreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: EvidenceStorageService,
  ) {}

  async start(taskId: string, actorUserId: string): Promise<PreparationDetailDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      if (!(await this.lockTask(tx, taskId))) return { status: "NOT_FOUND" as const };
      const task = await tx.deliveryTask.findUnique({ where: { id: taskId }, include: { items: true } });
      if (!task) return { status: "NOT_FOUND" as const };
      const errors = validatePreparationStart(task.status);
      if (errors.length > 0) return { status: "INVALID_STATE" as const, errors };
      if (task.items.length === 0) {
        return { status: "INVALID_STATE" as const, errors: [{ code: "AT_LEAST_ONE_ITEM_REQUIRED", message: "Task has no planned goods." }] };
      }

      const preparation = await tx.preparationRecord.create({
        data: {
          taskId,
          startedByUserId: actorUserId,
          items: {
            create: task.items.map((item) => ({
              taskItemId: item.id,
              lineNumber: item.lineNumber,
              descriptionSnapshot: item.description,
              plannedQuantitySnapshot: item.plannedQuantity,
              preparedQuantity: new Prisma.Decimal(0),
              unitSnapshot: item.unit,
              notes: item.notes,
            })),
          },
        },
      });
      await tx.deliveryTask.update({
        where: { id: taskId },
        data: { status: "PREPARING", updatedByUserId: actorUserId },
      });
      await tx.taskEvent.create({
        data: {
          taskId,
          eventType: "PREPARATION_STARTED",
          previousStatus: "WAITING_PREPARATION",
          newStatus: "PREPARING",
          actorUserId,
          metadata: { preparationId: preparation.id, itemCount: task.items.length },
        },
      });
      return { status: "OK" as const };
    });
    if (result.status === "NOT_FOUND") throw new NotFoundException("Task not found.");
    if (result.status === "INVALID_STATE") throw new ConflictException({ message: "Preparation cannot be started.", errors: result.errors });
    return this.get(taskId);
  }

  async get(taskId: string): Promise<PreparationDetailDto> {
    const preparation = await this.prisma.preparationRecord.findUnique({ where: { taskId }, include: PREPARATION_INCLUDE });
    if (!preparation) throw new NotFoundException("Preparation not found.");
    return this.toDetailDto(preparation);
  }

  async update(taskId: string, actorUserId: string, dto: UpdatePreparationDto): Promise<PreparationDetailDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const loaded = await this.loadLockedPreparation(tx, taskId);
      if (!loaded) return { status: "NOT_FOUND" as const };
      const errors = validatePreparationUpdate(
        loaded.task.status,
        dto.items.map((item) => ({
          preparationItemId: item.preparationItemId,
          preparedQuantity: item.preparedQuantity,
          notes: item.notes ?? null,
        })),
      );
      const itemIds = new Set(loaded.preparation.items.map((item) => item.id));
      for (const item of dto.items) {
        if (!itemIds.has(item.preparationItemId)) {
          errors.push({ code: "PREPARATION_ITEM_NOT_FOUND", message: "Preparation item not found." });
        }
      }
      if (errors.length > 0) return { status: "INVALID" as const, errors };
      for (const item of dto.items) {
        await tx.preparationItem.update({
          where: { id: item.preparationItemId },
          data: { preparedQuantity: new Prisma.Decimal(item.preparedQuantity), notes: item.notes ?? null },
        });
      }
      await tx.taskEvent.create({
        data: {
          taskId,
          eventType: "PREPARATION_UPDATED",
          previousStatus: loaded.task.status,
          newStatus: loaded.task.status,
          actorUserId,
          metadata: { updatedItemCount: dto.items.length },
        },
      });
      return { status: "OK" as const };
    });
    if (result.status === "NOT_FOUND") throw new NotFoundException("Preparation not found.");
    if (result.status === "INVALID") throw new BadRequestException({ message: "Preparation update is invalid.", errors: result.errors });
    return this.get(taskId);
  }

  async createIssue(taskId: string, actorUserId: string, dto: CreatePreparationIssueDto): Promise<PreparationDetailDto> {
    const errors = validatePreparationIssueInput({ description: dto.description, preparationItemId: dto.preparationItemId });
    if (errors.length > 0) throw new BadRequestException({ message: "Preparation issue is invalid.", errors });
    const result = await this.prisma.$transaction(async (tx) => {
      const loaded = await this.loadLockedPreparation(tx, taskId);
      if (!loaded) return { status: "NOT_FOUND" as const };
      if (loaded.task.status !== "PREPARING") return { status: "INVALID_STATE" as const };
      if (dto.preparationItemId && !loaded.preparation.items.some((item) => item.id === dto.preparationItemId)) {
        return { status: "INVALID_ITEM" as const };
      }
      await tx.preparationIssue.create({
        data: {
          preparationId: loaded.preparation.id,
          preparationItemId: dto.preparationItemId ?? null,
          description: dto.description.trim(),
          reportedByUserId: actorUserId,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId,
          eventType: "PREPARATION_ISSUE_REPORTED",
          previousStatus: "PREPARING",
          newStatus: "PREPARING",
          actorUserId,
        },
      });
      return { status: "OK" as const };
    });
    if (result.status === "NOT_FOUND") throw new NotFoundException("Preparation not found.");
    if (result.status === "INVALID_STATE") throw new ConflictException("Issues can be reported only while PREPARING.");
    if (result.status === "INVALID_ITEM") throw new BadRequestException("Preparation item not found.");
    return this.get(taskId);
  }

  async resolveIssue(taskId: string, issueId: string, actorUserId: string, dto: ResolvePreparationIssueDto): Promise<PreparationDetailDto> {
    const errors = validatePreparationIssueResolveInput({ resolutionNote: dto.resolutionNote });
    if (errors.length > 0) throw new BadRequestException({ message: "Preparation issue resolution is invalid.", errors });
    const result = await this.prisma.$transaction(async (tx) => {
      const loaded = await this.loadLockedPreparation(tx, taskId);
      if (!loaded) return { status: "NOT_FOUND" as const };
      if (loaded.task.status !== "PREPARING") return { status: "INVALID_STATE" as const };
      const issue = loaded.preparation.issues.find((candidate) => candidate.id === issueId);
      if (!issue) return { status: "ISSUE_NOT_FOUND" as const };
      if (issue.status !== "OPEN") return { status: "ALREADY_RESOLVED" as const };
      await tx.preparationIssue.update({
        where: { id: issueId },
        data: {
          status: "RESOLVED",
          resolutionNote: dto.resolutionNote.trim(),
          resolvedByUserId: actorUserId,
          resolvedAt: new Date(),
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId,
          eventType: "PREPARATION_ISSUE_RESOLVED",
          previousStatus: "PREPARING",
          newStatus: "PREPARING",
          actorUserId,
        },
      });
      return { status: "OK" as const };
    });
    if (result.status === "NOT_FOUND") throw new NotFoundException("Preparation not found.");
    if (result.status === "ISSUE_NOT_FOUND") throw new NotFoundException("Preparation issue not found.");
    if (result.status === "INVALID_STATE") throw new ConflictException("Issues can be resolved only while PREPARING.");
    if (result.status === "ALREADY_RESOLVED") throw new ConflictException("Preparation issue is already resolved.");
    return this.get(taskId);
  }

  async addEvidence(taskId: string, actorUserId: string, file: UploadFile | undefined): Promise<PreparationDetailDto> {
    if (!file) throw new BadRequestException("A photo file is required.");
    const mediaType = this.detectImageMediaType(file.buffer);
    if (!mediaType || mediaType !== file.mimetype) throw new BadRequestException("Unsupported or mismatched image type.");
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) throw new BadRequestException("Photo must be between 1 byte and 5 MB.");
    const extension = mediaType === "image/png" ? "png" : mediaType === "image/webp" ? "webp" : "jpg";
    const preparation = await this.prisma.preparationRecord.findUnique({ where: { taskId }, select: { id: true } });
    if (!preparation) throw new NotFoundException("Preparation not found.");
    const objectKey = `preparation/${preparation.id}/${randomUUID()}.${extension}`;
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    await this.storage.writeObject(objectKey, file.buffer);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const loaded = await this.loadLockedPreparation(tx, taskId);
        if (!loaded) return { status: "NOT_FOUND" as const };
        if (loaded.task.status !== "PREPARING") return { status: "INVALID_STATE" as const };
        await tx.preparationEvidence.create({
          data: {
            preparationId: loaded.preparation.id,
            category: "PRE_LOADING_PHOTO",
            objectKey,
            originalFilename: this.cleanFilename(file.originalname),
            mediaType,
            sizeBytes: file.size,
            sha256,
            uploadedByUserId: actorUserId,
          },
        });
        await tx.taskEvent.create({
          data: {
            taskId,
            eventType: "PRE_LOADING_EVIDENCE_ADDED",
            previousStatus: "PREPARING",
            newStatus: "PREPARING",
            actorUserId,
            metadata: { category: "PRE_LOADING_PHOTO", sizeBytes: file.size, sha256 },
          },
        });
        return { status: "OK" as const };
      });
      if (result.status === "NOT_FOUND") throw new NotFoundException("Preparation not found.");
      if (result.status === "INVALID_STATE") throw new ConflictException("Evidence can be uploaded only while PREPARING.");
    } catch (err) {
      await this.storage.deleteObjectIfExists(objectKey);
      throw err;
    }
    return this.get(taskId);
  }

  async openEvidence(taskId: string, evidenceId: string): Promise<{ file: StreamableFile; evidence: PreparationEvidenceDto }> {
    const preparation = await this.prisma.preparationRecord.findUnique({
      where: { taskId },
      include: { evidence: { where: { id: evidenceId } }, task: true },
    });
    if (!preparation || preparation.evidence.length !== 1) throw new NotFoundException("Evidence not found.");
    const evidence = preparation.evidence[0]!;
    const stream = await this.storage.openReadStream(evidence.objectKey);
    return {
      file: new StreamableFile(stream),
      evidence: this.toEvidenceDto(taskId, evidence),
    };
  }

  async confirmReady(taskId: string, actorUserId: string): Promise<PreparationDetailDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const loaded = await this.loadLockedPreparation(tx, taskId);
      if (!loaded) return { status: "NOT_FOUND" as const };
      const plannedItems = await tx.deliveryTaskItem.findMany({ where: { taskId }, select: { id: true } });
      const errors = validatePreparationReady({
        taskStatus: loaded.task.status,
        plannedTaskItemIds: plannedItems.map((item) => item.id),
        preparationItems: loaded.preparation.items.map((item) => ({
          id: item.id,
          taskItemId: item.taskItemId,
          lineNumber: item.lineNumber,
          descriptionSnapshot: item.descriptionSnapshot,
          plannedQuantitySnapshot: item.plannedQuantitySnapshot.toString(),
          preparedQuantity: item.preparedQuantity.toString(),
          unitSnapshot: item.unitSnapshot,
          notes: item.notes,
        })),
        issues: loaded.preparation.issues.map((issue) => ({ id: issue.id, status: issue.status })),
        evidence: loaded.preparation.evidence.map((evidence) => ({ id: evidence.id, category: evidence.category })),
      });
      if (errors.length > 0) return { status: "INVALID" as const, errors };
      const now = new Date();
      await tx.preparationRecord.update({
        where: { id: loaded.preparation.id },
        data: { readyConfirmedByUserId: actorUserId, readyConfirmedAt: now },
      });
      await tx.deliveryTask.update({ where: { id: taskId }, data: { status: "READY_FOR_DISPATCH", updatedByUserId: actorUserId } });
      await tx.taskEvent.create({
        data: {
          taskId,
          eventType: "PREPARATION_READY_CONFIRMED",
          previousStatus: "PREPARING",
          newStatus: "READY_FOR_DISPATCH",
          actorUserId,
          metadata: { preparationId: loaded.preparation.id },
        },
      });
      return { status: "OK" as const };
    });
    if (result.status === "NOT_FOUND") throw new NotFoundException("Preparation not found.");
    if (result.status === "INVALID") throw new UnprocessableEntityException({ message: "Preparation is not ready.", errors: result.errors });
    return this.get(taskId);
  }

  async createDiscrepancyReport(taskId: string, actorUserId: string, dto: CreatePreparationDiscrepancyReportDto): Promise<PreparationDetailDto> {
    if (dto.description.trim().length === 0) throw new BadRequestException("Description is required.");
    const result = await this.prisma.$transaction(async (tx) => {
      const loaded = await this.loadLockedPreparation(tx, taskId);
      if (!loaded) return { status: "NOT_FOUND" as const };
      const errors = validatePostTransitDiscrepancyStatus(loaded.task.status);
      if (errors.length > 0) return { status: "INVALID_STATE" as const, errors };
      await tx.preparationDiscrepancyReport.create({
        data: { taskId, preparationId: loaded.preparation.id, reportedByUserId: actorUserId, description: dto.description.trim() },
      });
      await tx.taskEvent.create({
        data: {
          taskId,
          eventType: "PREPARATION_DISCREPANCY_REPORTED",
          previousStatus: loaded.task.status,
          newStatus: loaded.task.status,
          actorUserId,
        },
      });
      return { status: "OK" as const };
    });
    if (result.status === "NOT_FOUND") throw new NotFoundException("Preparation not found.");
    if (result.status === "INVALID_STATE") throw new ConflictException({ message: "Discrepancy report is not allowed in this state.", errors: result.errors });
    return this.get(taskId);
  }

  async createCorrection(taskId: string, actorUserId: string, dto: CreatePreparationCorrectionDto): Promise<PreparationDetailDto> {
    const errors = validatePreparationCorrectionInput(dto);
    if (errors.length > 0) throw new BadRequestException({ message: "Preparation correction is invalid.", errors });
    const result = await this.prisma.$transaction(async (tx) => {
      const loaded = await this.loadLockedPreparation(tx, taskId);
      if (!loaded) return { status: "NOT_FOUND" as const };
      const statusErrors = validatePostTransitDiscrepancyStatus(loaded.task.status);
      if (statusErrors.length > 0) return { status: "INVALID_STATE" as const, errors: statusErrors };
      if (dto.discrepancyReportId) {
        const report = loaded.preparation.discrepancyReports.find((candidate) => candidate.id === dto.discrepancyReportId);
        if (!report) return { status: "REPORT_NOT_FOUND" as const };
      }
      const correction = await tx.preparationCorrectionRecord.create({
        data: {
          taskId,
          preparationId: loaded.preparation.id,
          discrepancyReportId: dto.discrepancyReportId ?? null,
          createdByUserId: actorUserId,
          materiality: dto.materiality,
          reason: dto.reason.trim(),
          changeSummary: dto.changeSummary.trim(),
          originalPreparationSnapshot: this.buildOriginalSnapshot(loaded.preparation),
          correctedOrExceptionSnapshot: dto.correctedOrExceptionSnapshot as Prisma.InputJsonValue,
          reviewStatus: "PENDING_REVIEW",
        },
      });
      if (dto.discrepancyReportId) {
        await tx.preparationDiscrepancyReport.update({
          where: { id: dto.discrepancyReportId },
          data: { linkedCorrectionId: correction.id },
        });
      }
      await tx.taskEvent.create({
        data: {
          taskId,
          eventType: "PREPARATION_CORRECTION_CREATED",
          previousStatus: loaded.task.status,
          newStatus: loaded.task.status,
          actorUserId,
          metadata: { correctionId: correction.id, materiality: dto.materiality, reviewStatus: "PENDING_REVIEW" },
        },
      });
      return { status: "OK" as const };
    });
    if (result.status === "NOT_FOUND") throw new NotFoundException("Preparation not found.");
    if (result.status === "REPORT_NOT_FOUND") throw new BadRequestException("Discrepancy report not found.");
    if (result.status === "INVALID_STATE") throw new ConflictException({ message: "Correction is not allowed in this state.", errors: result.errors });
    return this.get(taskId);
  }

  async listCorrections(query: ListPreparationCorrectionsQueryDto): Promise<ListPreparationCorrectionsResponseBody> {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(query.pageSize) || 20)));
    const where: Prisma.PreparationCorrectionRecordWhereInput = {};
    if (query.materiality) where.materiality = query.materiality;
    if (query.reviewStatus === "PENDING_REVIEW" || query.reviewStatus === "REVIEWED") where.reviewStatus = query.reviewStatus;
    const [items, total] = await Promise.all([
      this.prisma.preparationCorrectionRecord.findMany({
        where,
        orderBy: [{ reviewStatus: "asc" }, { materiality: "desc" }, { createdAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.preparationCorrectionRecord.count({ where }),
    ]);
    return { items: items.map((item) => this.toCorrectionDto(item)), page, pageSize, total };
  }

  async reviewCorrection(correctionId: string, actorUserId: string, dto: ReviewPreparationCorrectionDto): Promise<ListPreparationCorrectionsResponseBody["items"][number]> {
    const errors = validatePreparationCorrectionReviewInput({ reviewStatus: "REVIEWED", reviewNote: dto.reviewNote });
    if (errors.length > 0) throw new BadRequestException({ message: "Preparation correction review is invalid.", errors });
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "preparation_correction_records" WHERE "id" = ${correctionId}::uuid FOR UPDATE
      `;
      if (rows.length !== 1) return { status: "NOT_FOUND" as const };
      const correction = await tx.preparationCorrectionRecord.findUnique({ where: { id: correctionId } });
      if (!correction) return { status: "NOT_FOUND" as const };
      if (correction.reviewStatus !== "PENDING_REVIEW") return { status: "ALREADY_REVIEWED" as const };
      if (correction.createdByUserId === actorUserId) return { status: "SAME_PERSON" as const };
      const task = await tx.deliveryTask.findUnique({ where: { id: correction.taskId }, select: { status: true } });
      const updated = await tx.preparationCorrectionRecord.update({
        where: { id: correctionId },
        data: { reviewStatus: "REVIEWED", reviewedByUserId: actorUserId, reviewedAt: new Date(), reviewNote: dto.reviewNote.trim() },
      });
      await tx.taskEvent.create({
        data: {
          taskId: updated.taskId,
          eventType: "PREPARATION_CORRECTION_REVIEWED",
          previousStatus: task?.status ?? "IN_TRANSIT",
          newStatus: task?.status ?? "IN_TRANSIT",
          actorUserId,
          metadata: { correctionId: updated.id, reviewStatus: "REVIEWED" },
        },
      });
      return { status: "OK" as const, correction: updated };
    });
    if (result.status === "NOT_FOUND") throw new NotFoundException("Correction not found.");
    if (result.status === "ALREADY_REVIEWED") throw new ConflictException("Correction is already reviewed.");
    if (result.status === "SAME_PERSON") throw new ConflictException("Correction creator cannot review the same record.");
    return this.toCorrectionDto(result.correction);
  }

  private async lockTask(tx: Tx, taskId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "delivery_tasks" WHERE "id" = ${taskId}::uuid FOR UPDATE
    `;
    return rows.length === 1;
  }

  private async loadLockedPreparation(tx: Tx, taskId: string) {
    if (!(await this.lockTask(tx, taskId))) return null;
    const task = await tx.deliveryTask.findUnique({ where: { id: taskId } });
    const preparation = await tx.preparationRecord.findUnique({ where: { taskId }, include: PREPARATION_INCLUDE });
    if (!task || !preparation) return null;
    return { task, preparation };
  }

  private detectImageMediaType(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
    return null;
  }

  private cleanFilename(filename: string): string {
    const cleaned = filename.replace(/[\r\n"]/g, "_").split(/[\\/]/).pop()?.trim() || "evidence";
    return cleaned.slice(0, 255);
  }

  private buildOriginalSnapshot(preparation: PreparationWithInclude) {
    return {
      preparationId: preparation.id,
      readyConfirmedAt: preparation.readyConfirmedAt?.toISOString() ?? null,
      items: preparation.items.map((item) => ({
        taskItemId: item.taskItemId,
        lineNumber: item.lineNumber,
        descriptionSnapshot: item.descriptionSnapshot,
        plannedQuantitySnapshot: item.plannedQuantitySnapshot.toString(),
        preparedQuantity: item.preparedQuantity.toString(),
        unitSnapshot: item.unitSnapshot,
        notes: item.notes,
      })),
      issues: preparation.issues.map((issue) => ({ id: issue.id, status: issue.status })),
      evidenceCount: preparation.evidence.length,
    };
  }

  private toDetailDto(preparation: PreparationWithInclude): PreparationDetailDto {
    return {
      id: preparation.id,
      taskId: preparation.taskId,
      taskNumber: preparation.task.taskNumber,
      taskStatus: preparation.task.status,
      destinationName: preparation.task.destinationName,
      address: preparation.task.address,
      startedByUserId: preparation.startedByUserId,
      startedAt: preparation.startedAt.toISOString(),
      readyConfirmedByUserId: preparation.readyConfirmedByUserId,
      readyConfirmedAt: preparation.readyConfirmedAt?.toISOString() ?? null,
      notes: preparation.notes,
      items: preparation.items.map((item) => ({
        id: item.id,
        taskItemId: item.taskItemId,
        lineNumber: item.lineNumber,
        descriptionSnapshot: item.descriptionSnapshot,
        plannedQuantitySnapshot: item.plannedQuantitySnapshot.toString(),
        preparedQuantity: item.preparedQuantity.toString(),
        unitSnapshot: item.unitSnapshot,
        notes: item.notes,
      })),
      issues: preparation.issues.map((issue) => ({
        id: issue.id,
        preparationItemId: issue.preparationItemId,
        description: issue.description,
        status: issue.status,
        reportedByUserId: issue.reportedByUserId,
        reportedAt: issue.reportedAt.toISOString(),
        resolutionNote: issue.resolutionNote,
        resolvedByUserId: issue.resolvedByUserId,
        resolvedAt: issue.resolvedAt?.toISOString() ?? null,
      })),
      evidence: preparation.evidence.map((evidence) => this.toEvidenceDto(preparation.taskId, evidence)),
      discrepancyReports: preparation.discrepancyReports.map((report) => ({
        id: report.id,
        taskId: report.taskId,
        preparationId: report.preparationId,
        reportedByUserId: report.reportedByUserId,
        description: report.description,
        reportedAt: report.reportedAt.toISOString(),
        linkedCorrectionId: report.linkedCorrectionId,
      })),
      corrections: preparation.corrections.map((correction) => this.toCorrectionDto(correction)),
    };
  }

  private toEvidenceDto(taskId: string, evidence: { id: string; category: "PRE_LOADING_PHOTO"; originalFilename: string; mediaType: string; sizeBytes: number; sha256: string; uploadedByUserId: string; createdAt: Date }): PreparationEvidenceDto {
    return {
      id: evidence.id,
      category: evidence.category,
      originalFilename: evidence.originalFilename,
      mediaType: evidence.mediaType,
      sizeBytes: evidence.sizeBytes,
      sha256: evidence.sha256,
      uploadedByUserId: evidence.uploadedByUserId,
      createdAt: evidence.createdAt.toISOString(),
      downloadPath: `/tasks/${taskId}/preparation/evidence/${evidence.id}`,
    };
  }

  private toCorrectionDto(correction: { id: string; taskId: string; preparationId: string; discrepancyReportId: string | null; createdByUserId: string; materiality: "NORMAL" | "MATERIAL"; reason: string; changeSummary: string; originalPreparationSnapshot: Prisma.JsonValue; correctedOrExceptionSnapshot: Prisma.JsonValue; reviewStatus: "PENDING_REVIEW" | "REVIEWED"; createdAt: Date; reviewedByUserId: string | null; reviewedAt: Date | null; reviewNote: string | null }) {
    return {
      id: correction.id,
      taskId: correction.taskId,
      preparationId: correction.preparationId,
      discrepancyReportId: correction.discrepancyReportId,
      createdByUserId: correction.createdByUserId,
      materiality: correction.materiality,
      reason: correction.reason,
      changeSummary: correction.changeSummary,
      originalPreparationSnapshot: correction.originalPreparationSnapshot,
      correctedOrExceptionSnapshot: correction.correctedOrExceptionSnapshot,
      reviewStatus: correction.reviewStatus,
      createdAt: correction.createdAt.toISOString(),
      reviewedByUserId: correction.reviewedByUserId,
      reviewedAt: correction.reviewedAt?.toISOString() ?? null,
      reviewNote: correction.reviewNote,
    };
  }
}
