import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

/**
 * Full-stack health/readiness e2e test (DEV-FOUNDATION-002). Boots the real
 * AppModule, including PrismaModule, so this requires a reachable
 * PostgreSQL via DATABASE_URL — it is a database integration test, not part
 * of the default `npm test` unit suite. Run via `npm run test:e2e`
 * (apps/api workspace) from `scripts/db-verify.sh` or a database-aware CI
 * job.
 */
describe("Health endpoints (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health/live returns HTTP 200 with a deterministic ok/dispatch-api body", () => {
    return request(app.getHttpServer())
      .get("/health/live")
      .expect(200)
      .expect({ status: "ok", service: "dispatch-api" });
  });

  it("GET /health/ready returns HTTP 200 with database ok when the database is reachable", () => {
    return request(app.getHttpServer())
      .get("/health/ready")
      .expect(200)
      .expect({ status: "ok", service: "dispatch-api", database: "ok" });
  });

  it("GET /health mirrors the readiness response for backward compatibility", () => {
    return request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect({ status: "ok", service: "dispatch-api", database: "ok" });
  });
});
