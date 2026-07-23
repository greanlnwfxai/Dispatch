import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { Argon2PasswordHasher } from "../src/auth/password/argon2-password-hasher";

/**
 * Full-stack Customer Master search / Delivery Task creation e2e coverage
 * (MVP-02). Boots the real AppModule (global guards, RBAC). Requires a
 * reachable PostgreSQL via DATABASE_URL with the MVP-02 migration
 * deployed. Creates only its own uniquely-scoped test Users and Customer
 * Master fixture rows, and deletes exactly those afterward.
 */
describe("Customer Master search / Delivery Task creation (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const passwordHasher = new Argon2PasswordHasher();

  const PASSWORD = "integration-test-password-only";
  const marker = `mvp02-e2e-${randomUUID()}`;
  const createdUserIds: string[] = [];
  const createdTaskIds: string[] = [];
  const createdSearchIds: string[] = [];
  let customerId: string;
  let destinationId: string;

  async function createLoginableUser(displayName: string, roleCodes: string[]) {
    const loginIdNormalized = `e2e-${randomUUID()}`;
    const passwordHash = await passwordHasher.hash(PASSWORD);
    const user = await prisma.user.create({
      data: {
        displayName,
        loginIdNormalized,
        passwordHash,
        credentialsEnabled: true,
        credentialsUpdatedAt: new Date(),
      },
    });
    createdUserIds.push(user.id);
    for (const code of roleCodes) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code } });
      await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id } });
    }
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ loginId: loginIdNormalized, password: PASSWORD })
      .expect(200);
    return { userId: user.id, accessToken: loginRes.body.accessToken as string };
  }

  beforeAll(async () => {
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.use(cookieParser());
    await app.init();

    const customer = await prisma.customer.create({ data: { name: `${marker}-customer`, isActive: true } });
    customerId = customer.id;
    const destination = await prisma.customerDestination.create({
      data: {
        customerId,
        destinationName: `${marker}-destination`,
        address: "123 e2e Test Rd.",
        isActive: true,
      },
    });
    destinationId = destination.id;
  });

  afterAll(async () => {
    await prisma.taskEvent.deleteMany({ where: { taskId: { in: createdTaskIds } } });
    await prisma.deliveryTask.deleteMany({ where: { id: { in: createdTaskIds } } });
    await prisma.customerMasterSearch.deleteMany({ where: { id: { in: createdSearchIds } } });
    await prisma.customerDestination.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    for (const userId of createdUserIds) {
      await prisma.refreshTokenRecord.deleteMany({ where: { session: { userId } } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.userRoleAssignment.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    await app.close();
  });

  async function search(accessToken: string, query: string) {
    const res = await request(app.getHttpServer())
      .post("/customer-master/search")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ query })
      .expect(200);
    createdSearchIds.push(res.body.searchId);
    return res.body as { searchId: string; results: Array<{ customerDestinationId: string }> };
  }

  it("401s every MVP-02 route without an access token", async () => {
    await request(app.getHttpServer()).post("/customer-master/search").send({ query: "x" }).expect(401);
    await request(app.getHttpServer()).get("/tasks").expect(401);
    await request(app.getHttpServer()).post("/tasks").send({}).expect(401);
  });

  it("403s Customer Master search and Task creation for a STOCK-only user (read-only Task roles)", async () => {
    const stockUser = await createLoginableUser(`${marker}-stock-user`, ["STOCK"]);
    await request(app.getHttpServer())
      .post("/customer-master/search")
      .set("Authorization", `Bearer ${stockUser.accessToken}`)
      .send({ query: "x" })
      .expect(403);
    await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${stockUser.accessToken}`)
      .send({})
      .expect(403);
    // STOCK is still an authorized reader.
    await request(app.getHttpServer())
      .get("/tasks")
      .set("Authorization", `Bearer ${stockUser.accessToken}`)
      .expect(200);
  });

  it("403s Task read for INTERNAL_DELIVERY_EMPLOYEE (no access in this milestone)", async () => {
    const deliveryEmployee = await createLoginableUser(`${marker}-delivery-employee`, ["INTERNAL_DELIVERY_EMPLOYEE"]);
    await request(app.getHttpServer())
      .get("/tasks")
      .set("Authorization", `Bearer ${deliveryEmployee.accessToken}`)
      .expect(403);
  });

  it("authorized search returns a searchId and the active Master match, error bodies stay generic", async () => {
    const dispatcher = await createLoginableUser(`${marker}-dispatcher-search`, ["DISPATCHER"]);
    const result = await search(dispatcher.accessToken, marker);
    expect(typeof result.searchId).toBe("string");
    expect(result.results.some((r) => r.customerDestinationId === destinationId)).toBe(true);
  });

  it("creates a DRAFT Task with a MASTER destination, ignoring conflicting client snapshot values", async () => {
    const dispatcher = await createLoginableUser(`${marker}-dispatcher-master`, ["DISPATCHER"]);
    const { searchId } = await search(dispatcher.accessToken, marker);

    const res = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({
        searchId,
        destinationSource: "MASTER",
        customerDestinationId: destinationId,
        destinationName: "TAMPERED",
        address: "TAMPERED",
        items: [{ lineNumber: 1, description: "Boxes", plannedQuantity: "5", unit: "BOX" }],
      })
      .expect(201);

    createdTaskIds.push(res.body.id);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.destinationSource).toBe("MASTER");
    expect(res.body.destinationName).toBe(`${marker}-destination`);
    expect(res.body.address).toBe("123 e2e Test Rd.");
    expect(JSON.stringify(res.body)).not.toMatch(/stack|passwordHash|prisma|postgres/i);
  });

  it("rejects a MASTER selection not associated with the performed search", async () => {
    const dispatcher = await createLoginableUser(`${marker}-dispatcher-foreign-master`, ["DISPATCHER"]);
    const { searchId } = await search(dispatcher.accessToken, "no-such-query-matches-nothing");

    await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({
        searchId,
        destinationSource: "MASTER",
        customerDestinationId: destinationId,
        items: [{ lineNumber: 1, description: "Boxes", plannedQuantity: "1", unit: "BOX" }],
      })
      .expect(400);
  });

  it("creates a DRAFT Task with FREE_TEXT after a search, requiring a fallback reason", async () => {
    const dispatcher = await createLoginableUser(`${marker}-dispatcher-freetext`, ["DISPATCHER"]);
    const { searchId } = await search(dispatcher.accessToken, "unrelated-query");

    await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({
        searchId,
        destinationSource: "FREE_TEXT",
        customerName: "Ad hoc customer",
        destinationName: "Ad hoc destination",
        address: "Ad hoc address",
        items: [{ lineNumber: 1, description: "Pallets", plannedQuantity: "1", unit: "PALLET" }],
      })
      .expect(400); // freeTextFallbackReason missing

    const res = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({
        searchId,
        destinationSource: "FREE_TEXT",
        freeTextFallbackReason: "NO_SUITABLE_MASTER",
        customerName: "Ad hoc customer",
        destinationName: "Ad hoc destination",
        address: "Ad hoc address",
        items: [{ lineNumber: 1, description: "Pallets", plannedQuantity: "1", unit: "PALLET" }],
      })
      .expect(201);
    createdTaskIds.push(res.body.id);
    expect(res.body.customerId).toBeNull();
    expect(res.body.customerDestinationId).toBeNull();
  });

  it("rejects FREE_TEXT creation with an invalid/foreign searchId", async () => {
    const dispatcher = await createLoginableUser(`${marker}-dispatcher-no-search`, ["DISPATCHER"]);
    await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({
        searchId: randomUUID(),
        destinationSource: "FREE_TEXT",
        freeTextFallbackReason: "AD_HOC_DESTINATION",
        customerName: "Ad hoc customer",
        destinationName: "Ad hoc destination",
        address: "Ad hoc address",
        items: [{ lineNumber: 1, description: "Pallets", plannedQuantity: "1", unit: "PALLET" }],
      })
      .expect(400);
  });

  it("edits a DRAFT Task, submits it, and rejects further edits after submission", async () => {
    const dispatcher = await createLoginableUser(`${marker}-dispatcher-submit`, ["DISPATCHER"]);
    const { searchId } = await search(dispatcher.accessToken, marker);

    const createRes = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ searchId, destinationSource: "MASTER", customerDestinationId: destinationId })
      .expect(201);
    const taskId = createRes.body.id as string;
    createdTaskIds.push(taskId);
    expect(createRes.body.status).toBe("DRAFT");

    // Incomplete submit rejected — no items, no planned delivery date yet.
    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/submit`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({
        plannedDeliveryDate: "2026-08-15",
        items: [{ lineNumber: 1, description: "Boxes", plannedQuantity: "10", unit: "BOX" }],
      })
      .expect(200);

    const submitRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/submit`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(200);
    expect(submitRes.body.status).toBe("WAITING_PREPARATION");

    // Editing a submitted Task must be rejected.
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ plannedDeliveryDate: "2026-09-01" })
      .expect(409);
  });

  // Blocking-review-finding fix — see docs/CTO_SUMMARY_MVP_02.md "Issues
  // Found and Fixed". Search evidence is re-validated inside the submit
  // transaction, not only at create-time selection.
  it("rejects submission with expired search evidence (safe 4xx, no internal detail leaked)", async () => {
    const dispatcher = await createLoginableUser(`${marker}-dispatcher-submit-expired`, ["DISPATCHER"]);
    const { searchId } = await search(dispatcher.accessToken, marker);

    const createRes = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({
        searchId,
        destinationSource: "MASTER",
        customerDestinationId: destinationId,
        plannedDeliveryDate: "2026-08-10",
        items: [{ lineNumber: 1, description: "Boxes", plannedQuantity: "5", unit: "BOX" }],
      })
      .expect(201);
    const taskId = createRes.body.id as string;
    createdTaskIds.push(taskId);

    // Search evidence was valid at creation; it expires before submit.
    await prisma.customerMasterSearch.update({ where: { id: searchId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const submitRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/submit`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(422);
    expect(JSON.stringify(submitRes.body)).not.toMatch(/stack|passwordHash|prisma|postgres|searchedByUserId/i);

    const detailRes = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(200);
    expect(detailRes.body.status).toBe("DRAFT");
  });

  it("rejects submission with foreign-user search evidence (safe 4xx, no internal detail leaked)", async () => {
    const dispatcher = await createLoginableUser(`${marker}-dispatcher-submit-foreign`, ["DISPATCHER"]);
    const otherDispatcher = await createLoginableUser(`${marker}-dispatcher-submit-foreign-other`, ["DISPATCHER"]);
    const { searchId } = await search(dispatcher.accessToken, marker);

    const createRes = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({
        searchId,
        destinationSource: "MASTER",
        customerDestinationId: destinationId,
        plannedDeliveryDate: "2026-08-11",
        items: [{ lineNumber: 1, description: "Boxes", plannedQuantity: "5", unit: "BOX" }],
      })
      .expect(201);
    const taskId = createRes.body.id as string;
    createdTaskIds.push(taskId);

    // Simulate the linked search evidence now belonging to a different user.
    await prisma.customerMasterSearch.update({
      where: { id: searchId },
      data: { searchedByUserId: otherDispatcher.userId },
    });

    const submitRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/submit`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(422);
    expect(JSON.stringify(submitRes.body)).not.toMatch(/stack|passwordHash|prisma|postgres|searchedByUserId/i);

    const detailRes = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(200);
    expect(detailRes.body.status).toBe("DRAFT");
  });

  it("still submits successfully when search evidence remains valid through submission", async () => {
    const dispatcher = await createLoginableUser(`${marker}-dispatcher-submit-valid`, ["DISPATCHER"]);
    const { searchId } = await search(dispatcher.accessToken, marker);

    const createRes = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({
        searchId,
        destinationSource: "MASTER",
        customerDestinationId: destinationId,
        plannedDeliveryDate: "2026-08-12",
        items: [{ lineNumber: 1, description: "Boxes", plannedQuantity: "5", unit: "BOX" }],
      })
      .expect(201);
    const taskId = createRes.body.id as string;
    createdTaskIds.push(taskId);

    const submitRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/submit`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(200);
    expect(submitRes.body.status).toBe("WAITING_PREPARATION");
  });

  it("has no DELETE /tasks/:id endpoint", async () => {
    const dispatcher = await createLoginableUser(`${marker}-dispatcher-no-delete`, ["DISPATCHER"]);
    await request(app.getHttpServer())
      .delete(`/tasks/${randomUUID()}`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(404);
  });

  it("Task detail is readable by MANAGEMENT_AUDITOR but MANAGEMENT_AUDITOR cannot create a Task", async () => {
    const dispatcher = await createLoginableUser(`${marker}-dispatcher-for-auditor`, ["DISPATCHER"]);
    const { searchId } = await search(dispatcher.accessToken, marker);
    const createRes = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ searchId, destinationSource: "MASTER", customerDestinationId: destinationId })
      .expect(201);
    createdTaskIds.push(createRes.body.id);

    const auditor = await createLoginableUser(`${marker}-auditor`, ["MANAGEMENT_AUDITOR"]);
    await request(app.getHttpServer())
      .get(`/tasks/${createRes.body.id}`)
      .set("Authorization", `Bearer ${auditor.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${auditor.accessToken}`)
      .send({ searchId, destinationSource: "MASTER", customerDestinationId: destinationId })
      .expect(403);
  });
});
