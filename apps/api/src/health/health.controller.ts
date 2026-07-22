import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@dispatch/shared-types";
import { HealthService } from "./health.service";

/**
 * Foundation-only endpoint. No authentication is applied here on purpose:
 * AUTH-001 (JWT access/refresh + server-side revocation) is a future
 * milestone, and /health must stay reachable for Docker healthchecks.
 */
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
