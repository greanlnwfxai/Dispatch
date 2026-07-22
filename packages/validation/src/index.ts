/**
 * Generic validation foundation.
 *
 * Deliberately contains no Dispatch business/validation rules (BR-xxx,
 * VR-xxx from Dispatch Knowledge Topic 06). Those are out of scope for
 * DEV-FOUNDATION-001 and belong to future domain/application-layer work.
 * This package only provides generic assertion helpers reusable by any
 * workspace (e.g. validating that a required environment variable is
 * present at process bootstrap).
 */

export function assertDefined<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return assertDefined(env[name], `Missing required environment variable: ${name}`);
}
