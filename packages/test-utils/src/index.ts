/**
 * Shared test utilities for Dispatch workspaces.
 *
 * DEV-FOUNDATION-001 only needs a health-response assertion helper,
 * reused by apps/api's Supertest suite and any future integration tests
 * that check service reachability. No business-scenario fixtures
 * (DeliveryTask, Role, permission-matrix factories, ...) are introduced
 * here — those belong to the milestones that implement those domains.
 */

import type { DispatchServiceName, HealthResponse } from "@dispatch/shared-types";

export function expectOkHealthResponse(
  body: unknown,
  expectedService: DispatchServiceName,
): asserts body is HealthResponse {
  if (typeof body !== "object" || body === null) {
    throw new Error("expectOkHealthResponse: response body is not an object");
  }
  const { status, service } = body as Record<string, unknown>;
  if (status !== "ok") {
    throw new Error(`expectOkHealthResponse: expected status "ok", got ${JSON.stringify(status)}`);
  }
  if (service !== expectedService) {
    throw new Error(
      `expectOkHealthResponse: expected service "${expectedService}", got ${JSON.stringify(service)}`,
    );
  }
}
