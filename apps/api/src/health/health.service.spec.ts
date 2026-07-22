import { ServiceUnavailableException } from "@nestjs/common";
import { HealthService } from "./health.service";
import type { PrismaService } from "../infrastructure/database/prisma/prisma.service";

describe("HealthService", () => {
  let prisma: { $queryRaw: jest.Mock };
  let service: HealthService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    service = new HealthService(prisma as unknown as PrismaService);
  });

  it("liveness returns ok/dispatch-api without touching the database", () => {
    const result = service.getLiveness();

    expect(result).toEqual({ status: "ok", service: "dispatch-api" });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("readiness returns ok with database status when the query succeeds", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const result = await service.getReadiness();

    expect(result).toEqual({ status: "ok", service: "dispatch-api", database: "ok" });
  });

  it("readiness throws a generic 503 when the database query fails", async () => {
    prisma.$queryRaw.mockRejectedValue(
      new Error("Can't reach database server at `db`:`5432`: password authentication failed"),
    );

    await expect(service.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("never leaks database connection details in the thrown exception", async () => {
    prisma.$queryRaw.mockRejectedValue(
      new Error('FATAL: password authentication failed for user "dispatch_user" at host 10.0.0.5'),
    );

    try {
      await service.getReadiness();
      throw new Error("expected getReadiness() to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const serialized = JSON.stringify((error as ServiceUnavailableException).getResponse());
      expect(serialized).not.toMatch(/password|10\.0\.0\.5|dispatch_user|DATABASE_URL/i);
    }
  });
});
