import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import {
  PREPARATION_CORRECTION_MATERIALITY_CODES,
  type PreparationCorrectionMateriality,
} from "@dispatch/shared-types";

export class UpdatePreparationItemDto {
  @IsUUID()
  preparationItemId!: string;

  @IsString()
  @IsNotEmpty()
  preparedQuantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdatePreparationDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UpdatePreparationItemDto)
  items!: UpdatePreparationItemDto[];
}

export class CreatePreparationIssueDto {
  @IsOptional()
  @IsUUID()
  preparationItemId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description!: string;
}

export class ResolvePreparationIssueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  resolutionNote!: string;
}

export class CreatePreparationDiscrepancyReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description!: string;
}

export class CreatePreparationCorrectionDto {
  @IsOptional()
  @IsUUID()
  discrepancyReportId?: string | null;

  @IsIn(PREPARATION_CORRECTION_MATERIALITY_CODES)
  materiality!: PreparationCorrectionMateriality;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  changeSummary!: string;

  @IsObject()
  correctedOrExceptionSnapshot!: Record<string, unknown>;
}

export class ListPreparationCorrectionsQueryDto {
  @IsOptional()
  @IsIn(PREPARATION_CORRECTION_MATERIALITY_CODES)
  materiality?: PreparationCorrectionMateriality;

  @IsOptional()
  @IsString()
  reviewStatus?: string;

  @IsOptional()
  @Type(() => Number)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  pageSize = 20;
}

export class ReviewPreparationCorrectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reviewNote!: string;
}
