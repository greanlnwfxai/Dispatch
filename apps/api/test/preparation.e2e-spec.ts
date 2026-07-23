import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash as createNodeHash, randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { Argon2PasswordHasher } from "../src/auth/password/argon2-password-hasher";

describe("MVP-03 preparation workflow (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const passwordHasher = new Argon2PasswordHasher();
  const password = "integration-test-password-only";
  const marker = `mvp03-e2e-${randomUUID()}`;
  const evidenceRoot = path.join(os.tmpdir(), marker);
  const userIds: string[] = [];
  const searchIds: string[] = [];
  const taskIds: string[] = [];

  async function createLoginableUser(roleCodes: string[]) {
    const loginIdNormalized = `mvp03-${randomUUID()}`;
    const passwordHash = await passwordHasher.hash(password);
    const user = await prisma.user.create({
      data: {
        displayName: `${marker}-${roleCodes.join("-")}`,
        loginIdNormalized,
        passwordHash,
        credentialsEnabled: true,
        credentialsUpdatedAt: new Date(),
      },
    });
    userIds.push(user.id);
    for (const code of roleCodes) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code } });
      await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id } });
    }
    const loginRes = await request(app.getHttpServer()).post("/auth/login").send({ loginId: loginIdNormalized, password }).expect(200);
    return { userId: user.id, accessToken: loginRes.body.accessToken as string };
  }

  async function createWaitingPreparationTask(actorUserId: string) {
    const search = await prisma.customerMasterSearch.create({
      data: {
        searchedByUserId: actorUserId,
        normalizedQuery: marker,
        matchedCustomerDestinationIds: [],
        resultCount: 0,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    searchIds.push(search.id);
    const task = await prisma.deliveryTask.create({
      data: {
        taskNumber: `MVP03-${randomUUID().slice(0, 8)}`,
        status: "WAITING_PREPARATION",
        plannedDeliveryDate: new Date("2026-09-01T00:00:00Z"),
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        submittedAt: new Date(),
        destinationSource: "FREE_TEXT",
        customerSearchId: search.id,
        freeTextFallbackReason: "AD_HOC_DESTINATION",
        customerName: `${marker}-customer`,
        destinationName: `${marker}-destination`,
        address: "MVP-03 address",
        snapshotCreatedAt: new Date(),
        items: {
          create: [
            { lineNumber: 1, description: "Boxes", plannedQuantity: "2", unit: "BOX" },
            { lineNumber: 2, description: "Pallets", plannedQuantity: "1", unit: "PALLET" },
          ],
        },
        events: {
          create: {
            eventType: "TASK_SUBMITTED",
            previousStatus: "DRAFT",
            newStatus: "WAITING_PREPARATION",
            actorUserId,
          },
        },
      },
    });
    taskIds.push(task.id);
    return task.id;
  }

  beforeAll(async () => {
    process.env.EVIDENCE_STORAGE_ROOT = evidenceRoot;
    await prisma.$connect();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    const preparations = await prisma.preparationRecord.findMany({ where: { taskId: { in: taskIds } }, select: { id: true } });
    const preparationIds = preparations.map((prep) => prep.id);
    await prisma.preparationDiscrepancyReport.updateMany({
      where: { preparationId: { in: preparationIds } },
      data: { linkedCorrectionId: null },
    });
    await prisma.preparationCorrectionRecord.deleteMany({ where: { preparationId: { in: preparationIds } } });
    await prisma.preparationDiscrepancyReport.deleteMany({ where: { preparationId: { in: preparationIds } } });
    await prisma.preparationEvidence.deleteMany({ where: { preparationId: { in: preparationIds } } });
    await prisma.preparationIssue.deleteMany({ where: { preparationId: { in: preparationIds } } });
    await prisma.preparationItem.deleteMany({ where: { preparationId: { in: preparationIds } } });
    await prisma.preparationRecord.deleteMany({ where: { id: { in: preparationIds } } });
    await prisma.taskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.deliveryTask.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.customerMasterSearch.deleteMany({ where: { id: { in: searchIds } } });
    for (const userId of userIds) {
      await prisma.refreshTokenRecord.deleteMany({ where: { session: { userId } } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.userRoleAssignment.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await fs.rm(evidenceRoot, { recursive: true, force: true });
    await prisma.$disconnect();
    await app.close();
  });

  it("enforces 401/403 and does not expose DELETE routes", async () => {
    const admin = await createLoginableUser(["ADMIN"]);
    const taskId = await createWaitingPreparationTask(admin.userId);
    await request(app.getHttpServer()).post(`/tasks/${taskId}/preparation/start`).expect(401);

    const dispatcher = await createLoginableUser(["DISPATCHER"]);
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/preparation`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ items: [] })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}/preparation`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(404);
  });

  it("runs the Stock preparation flow with photo and issue gates", async () => {
    const stock = await createLoginableUser(["STOCK"]);
    const taskId = await createWaitingPreparationTask(stock.userId);

    const started = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/start`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .expect(200);
    expect(started.body.taskStatus).toBe("PREPARING");
    expect(started.body.items).toHaveLength(2);

    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/confirm-ready`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .expect(422);

    const updated = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/preparation`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .send({
        items: started.body.items.map((item: { id: string }) => ({
          preparationItemId: item.id,
          preparedQuantity: "1",
          notes: "prepared by e2e",
        })),
      })
      .expect(200);
    expect(updated.body.items[0].preparedQuantity).toBe("1");

    const withIssue = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/issues`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .send({ preparationItemId: started.body.items[0].id, description: "Box label mismatch" })
      .expect(201);
    const issueId = withIssue.body.issues[0].id as string;

    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/confirm-ready`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .expect(422);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/preparation/issues/${issueId}/resolve`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .send({ resolutionNote: "Label checked and corrected." })
      .expect(200);

    const pngBytes = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/evidence`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .attach("photo", pngBytes, { filename: "wrong.jpg", contentType: "image/jpeg" })
      .expect(400);

    const evidenceRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/evidence`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .attach("photo", pngBytes, { filename: "loading.png", contentType: "image/png" })
      .expect(201);
    expect(evidenceRes.body.evidence).toHaveLength(1);
    const evidenceId = evidenceRes.body.evidence[0].id as string;

    const privateRead = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/preparation/evidence/${evidenceId}`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .expect(200);
    expect(privateRead.headers["cache-control"]).toContain("private");
    expect(createHash(privateRead.body).length).toBe(64);

    const ready = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/confirm-ready`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .expect(200);
    expect(ready.body.taskStatus).toBe("READY_FOR_DISPATCH");

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/preparation`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .send({ items: [{ preparationItemId: started.body.items[0].id, preparedQuantity: "2" }] })
      .expect(400);
  });

  it("supports post-transit discrepancy and correction governance without changing main Task status", async () => {
    const stock = await createLoginableUser(["STOCK"]);
    const admin = await createLoginableUser(["ADMIN"]);
    const superAdmin = await createLoginableUser(["SUPER_ADMIN"]);
    const taskId = await createWaitingPreparationTask(stock.userId);

    const started = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/start`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/preparation`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .send({
        items: started.body.items.map((item: { id: string }) => ({
          preparationItemId: item.id,
          preparedQuantity: "1",
        })),
      })
      .expect(200);
    const pngBytes = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/evidence`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .attach("photo", pngBytes, { filename: "loading.png", contentType: "image/png" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/confirm-ready`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .expect(200);

    await prisma.deliveryTask.update({ where: { id: taskId }, data: { status: "IN_TRANSIT" } });

    const reportRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/discrepancy-reports`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .send({ description: "Stock found a mismatch after dispatch start." })
      .expect(201);
    const reportId = reportRes.body.discrepancyReports[0].id as string;

    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/corrections`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .send({
        discrepancyReportId: reportId,
        materiality: "MATERIAL",
        reason: "Stock reported mismatch.",
        changeSummary: "Create exception record only.",
        correctedOrExceptionSnapshot: { exception: "reported mismatch" },
      })
      .expect(403);

    const correctionRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/preparation/corrections`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        discrepancyReportId: reportId,
        materiality: "MATERIAL",
        reason: "Stock reported mismatch.",
        changeSummary: "Create exception record only.",
        correctedOrExceptionSnapshot: { exception: "reported mismatch" },
      })
      .expect(201);
    const correction = correctionRes.body.corrections[0];
    expect(correction.reviewStatus).toBe("PENDING_REVIEW");
    expect(correction.originalPreparationSnapshot.items).toHaveLength(2);

    const reviewed = await request(app.getHttpServer())
      .post(`/preparation-corrections/${correction.id}/review`)
      .set("Authorization", `Bearer ${superAdmin.accessToken}`)
      .send({ reviewNote: "Retrospective review completed." })
      .expect(200);
    expect(reviewed.body.reviewStatus).toBe("REVIEWED");

    const task = await prisma.deliveryTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.status).toBe("IN_TRANSIT");
  });
});

function createHash(bytes: Buffer): string {
  return createNodeHash("sha256").update(bytes).digest("hex");
}
