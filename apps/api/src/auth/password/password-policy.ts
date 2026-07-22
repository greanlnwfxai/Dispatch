/**
 * Password policy (AUTH-001) — length bounds only, no composition rule
 * (no forced uppercase/symbol/digit mix). Shared by the login DTO validator
 * and the operator bootstrap CLI so both enforce identical rules.
 */
export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
}

export function validatePasswordPolicy(password: string, policy: PasswordPolicy): string | null {
  if (typeof password !== "string" || password.length === 0) {
    return "Password is required.";
  }
  if (password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters.`;
  }
  if (password.length > policy.maxLength) {
    return `Password must be at most ${policy.maxLength} characters.`;
  }
  return null;
}
