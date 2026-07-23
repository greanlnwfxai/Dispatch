import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

/**
 * Planned goods line (§4.7). `plannedQuantity` is validated as a bounded
 * decimal string (never a JS number, to avoid float precision loss) —
 * positivity is re-checked by domain validation and by the
 * `delivery_task_items_planned_quantity_positive_check` database CHECK
 * constraint.
 */
export class DeliveryTaskItemDto {
  @IsInt()
  @Min(1)
  @Max(9999)
  lineNumber!: number;

  @IsString()
  @Length(1, 500)
  description!: string;

  @IsString()
  @Matches(/^\d{1,15}(\.\d{1,3})?$/, { message: "plannedQuantity must be a positive decimal with up to 3 fraction digits" })
  plannedQuantity!: string;

  @IsString()
  @Length(1, 32)
  unit!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string | null;
}
