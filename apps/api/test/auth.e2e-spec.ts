import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { Argon2PasswordHasher } from "../src/auth/password/argon2-password-hasher";
import { RbacTestController } from "./support/rbac-test.controller";

/**
 * Full-stack authentication e2e coverage (AUTH-001). Boots the real
 * AppModule (global guards, throttling, RBAC) plus the test-only
 * RbacTestController (see test/support/rbac-test.controller.ts — never
 * part of the production build). Requires a reachable PostgreSQL via
 * DATABASE_URL with the authentication migration deployed. Creates only
 * its own uniquely-scoped test users and deletes them afterward.
 */
describe("Authentication (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const passwordHasher = new Argon2PasswordHasher();

  const PASSWORD = "integration-test-password-only";
  const createdUserIds: string[] = [];

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
    return { loginIdNormalized };
  }

  function extractSetCookie(response: request.Response): string {
    const raw = response.get("set-cookie");
    const setCookieHeader = Array.isArray(raw) ? raw[0] : raw;
    if (!setCookieHeader) {
      throw new Error("Expected a Set-Cookie header in the response.");
    }
    return setCookieHeader;
  }

  function cookiePairOnly(setCookieHeader: string): string {
    return setCookieHeader.split(";")[0];
  }

  beforeAll(async () => {
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RbacTestController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await prisma.refreshTokenRecord.deleteMany({ where: { session: { userId } } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.userRoleAssignment.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    await app.close();
  });

  it("health endpoints remain public with no auth guard", async () => {
    await request(app.getHttpServer()).get("/health/live").expect(200);
    await request(app.getHttpServer()).get("/health/ready").expect(200);
  });

  it("GET /auth/me without an access token returns 401", async () => {
    const res = await request(app.getHttpServer()).get("/auth/me").expect(401);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|prisma|postgres/i);
  });

  it("rejects login with a generic error and no account-existence signal", async () => {
    const unknownRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ loginId: `nonexistent-${randomUUID()}`, password: "whatever-password-1234" });

    const { loginIdNormalized } = await createLoginableUser("Wrong Password User", ["ADMIN"]);
    const wrongPasswordRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ loginId: loginIdNormalized, password: "definitely-the-wrong-password" });

    expect(unknownRes.status).toBe(401);
    expect(wrongPasswordRes.status).toBe(401);
    expect(unknownRes.body.message).toEqual(wrongPasswordRes.body.message);
    expect(JSON.stringify(wrongPasswordRes.body)).not.toMatch(/stack|prisma|postgres|hash/i);
  });

  it("login succeeds, returns an access token but never a refresh token in JSON, and sets an HttpOnly cookie", async () => {
    const { loginIdNormalized } = await createLoginableUser("Login Success User", ["ADMIN"]);

    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ loginId: loginIdNormalized, password: PASSWORD })
      .expect(200);

    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.principal).toMatchObject({ displayName: "Login Success User", roleCodes: ["ADMIN"] });
    expect(JSON.stringify(res.body)).not.toMatch(/refreshToken/i);

    const setCookie = extractSetCookie(res);
    expect(setCookie).toMatch(/dispatch_refresh_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Path=\/auth/i);
  });

  it("GET /auth/me succeeds with the issued access token and never returns loginId/passwordHash", async () => {
    const { loginIdNormalized } = await createLoginableUser("Me Endpoint User", ["DISPATCHER"]);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ loginId: loginIdNormalized, password: PASSWORD })
      .expect(200);

    const meRes = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(meRes.body).toEqual({
      userId: expect.any(String),
      displayName: "Me Endpoint User",
      roleCodes: ["DISPATCHER"],
    });
    expect(JSON.stringify(meRes.body)).not.toMatch(/passwordHash|loginId/i);
  });

  it("refresh rotates the cookie and issues a new access token; the old refresh token cannot be used twice", async () => {
    const { loginIdNormalized } = await createLoginableUser("Refresh Rotation User", ["ADMIN"]);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ loginId: loginIdNormalized, password: PASSWORD })
      .expect(200);

    const firstCookie = cookiePairOnly(extractSetCookie(loginRes));

    const refreshRes = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", firstCookie)
      .expect(200);

    const secondCookie = cookiePairOnly(extractSetCookie(refreshRes));
    expect(secondCookie).not.toBe(firstCookie);
    expect(typeof refreshRes.body.accessToken).toBe("string");
    expect(refreshRes.body.accessToken).not.toBe(loginRes.body.accessToken);

    // Reusing the first (already-rotated) refresh token must fail generically.
    const reuseRes = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", firstCookie)
      .expect(401);
    expect(JSON.stringify(reuseRes.body)).not.toMatch(/stack|prisma|postgres/i);

    // Reuse revokes the session — even the freshly rotated cookie is now dead.
    const afterReuseRes = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", secondCookie)
      .expect(401);
    expect(afterReuseRes.status).toBe(401);
  });

  it("logout clears the refresh cookie and invalidates the session", async () => {
    const { loginIdNormalized } = await createLoginableUser("Logout User", ["ADMIN"]);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ loginId: loginIdNormalized, password: PASSWORD })
      .expect(200);
    const cookie = cookiePairOnly(extractSetCookie(loginRes));

    const logoutRes = await request(app.getHttpServer()).post("/auth/logout").set("Cookie", cookie).expect(200);
    const clearedCookie = extractSetCookie(logoutRes);
    expect(clearedCookie).toMatch(/dispatch_refresh_token=;/);

    await request(app.getHttpServer()).post("/auth/refresh").set("Cookie", cookie).expect(401);
  });

  it("logout is idempotent and never reveals whether a session existed", async () => {
    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Cookie", "dispatch_refresh_token=00000000-0000-0000-0000-000000000000.nonexistent-secret")
      .expect(200);
  });

  it("role guard returns 403 for an authenticated user with an insufficient role", async () => {
    const { loginIdNormalized } = await createLoginableUser("Dispatcher Only User", ["DISPATCHER"]);
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ loginId: loginIdNormalized, password: PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .get("/test-support/rbac/super-admin-only")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get("/test-support/rbac/admin-or-dispatcher")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
      .expect(200);
  });

  it("role guard returns 401 (not 403) when no access token is presented at all", async () => {
    await request(app.getHttpServer()).get("/test-support/rbac/super-admin-only").expect(401);
  });

  it("logout-all revokes every session for that user", async () => {
    const { loginIdNormalized } = await createLoginableUser("Logout All User", ["ADMIN"]);
    const loginA = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ loginId: loginIdNormalized, password: PASSWORD })
      .expect(200);
    const loginB = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ loginId: loginIdNormalized, password: PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/logout-all")
      .set("Authorization", `Bearer ${loginA.body.accessToken}`)
      .expect(200);

    const cookieA = cookiePairOnly(extractSetCookie(loginA));
    const cookieB = cookiePairOnly(extractSetCookie(loginB));
    await request(app.getHttpServer()).post("/auth/refresh").set("Cookie", cookieA).expect(401);
    await request(app.getHttpServer()).post("/auth/refresh").set("Cookie", cookieB).expect(401);
  });

  it("rejects a request to an auth endpoint from a disallowed Origin", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .set("Origin", "https://evil.example.com")
      .send({ loginId: "whoever", password: "whatever-password" })
      .expect(403);
  });
});
