import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from "class-validator";
import { DESTINATION_SOURCE_CODES, FREE_TEXT_FALLBACK_REASON_CODES } from "@dispatch/shared-types";
import type { DestinationSource, FreeTextFallbackReason } from "@dispatch/shared-types";
import { DeliveryTaskItemDto } from "./delivery-task-item.dto";
import { TaskReferenceDto } from "./task-reference.dto";

/**
 * Creates a DRAFT Delivery Task (§4, §7). `searchId` is always required —
 * search-first (BR-TASK-003) applies from Task creation, not only at
 * submission. Master-source snapshot fields supplied here are advisory
 * only: the server always loads canonical values from the database for
 * `destinationSource: "MASTER"` and ignores conflicting client input (see
 * TasksService).
 */
export class CreateDeliveryTaskDto {
  @IsUUID()
  searchId!: string;

  @IsIn([...DESTINATION_SOURCE_CODES])
  destinationSource!: DestinationSource;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsUUID()
  customerDestinationId?: string | null;

  @IsOptional()
  @IsIn([...FREE_TEXT_FALLBACK_REASON_CODES])
  freeTextFallbackReason?: FreeTextFallbackReason | null;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  customerName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  destinationName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  contactName?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  contactPhone?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  deliveryInstructions?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  locationReference?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  accessNotes?: string | null;

  @IsOptional()
  @IsDateString()
  plannedDeliveryDate?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DeliveryTaskItemDto)
  items?: DeliveryTaskItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TaskReferenceDto)
  references?: TaskReferenceDto[];
}
