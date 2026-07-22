import { HealthService } from "../src/health/health.service";
import { PrismaService } from "../src/infrastructure/database/prisma/prisma.service";

/**
 * Readiness/liveness against a real PostgreSQL connection
 * (DEV-FOUNDATION-002). The database-failure (503) path is covered
 * deterministically with a mocked Prisma client in
 * src/health/health.service.spec.ts — this suite only proves the
 * success path against a live database and that liveness stays
 * database-free.
 */
describe("HealthService readiness/liveness (database integration)", () => {
  let prismaService: PrismaService;
  let healthService: HealthService;

  beforeAll(async () => {
    prismaService = new PrismaService();
    await prismaService.$connect();
    healthService = new HealthService(prismaService);
  });

  afterAll(async () => {
    await prismaService.$disconnect();
  });

  it("returns database ok when PostgreSQL is reachable", async () => {
    await expect(healthService.getReadiness()).resolves.toEqual({
      status: "ok",
      service: "dispatch-api",
      database: "ok",
    });
  });

  it("liveness does not require a database connection", async () => {
    await prismaService.$disconnect();

    const result = healthService.getLiveness();

    expect(result).toEqual({ status: "ok", service: "dispatch-api" });
  });
});
