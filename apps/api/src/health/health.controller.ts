import { Controller, Get } from "@nestjs/common";
import type { HealthResponse, ReadinessResponse } from "@dispatch/shared-types";
import { Public } from "../auth/decorators/public.decorator";
import { HealthService } from "./health.service";

/**
 * Foundation-only endpoints. Explicitly `@Public()` (AUTH-001 registers a
 * global JwtAuthenticationGuard) — health/readiness must stay reachable
 * without an access token for Docker healthchecks.
 *
 * - GET /health/live  — process liveness, no database dependency.
 * - GET /health/ready — application readiness, database-aware (503 on
 *   database failure).
 * - GET /health        — backward-compatible alias of /health/ready, kept
 *   for existing Docker healthcheck/frontend links (DEV-FOUNDATION-001).
 */
@Public()
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
