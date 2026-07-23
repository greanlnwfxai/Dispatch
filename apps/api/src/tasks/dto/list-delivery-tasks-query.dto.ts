import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { DELIVERY_TASK_STATUS_CODES } from "@dispatch/shared-types";
import type { DeliveryTaskStatus } from "@dispatch/shared-types";

/** Bounded, paginated Task list filters (§7 — no unbounded result sets). */
export class ListDeliveryTasksQueryDto {
  @IsOptional()
  @IsIn([...DELIVERY_TASK_STATUS_CODES])
  status?: DeliveryTaskStatus;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  taskNumber?: string;

  @IsOptional()
  @IsDateString()
  plannedDeliveryDateFrom?: string;

  @IsOptional()
  @IsDateString()
  plannedDeliveryDateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
