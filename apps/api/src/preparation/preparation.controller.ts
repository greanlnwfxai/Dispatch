import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { CurrentPrincipal } from "../auth/decorators/current-principal.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { AuthenticatedPrincipal } from "../auth/types/authenticated-principal";
import {
  CreatePreparationCorrectionDto,
  CreatePreparationDiscrepancyReportDto,
  CreatePreparationIssueDto,
  ListPreparationCorrectionsQueryDto,
  ResolvePreparationIssueDto,
  ReviewPreparationCorrectionDto,
  UpdatePreparationDto,
} from "./dto/preparation.dto";
import { PreparationService } from "./preparation.service";

const PREPARATION_READ_ROLES = ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "STOCK", "MANAGEMENT_AUDITOR"] as const;
const PREPARATION_WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "STOCK"] as const;
const CORRECTION_READ_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGEMENT_AUDITOR"] as const;

@Controller()
export class PreparationController {
  constructor(private readonly preparationService: PreparationService) {}

  @Post("tasks/:id/preparation/start")
  @UseGuards(RolesGuard)
  @Roles(...PREPARATION_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async start(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe()) taskId: string) {
    return this.preparationService.start(taskId, principal.userId);
  }

  @Get("tasks/:id/preparation")
  @UseGuards(RolesGuard)
  @Roles(...PREPARATION_READ_ROLES)
  @Header("Cache-Control", "no-store")
  async get(@Param("id", new ParseUUIDPipe()) taskId: string) {
    return this.preparationService.get(taskId);
  }

  @Patch("tasks/:id/preparation")
  @UseGuards(RolesGuard)
  @Roles(...PREPARATION_WRITE_ROLES)
  @Header("Cache-Control", "no-store")
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe()) taskId: string,
    @Body() body: UpdatePreparationDto,
  ) {
    return this.preparationService.update(taskId, principal.userId, body);
  }

  @Post("tasks/:id/preparation/issues")
  @UseGuards(RolesGuard)
  @Roles(...PREPARATION_WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  async createIssue(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe()) taskId: string,
    @Body() body: CreatePreparationIssueDto,
  ) {
    return this.preparationService.createIssue(taskId, principal.userId, body);
  }

  @Patch("tasks/:id/preparation/issues/:issueId/resolve")
  @UseGuards(RolesGuard)
  @Roles(...PREPARATION_WRITE_ROLES)
  @Header("Cache-Control", "no-store")
  async resolveIssue(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe()) taskId: string,
    @Param("issueId", new ParseUUIDPipe()) issueId: string,
    @Body() body: ResolvePreparationIssueDto,
  ) {
    return this.preparationService.resolveIssue(taskId, issueId, principal.userId, body);
  }

  @Post("tasks/:id/preparation/evidence")
  @UseGuards(RolesGuard)
  @Roles(...PREPARATION_WRITE_ROLES)
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, parts: 2 } }))
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  async addEvidence(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe()) taskId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
  ) {
    return this.preparationService.addEvidence(taskId, principal.userId, file);
  }

  @Get("tasks/:id/preparation/evidence/:evidenceId")
  @UseGuards(RolesGuard)
  @Roles(...PREPARATION_READ_ROLES)
  async openEvidence(
    @Param("id", new ParseUUIDPipe()) taskId: string,
    @Param("evidenceId", new ParseUUIDPipe()) evidenceId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.preparationService.openEvidence(taskId, evidenceId);
    response.setHeader("Content-Type", result.evidence.mediaType);
    response.setHeader("Content-Length", String(result.evidence.sizeBytes));
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${result.evidence.originalFilename.replace(/[\r\n"]/g, "_")}"`,
    );
    return result.file;
  }

  @Post("tasks/:id/preparation/confirm-ready")
  @UseGuards(RolesGuard)
  @Roles(...PREPARATION_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async confirmReady(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe()) taskId: string) {
    return this.preparationService.confirmReady(taskId, principal.userId);
  }

  @Post("tasks/:id/preparation/discrepancy-reports")
  @UseGuards(RolesGuard)
  @Roles("STOCK")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  async createDiscrepancyReport(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe()) taskId: string,
    @Body() body: CreatePreparationDiscrepancyReportDto,
  ) {
    return this.preparationService.createDiscrepancyReport(taskId, principal.userId, body);
  }

  @Post("tasks/:id/preparation/corrections")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  async createCorrection(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe()) taskId: string,
    @Body() body: CreatePreparationCorrectionDto,
  ) {
    return this.preparationService.createCorrection(taskId, principal.userId, body);
  }

  @Get("preparation-corrections")
  @UseGuards(RolesGuard)
  @Roles(...CORRECTION_READ_ROLES)
  @Header("Cache-Control", "no-store")
  async listCorrections(@Query() query: ListPreparationCorrectionsQueryDto) {
    return this.preparationService.listCorrections(query);
  }

  @Post("preparation-corrections/:id/review")
  @UseGuards(RolesGuard)
  @Roles("SUPER_ADMIN")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async reviewCorrection(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe()) correctionId: string,
    @Body() body: ReviewPreparationCorrectionDto,
  ) {
    return this.preparationService.reviewCorrection(correctionId, principal.userId, body);
  }
}
