/**
 * Foundation-level shared types for Dispatch.
 *
 * This package intentionally contains no business rules, no Delivery Task
 * concepts, and no role/permission logic. It exists to share generic
 * service-identity and health-contract shapes across apps/api,
 * apps/admin-web, and apps/mobile-pwa.
 */

export const DISPATCH_SERVICE_NAMES = [
  "dispatch-api",
  "dispatch-admin-web",
  "dispatch-mobile-pwa",
] as const;

export type DispatchServiceName = (typeof DISPATCH_SERVICE_NAMES)[number];

export interface HealthResponse {
  status: "ok";
  service: DispatchServiceName;
}

export function isDispatchServiceName(value: string): value is DispatchServiceName {
  return (DISPATCH_SERVICE_NAMES as readonly string[]).includes(value);
}

export interface ReadinessResponse extends HealthResponse {
  database: "ok";
}

/**
 * The exactly six application roles approved for Dispatch Phase 1 (Dispatch
 * Knowledge Topic 03 §4, Topic 11 §7.2). External Courier and Customer are
 * not application accounts in Phase 1 and must never appear here. This is
 * the single runtime source of truth for role codes — the Prisma seed reads
 * from this constant rather than maintaining a second hardcoded list, so the
 * two cannot silently drift apart.
 */
export const DISPATCH_ROLE_CODES = [
  "SUPER_ADMIN",
  "ADMIN",
  "DISPATCHER",
  "STOCK",
  "INTERNAL_DELIVERY_EMPLOYEE",
  "MANAGEMENT_AUDITOR",
] as const;

export type DispatchRoleCode = (typeof DISPATCH_ROLE_CODES)[number];

export function isDispatchRoleCode(value: string): value is DispatchRoleCode {
  return (DISPATCH_ROLE_CODES as readonly string[]).includes(value);
}
