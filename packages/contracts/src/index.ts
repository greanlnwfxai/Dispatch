/**
 * Foundation-level API contracts shared between apps/api, apps/admin-web,
 * and apps/mobile-pwa.
 *
 * DEV-FOUNDATION-001 only introduces the health-check contract. Business
 * Command/Query contracts (CreateDeliveryTask, AssignDeliveryTask, ...) are
 * out of scope — see Dispatch Knowledge Topic 11 §17 for the future
 * command boundary this package will eventually expose.
 */

import type { HealthResponse } from "@dispatch/shared-types";

export const HEALTH_ENDPOINT_PATH = "/health" as const;

export function buildHealthUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}${HEALTH_ENDPOINT_PATH}`;
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value as { status: unknown }).status === "ok" &&
    "service" in value &&
    typeof (value as { service: unknown }).service === "string"
  );
}

export type { HealthResponse } from "@dispatch/shared-types";
