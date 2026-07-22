import { Injectable } from "@nestjs/common";
import type { HealthResponse } from "@dispatch/shared-types";

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "dispatch-api",
    };
  }
}
