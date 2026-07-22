import { Controller, Get } from "@nestjs/common";
import type { HealthResponse, ReadinessResponse } from "@dispatch/shared-types";
import { HealthService } from "./health.service";

/**
 * Foundation-only endpoints. No authentication is applied here on purpose:
 * AUTH-001 (JWT access/refresh + server-side revocation) is a future
 * milestone, and health/readiness must stay reachable for Docker
 * healthchecks.
 *
 * - GET /health/live  — process liveness, no database dependency.
 * - GET /health/ready — application readiness, database-aware (503 on
 *   database failure).
 * - GET /health        — backward-compatible alias of /health/ready, kept
 *   for existing Docker healthcheck/frontend links (DEV-FOUNDATION-001).
 */
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  getLiveness(): HealthResponse {
    return this.healthService.getLiveness();
  }

  @Get("ready")
  getReadiness(): Promise<ReadinessResponse> {
    return this.healthService.getReadiness();
  }

  @Get()
  getHealth(): Promise<ReadinessResponse> {
    return this.healthService.getReadiness();
  }
}
