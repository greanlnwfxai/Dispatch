import { IsString, Length } from "class-validator";

/**
 * Optional, flexible business-reference input (BDR-TASK-001 — OPEN). No
 * reference type is mandatory in this milestone; only bounds/trimming are
 * enforced here.
 */
export class TaskReferenceDto {
  @IsString()
  @Length(1, 64)
  referenceType!: string;

  @IsString()
  @Length(1, 128)
  referenceValue!: string;
}
