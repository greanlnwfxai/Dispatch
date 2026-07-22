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
