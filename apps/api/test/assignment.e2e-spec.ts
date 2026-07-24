import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { Argon2PasswordHasher } from "../src/auth/password/argon2-password-hasher";

/**
 * MVP-04 assignment workflow (e2e). Requires a reachable PostgreSQL via
 * DATABASE_URL with the MVP-04 migration deployed. Creates its own
 * uniquely marked fixtures (actors, candidates, tasks) and deletes exactly
 * those rows afterward — never touches the real operator account or the
 * six seeded roles. Real concurrency/DB-constraint coverage lives in
 * assignment.integration-spec.ts.
 */
describe("MVP-04 assignment workflow (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const passwordHasher = new Argon2PasswordHasher();
  const password = "integration-test-password-only";
  const marker = `mvp04-e2e-${randomUUID()}`;
  const userIds: string[] = [];
  const searchIds: string[] = [];
  const taskIds: string[] = [];

  async function createUser(suffix: string, roleCodes: string[], isActive = true): Promise<string> {
    const user = await prisma.user.create({ data: { displayName: `${marker}-${suffix} (safe to delete)`, isActive } });
    userIds.push(user.id);
    for (const code of roleCodes) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code } });
      await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id } });
    }
    return user.id;
  }

  async function createLoginableUser(suffix: string, roleCodes: string[]) {
    const loginIdNormalized = `mvp04-${randomUUID()}`;
    const passwordHash = await passwordHasher.hash(password);
    const user = await prisma.user.create({
      data: {
        displayName: `${marker}-${suffix} (safe to delete)`,
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

  async function createTaskAtStatus(actorUserId: string, status: "READY_FOR_DISPATCH" | "WAITING_PREPARATION") {
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
        taskNumber: `MVP04-${randomUUID().slice(0, 8)}`,
        status,
        plannedDeliveryDate: new Date("2026-09-01T00:00:00Z"),
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        submittedAt: new Date(),
        destinationSource: "FREE_TEXT",
        customerSearchId: search.id,
        freeTextFallbackReason: "AD_HOC_DESTINATION",
        customerName: `${marker}-customer`,
        destinationName: `${marker}-destination`,
        address: "MVP-04 address",
        snapshotCreatedAt: new Date(),
        events: {
          create: {
            eventType: status === "READY_FOR_DISPATCH" ? "PREPARATION_READY_CONFIRMED" : "TASK_SUBMITTED",
            previousStatus: status === "READY_FOR_DISPATCH" ? "PREPARING" : "DRAFT",
            newStatus: status,
            actorUserId,
          },
        },
      },
    });
    taskIds.push(task.id);
    return task.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await prisma.taskAssignmentSupport.deleteMany({ where: { assignment: { taskId: { in: taskIds } } } });
    await prisma.taskCurrentAssignment.deleteMany({ where: { taskId: { in: taskIds } } });
    // task_assignments has a self-referential RESTRICT FK
    // (previousAssignmentId) — delete newest-first, one at a time, so a
    // REASSIGNMENT row is always gone before the row it supersedes.
    const assignments = await prisma.taskAssignment.findMany({
      where: { taskId: { in: taskIds } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    for (const assignment of assignments) {
      await prisma.taskAssignment.delete({ where: { id: assignment.id } });
    }
    await prisma.taskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.deliveryTask.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.customerMasterSearch.deleteMany({ where: { id: { in: searchIds } } });
    for (const userId of userIds) {
      await prisma.refreshTokenRecord.deleteMany({ where: { session: { userId } } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.userRoleAssignment.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    await app.close();
  });

  it("enforces 401/403 and exposes no DELETE route for assignments or history", async () => {
    const dispatcher = await createLoginableUser("rbac-dispatcher", ["DISPATCHER"]);
    const taskId = await createTaskAtStatus(dispatcher.userId, "READY_FOR_DISPATCH");
    const employee = await createUser("rbac-employee-candidate", ["INTERNAL_DELIVERY_EMPLOYEE"]);

    await request(app.getHttpServer()).post(`/tasks/${taskId}/assignment`).send({ primaryAssigneeUserId: employee, supportingEmployeeUserIds: [] }).expect(401);
    await request(app.getHttpServer()).get(`/tasks/${taskId}/assignment`).expect(401);
    await request(app.getHttpServer()).get("/assignment-candidates").expect(401);
    await request(app.getHttpServer()).get("/assigned-tasks").expect(401);

    const stock = await createLoginableUser("rbac-stock", ["STOCK"]);
    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/assignment`)
      .set("Authorization", `Bearer ${stock.accessToken}`)
      .send({ primaryAssigneeUserId: employee, supportingEmployeeUserIds: [] })
      .expect(403);

    const auditor = await createLoginableUser("rbac-auditor", ["MANAGEMENT_AUDITOR"]);
    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/assignment`)
      .set("Authorization", `Bearer ${auditor.accessToken}`)
      .send({ primaryAssigneeUserId: employee, supportingEmployeeUserIds: [] })
      .expect(403);
    await request(app.getHttpServer()).get("/assignment-candidates").set("Authorization", `Bearer ${auditor.accessToken}`).expect(403);

    const deliveryEmployee = await createLoginableUser("rbac-delivery-employee", ["INTERNAL_DELIVERY_EMPLOYEE"]);
    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/assignment`)
      .set("Authorization", `Bearer ${deliveryEmployee.accessToken}`)
      .send({ primaryAssigneeUserId: employee, supportingEmployeeUserIds: [] })
      .expect(403);
    await request(app.getHttpServer()).get(`/tasks/${taskId}/assignment`).set("Authorization", `Bearer ${deliveryEmployee.accessToken}`).expect(403);

    await request(app.getHttpServer()).delete(`/tasks/${taskId}/assignment`).set("Authorization", `Bearer ${stock.accessToken}`).expect(404);
    await request(app.getHttpServer()).delete(`/tasks/${taskId}/assignment/history`).set("Authorization", `Bearer ${stock.accessToken}`).expect(404);
  });

  it("runs the initial-assignment happy path with an optional note and exactly-once event/history", async () => {
    const dispatcher = await createLoginableUser("happy-dispatcher", ["DISPATCHER"]);
    const taskId = await createTaskAtStatus(dispatcher.userId, "READY_FOR_DISPATCH");
    const primary = await createUser("happy-primary", ["INTERNAL_DELIVERY_EMPLOYEE"]);
    const support = await createUser("happy-support", ["INTERNAL_DELIVERY_EMPLOYEE"]);

    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: primary, supportingEmployeeUserIds: [support], note: "  Please confirm on arrival.  " })
      .expect(201);

    expect(res.body.assignment.assignmentType).toBe("INITIAL");
    expect(res.body.assignment.primaryAssignee.userId).toBe(primary);
    expect(res.body.assignment.supportingEmployees).toHaveLength(1);
    expect(res.body.assignment.supportingEmployees[0].userId).toBe(support);
    expect(res.body.assignment.note).toBe("Please confirm on arrival.");
    expect(res.body.assignment.reason).toBeNull();
    expect(res.body.assignment.previousAssignmentId).toBeNull();

    const task = await prisma.deliveryTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.status).toBe("ASSIGNED");

    const currentCount = await prisma.taskCurrentAssignment.count({ where: { taskId } });
    expect(currentCount).toBe(1);
    const historyCount = await prisma.taskAssignment.count({ where: { taskId } });
    expect(historyCount).toBe(1);
    const events = await prisma.taskEvent.findMany({ where: { taskId, eventType: "TASK_ASSIGNED" } });
    expect(events).toHaveLength(1);
    expect(events[0]?.previousStatus).toBe("READY_FOR_DISPATCH");
    expect(events[0]?.newStatus).toBe("ASSIGNED");

    const history = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/assignment/history`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0].assignmentType).toBe("INITIAL");
  });

  it("rejects an inactive primary, wrong-role primary, inactive support, wrong-role support, duplicate support, and primary/support overlap", async () => {
    const dispatcher = await createLoginableUser("validation-dispatcher", ["DISPATCHER"]);
    const activeEmployee = await createUser("validation-active", ["INTERNAL_DELIVERY_EMPLOYEE"]);
    const inactiveEmployee = await createUser("validation-inactive", ["INTERNAL_DELIVERY_EMPLOYEE"], false);
    const wrongRoleUser = await createUser("validation-wrong-role", ["STOCK"]);
    const otherEmployee = await createUser("validation-other", ["INTERNAL_DELIVERY_EMPLOYEE"]);

    async function attempt(body: Record<string, unknown>) {
      const taskId = await createTaskAtStatus(dispatcher.userId, "READY_FOR_DISPATCH");
      return { taskId, res: await request(app.getHttpServer()).post(`/tasks/${taskId}/assignment`).set("Authorization", `Bearer ${dispatcher.accessToken}`).send(body) };
    }

    const inactivePrimary = await attempt({ primaryAssigneeUserId: inactiveEmployee, supportingEmployeeUserIds: [] });
    expect(inactivePrimary.res.status).toBe(400);

    const wrongRolePrimary = await attempt({ primaryAssigneeUserId: wrongRoleUser, supportingEmployeeUserIds: [] });
    expect(wrongRolePrimary.res.status).toBe(400);

    const inactiveSupport = await attempt({ primaryAssigneeUserId: activeEmployee, supportingEmployeeUserIds: [inactiveEmployee] });
    expect(inactiveSupport.res.status).toBe(400);

    const wrongRoleSupport = await attempt({ primaryAssigneeUserId: activeEmployee, supportingEmployeeUserIds: [wrongRoleUser] });
    expect(wrongRoleSupport.res.status).toBe(400);

    const duplicateSupport = await attempt({ primaryAssigneeUserId: activeEmployee, supportingEmployeeUserIds: [otherEmployee, otherEmployee] });
    expect(duplicateSupport.res.status).toBe(400);

    const overlap = await attempt({ primaryAssigneeUserId: activeEmployee, supportingEmployeeUserIds: [activeEmployee] });
    expect(overlap.res.status).toBe(400);

    for (const { taskId } of [inactivePrimary, wrongRolePrimary, inactiveSupport, wrongRoleSupport, duplicateSupport, overlap]) {
      const task = await prisma.deliveryTask.findUniqueOrThrow({ where: { id: taskId } });
      expect(task.status).toBe("READY_FOR_DISPATCH");
      expect(await prisma.taskAssignment.count({ where: { taskId } })).toBe(0);
      expect(await prisma.taskCurrentAssignment.count({ where: { taskId } })).toBe(0);
      expect(await prisma.taskEvent.count({ where: { taskId, eventType: "TASK_ASSIGNED" } })).toBe(0);
    }
  });

  it("rejects assignment from the wrong task status and rejects a second initial assignment", async () => {
    const dispatcher = await createLoginableUser("status-dispatcher", ["DISPATCHER"]);
    const primary = await createUser("status-primary", ["INTERNAL_DELIVERY_EMPLOYEE"]);

    const waitingTaskId = await createTaskAtStatus(dispatcher.userId, "WAITING_PREPARATION");
    await request(app.getHttpServer())
      .post(`/tasks/${waitingTaskId}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: primary, supportingEmployeeUserIds: [] })
      .expect(409);

    const readyTaskId = await createTaskAtStatus(dispatcher.userId, "READY_FOR_DISPATCH");
    await request(app.getHttpServer())
      .post(`/tasks/${readyTaskId}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: primary, supportingEmployeeUserIds: [] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tasks/${readyTaskId}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: primary, supportingEmployeeUserIds: [] })
      .expect(409);

    expect(await prisma.taskAssignment.count({ where: { taskId: readyTaskId } })).toBe(1);
    expect(await prisma.taskCurrentAssignment.count({ where: { taskId: readyTaskId } })).toBe(1);
  });

  it("does not hard-block assignment when the candidate already has an active task, and reports the workload count", async () => {
    const dispatcher = await createLoginableUser("workload-dispatcher", ["DISPATCHER"]);
    const primary = await createUser("workload-primary", ["INTERNAL_DELIVERY_EMPLOYEE"]);

    const taskOne = await createTaskAtStatus(dispatcher.userId, "READY_FOR_DISPATCH");
    await request(app.getHttpServer())
      .post(`/tasks/${taskOne}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: primary, supportingEmployeeUserIds: [] })
      .expect(201);

    const taskTwo = await createTaskAtStatus(dispatcher.userId, "READY_FOR_DISPATCH");
    await request(app.getHttpServer())
      .post(`/tasks/${taskTwo}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: primary, supportingEmployeeUserIds: [] })
      .expect(201);

    const candidates = await request(app.getHttpServer())
      .get(`/assignment-candidates?search=${encodeURIComponent(marker)}`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(200);
    const candidate = candidates.body.items.find((item: { userId: string }) => item.userId === primary);
    expect(candidate).toBeDefined();
    expect(candidate.activeTaskCount).toBe(2);
    expect(candidate.passwordHash).toBeUndefined();
    expect(candidate.loginIdNormalized).toBeUndefined();
  });

  it("runs the reassignment happy path, requires a non-blank reason, and enforces the stale-write precondition with zero residue", async () => {
    const dispatcher = await createLoginableUser("reassign-dispatcher", ["DISPATCHER"]);
    const originalPrimary = await createUser("reassign-original", ["INTERNAL_DELIVERY_EMPLOYEE"]);
    const newPrimary = await createUser("reassign-new", ["INTERNAL_DELIVERY_EMPLOYEE"]);
    const taskId = await createTaskAtStatus(dispatcher.userId, "READY_FOR_DISPATCH");

    const initial = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: originalPrimary, supportingEmployeeUserIds: [] })
      .expect(201);
    const currentAssignmentId = initial.body.assignment.id as string;

    // Blank/whitespace-only reasons are rejected before any state changes.
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: newPrimary, supportingEmployeeUserIds: [], reason: "   ", expectedCurrentAssignmentId: currentAssignmentId })
      .expect(400);

    // Stale precondition: wrong expected id is rejected with no residue.
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: newPrimary, supportingEmployeeUserIds: [], reason: "Original driver unavailable.", expectedCurrentAssignmentId: randomUUID() })
      .expect(409);

    expect(await prisma.taskAssignment.count({ where: { taskId } })).toBe(1);
    const stalePointer = await prisma.taskCurrentAssignment.findUniqueOrThrow({ where: { taskId } });
    expect(stalePointer.currentAssignmentId).toBe(currentAssignmentId);
    expect(await prisma.taskEvent.count({ where: { taskId, eventType: "TASK_REASSIGNED" } })).toBe(0);

    const reassigned = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: newPrimary, supportingEmployeeUserIds: [], reason: "Original driver unavailable.", expectedCurrentAssignmentId: currentAssignmentId })
      .expect(200);
    expect(reassigned.body.assignment.assignmentType).toBe("REASSIGNMENT");
    expect(reassigned.body.assignment.primaryAssignee.userId).toBe(newPrimary);
    expect(reassigned.body.assignment.reason).toBe("Original driver unavailable.");
    expect(reassigned.body.assignment.previousAssignmentId).toBe(currentAssignmentId);

    const task = await prisma.deliveryTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.status).toBe("ASSIGNED");
    expect(await prisma.taskCurrentAssignment.count({ where: { taskId } })).toBe(1);
    expect(await prisma.taskAssignment.count({ where: { taskId } })).toBe(2);
    const reassignEvents = await prisma.taskEvent.findMany({ where: { taskId, eventType: "TASK_REASSIGNED" } });
    expect(reassignEvents).toHaveLength(1);
    expect(reassignEvents[0]?.previousStatus).toBe("ASSIGNED");
    expect(reassignEvents[0]?.newStatus).toBe("ASSIGNED");

    // Reassignment is rejected once the task is no longer ASSIGNED... but MVP-04
    // never transitions past ASSIGNED, so instead verify a second stale attempt
    // against the now-superseded id is rejected without residue.
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: originalPrimary, supportingEmployeeUserIds: [], reason: "Retry with stale id.", expectedCurrentAssignmentId: currentAssignmentId })
      .expect(409);
    expect(await prisma.taskAssignment.count({ where: { taskId } })).toBe(2);

    const history = await request(app.getHttpServer())
      .get(`/tasks/${taskId}/assignment/history`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .expect(200);
    expect(history.body.items).toHaveLength(2);
    expect(history.body.items.map((item: { assignmentType: string }) => item.assignmentType).sort()).toEqual(["INITIAL", "REASSIGNMENT"]);
  });

  it("enforces record scope: only the current primary assignee can read their assigned task, not a supporting-only or unrelated employee", async () => {
    const dispatcher = await createLoginableUser("scope-dispatcher", ["DISPATCHER"]);
    const primary = await createLoginableUser("scope-primary", ["INTERNAL_DELIVERY_EMPLOYEE"]);
    const support = await createLoginableUser("scope-support", ["INTERNAL_DELIVERY_EMPLOYEE"]);
    const unrelated = await createLoginableUser("scope-unrelated", ["INTERNAL_DELIVERY_EMPLOYEE"]);
    const taskId = await createTaskAtStatus(dispatcher.userId, "READY_FOR_DISPATCH");

    await request(app.getHttpServer())
      .post(`/tasks/${taskId}/assignment`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({ primaryAssigneeUserId: primary.userId, supportingEmployeeUserIds: [support.userId] })
      .expect(201);

    const myList = await request(app.getHttpServer()).get("/assigned-tasks").set("Authorization", `Bearer ${primary.accessToken}`).expect(200);
    expect(myList.body.items.some((item: { id: string }) => item.id === taskId)).toBe(true);

    const detail = await request(app.getHttpServer()).get(`/assigned-tasks/${taskId}`).set("Authorization", `Bearer ${primary.accessToken}`).expect(200);
    expect(detail.body.id).toBe(taskId);
    expect(detail.body.supportingEmployees.map((item: { userId: string }) => item.userId)).toContain(support.userId);

    const supportList = await request(app.getHttpServer()).get("/assigned-tasks").set("Authorization", `Bearer ${support.accessToken}`).expect(200);
    expect(supportList.body.items.some((item: { id: string }) => item.id === taskId)).toBe(false);
    await request(app.getHttpServer()).get(`/assigned-tasks/${taskId}`).set("Authorization", `Bearer ${support.accessToken}`).expect(404);

    const unrelatedList = await request(app.getHttpServer()).get("/assigned-tasks").set("Authorization", `Bearer ${unrelated.accessToken}`).expect(200);
    expect(unrelatedList.body.items.some((item: { id: string }) => item.id === taskId)).toBe(false);
    await request(app.getHttpServer()).get(`/assigned-tasks/${taskId}`).set("Authorization", `Bearer ${unrelated.accessToken}`).expect(404);
  });
});
