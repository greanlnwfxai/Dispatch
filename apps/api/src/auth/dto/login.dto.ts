import { IsString, Length } from "class-validator";

/**
 * `loginId` is intentionally untyped/unvalidated beyond length — it is a
 * neutral technical identifier, not an email address (see CLAUDE.md
 * AUTH-001 boundary). Password bounds mirror the shared password policy
 * (packages/auth/password/password-policy.ts) but are duplicated here as
 * literal decorator arguments because class-validator decorators require
 * compile-time constants.
 */
export class LoginDto {
  @IsString()
  @Length(1, 320)
  loginId!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
