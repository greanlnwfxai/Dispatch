import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const MAX_SUPPORTING_EMPLOYEES = 20;

/** Initial assignment (READY_FOR_DISPATCH -> ASSIGNED). Must not carry a reassignment reason. */
export class AssignTaskDto {
  @IsUUID()
  primaryAssigneeUserId!: string;

  @IsArray()
  @ArrayMaxSize(MAX_SUPPORTING_EMPLOYEES)
  @IsUUID(undefined, { each: true })
  supportingEmployeeUserIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

/**
 * Formal reassignment (ASSIGNED -> ASSIGNED). `expectedCurrentAssignmentId`
 * is the stale-write precondition compared, under the task row lock,
 * against the actual current assignment.
 */
export class ReassignTaskDto {
  @IsUUID()
  primaryAssigneeUserId!: string;

  @IsArray()
  @ArrayMaxSize(MAX_SUPPORTING_EMPLOYEES)
  @IsUUID(undefined, { each: true })
  supportingEmployeeUserIds!: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @IsUUID()
  expectedCurrentAssignmentId!: string;
}

/** Bounded, paginated candidate search (no unbounded result sets). */
export class ListAssignmentCandidatesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

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

/** Bounded, paginated "my assigned tasks" list for the caller's own record scope. */
export class ListAssignedTasksQueryDto {
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
