import { IsString, Length } from "class-validator";

/**
 * Bounded search-query input (§4.3, §7). `query` is free text matched
 * against Customer/Destination name/code — length-bounded so a single
 * request can never be used to enumerate or dump the whole Master table.
 */
export class CustomerMasterSearchDto {
  @IsString()
  @Length(1, 120)
  query!: string;
}
