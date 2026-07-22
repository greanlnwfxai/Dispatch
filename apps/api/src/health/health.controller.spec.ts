import { ServiceUnavailableException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { expectOkHealthResponse } from "@dispatch/test-utils";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController", () => {
  let controller: HealthController;
  const healthService = {
    getLiveness: jest.fn(),
    getReadiness: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe("GET /health/live", () => {
    it("returns a deterministic ok response identifying dispatch-api", () => {
      healthService.getLiveness.mockReturnValue({ status: "ok", service: "dispatch-api" });

      const result = controller.getLiveness();

      expectOkHealthResponse(result, "dispatch-api");
    });

    it("does not include any secret-shaped fields", () => {
      healthService.getLiveness.mockReturnValue({ status: "ok", service: "dispatch-api" });

      const result = controller.getLiveness();

      expect(Object.keys(result).sort()).toEqual(["service", "status"]);
    });
  });

  describe("GET /health/ready", () => {
    it("returns database ok when the database is reachable", async () => {
      healthService.getReadiness.mockResolvedValue({
        status: "ok",
        service: "dispatch-api",
        database: "ok",
      });

      const result = await controller.getReadiness();

      expect(result).toEqual({ status: "ok", service: "dispatch-api", database: "ok" });
    });

    it("propagates a 503 when the database is unavailable", async () => {
      healthService.getReadiness.mockRejectedValue(new ServiceUnavailableException("Service unavailable"));

      await expect(controller.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe("GET /health", () => {
    it("mirrors the readiness response for backward compatibility", async () => {
      healthService.getReadiness.mockResolvedValue({
        status: "ok",
        service: "dispatch-api",
        database: "ok",
      });

      const result = await controller.getHealth();

      expect(result).toEqual({ status: "ok", service: "dispatch-api", database: "ok" });
    });
  });
});
