import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { HealthResponse, ReadinessResponse } from "@dispatch/shared-types";
import { PrismaService } from "../infrastructure/database/prisma/prisma.service";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  getLiveness(): HealthResponse {
    return {
      status: "ok",
      service: "dispatch-api",
    };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      // Logged server-side only — the thrown exception below stays generic
      // so no host/credential/SQL detail ever reaches the response body.
      this.logger.error(
        `Readiness check failed: database query did not succeed (${
          error instanceof Error ? error.message : "unknown error"
        })`,
      );
      throw new ServiceUnavailableException("Service unavailable");
    }

    return {
      status: "ok",
      service: "dispatch-api",
      database: "ok",
    };
  }
}
