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

/**
 * MVP-02 — Customer and Task Creation.
 *
 * The conceptual 10-status Main Task Status lifecycle (Dispatch Knowledge
 * Topic 04 §5) in full, so the database enum never needs to be altered by a
 * future milestone. Only `DRAFT` and `WAITING_PREPARATION` are reachable
 * through any API in this milestone — the remaining eight are reserved for
 * Preparation/Assignment/Delivery/Return/Reopen/Override milestones and are
 * not otherwise implemented here.
 */
export const DELIVERY_TASK_STATUS_CODES = [
  "DRAFT",
  "WAITING_PREPARATION",
  "PREPARING",
  "READY_FOR_DISPATCH",
  "ASSIGNED",
  "IN_TRANSIT",
  "AT_DESTINATION",
  "WAITING_NEXT_ATTEMPT",
  "COMPLETED",
  "CANCELLED",
] as const;

export type DeliveryTaskStatus = (typeof DELIVERY_TASK_STATUS_CODES)[number];

export function isDeliveryTaskStatus(value: string): value is DeliveryTaskStatus {
  return (DELIVERY_TASK_STATUS_CODES as readonly string[]).includes(value);
}

/**
 * Destination Source (BR-TASK-003, BDR-CUSTOMER-001 Option C / BDR-CUSTOMER-002
 * Option B — approved 2026-07-20). Every Task must record whether its
 * destination came from a searched Customer Master record or a Free-text
 * fallback; there is no third option.
 */
export const DESTINATION_SOURCE_CODES = ["MASTER", "FREE_TEXT"] as const;

export type DestinationSource = (typeof DESTINATION_SOURCE_CODES)[number];

export function isDestinationSource(value: string): value is DestinationSource {
  return (DESTINATION_SOURCE_CODES as readonly string[]).includes(value);
}

/**
 * Free-text fallback reason. Required whenever `destinationSource ===
 * "FREE_TEXT"` (VR-TASK-001a) — Free-text may only be used when no suitable
 * Master record exists or the destination is genuinely ad hoc, never as a
 * convenience shortcut around searching Master first.
 */
export const FREE_TEXT_FALLBACK_REASON_CODES = ["NO_SUITABLE_MASTER", "AD_HOC_DESTINATION"] as const;

export type FreeTextFallbackReason = (typeof FREE_TEXT_FALLBACK_REASON_CODES)[number];

export function isFreeTextFallbackReason(value: string): value is FreeTextFallbackReason {
  return (FREE_TEXT_FALLBACK_REASON_CODES as readonly string[]).includes(value);
}
