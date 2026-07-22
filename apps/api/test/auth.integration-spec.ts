import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DISPATCH_ROLE_CODES } from "@dispatch/shared-types";
import { Argon2PasswordHasher } from "../src/auth/password/argon2-password-hasher";
import { RefreshTokenService } from "../src/auth/tokens/refresh-token.service";
import { PrismaSessionRepository } from "../src/infrastructure/database/repositories/prisma-session.repository";
import { PrismaUserRepository } from "../src/infrastructure/database/repositories/prisma-user.repository";
import { PrismaUserRoleAssignmentRepository } from "../src/infrastructure/database/repositories/prisma-user-role-assignment.repository";
import { PrismaService } from "../src/infrastructure/database/prisma/prisma.service";

/**
 * Database integration coverage for the AUTH-001 persistence boundary.
 * Requires a reachable PostgreSQL via DATABASE_URL with the authentication
 * migration already deployed (see scripts/db-verify.sh). Creates only its
 * own uniquely-scoped test User/AuthSession/RefreshTokenRecord rows and
 * deletes exactly those rows afterward — never touches seeded roles or any
 * other data.
 */
describe("Authentication database integration", () => {
  const prisma = new PrismaClient();
  const passwordHasher = new Argon2PasswordHasher();
  const refreshTokenService = new RefreshTokenService();

  let prismaService: PrismaService;
  let sessionRepository: PrismaSessionRepository;
  let userRepository: PrismaUserRepository;
  let roleAssignmentRepository: PrismaUserRoleAssignmentRepository;

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    prismaService = new PrismaService();
    await prismaService.$connect();
    sessionRepository = new PrismaSessionRepository(prismaService);
    userRepository = new PrismaUserRepository(prismaService);
    roleAssignmentRepository = new PrismaUserRoleAssignmentRepository(prismaService);
  });

  afterAll(async () => {
    // Exact-scope cleanup: delete only the rows this suite created, in FK
    // dependency order, never a truncate/reset against shared data.
    for (const userId of createdUserIds) {
      await prisma.refreshTokenRecord.deleteMany({
        where: { session: { userId } },
      });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.userRoleAssignment.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    await prismaService.$disconnect();
  });

  async function createCredentialUser(options: {
    displayName: string;
    credentialsEnabled?: boolean;
    isActive?: boolean;
    roleCodes?: string[];
  }) {
    const loginIdNormalized = `auth-integration-${randomUUID()}`;
    const passwordHash = await passwordHasher.hash("integration-test-password-only");
    const user = await prisma.user.create({
      data: {
        displayName: options.displayName,
        loginIdNormalized,
        passwordHash,
        credentialsEnabled: options.credentialsEnabled ?? true,
        credentialsUpdatedAt: new Date(),
        isActive: options.isActive ?? true,
      },
    });
    createdUserIds.push(user.id);

    for (const code of options.roleCodes ?? []) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code } });
      await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id } });
    }

    return { user, loginIdNormalized };
  }

  it("finds a credential-enabled User by normalized loginId", async () => {
    const { user, loginIdNormalized } = await createCredentialUser({ displayName: "Integration User A" });

    const found = await userRepository.findByLoginId(loginIdNormalized);
    expect(found?.id).toBe(user.id);
    expect(found?.credentialsEnabled).toBe(true);
    expect(found?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("returns null for an unknown loginId", async () => {
    const found = await userRepository.findByLoginId(`does-not-exist-${randomUUID()}`);
    expect(found).toBeNull();
  });

  it("creates an AuthSession and RefreshTokenRecord with only a hashed token persisted", async () => {
    const { user } = await createCredentialUser({ displayName: "Integration User B" });
    const session = await sessionRepository.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(session.userId).toBe(user.id);
    expect(session.revokedAt).toBeNull();

    const { secret, hash } = refreshTokenService.generateSecret();
    const tokenRecord = await sessionRepository.createRefreshToken({
      sessionId: session.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const rawRow = await prisma.refreshTokenRecord.findUniqueOrThrow({ where: { id: tokenRecord.id } });
    expect(rawRow.tokenHash).toBe(hash);
    expect(rawRow.tokenHash).not.toBe(secret);
    expect(rawRow.tokenHash).not.toContain(secret);
  });

  it("rotates a refresh token atomically, marking the old one used and linking the replacement", async () => {
    const { user } = await createCredentialUser({ displayName: "Integration User C" });
    const session = await sessionRepository.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const first = await sessionRepository.createRefreshToken({
      sessionId: session.id,
      tokenHash: refreshTokenService.hashSecret(`first-secret-${randomUUID()}`),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const rotated = await sessionRepository.rotateRefreshToken({
      currentTokenId: first.id,
      sessionId: session.id,
      newTokenHash: refreshTokenService.hashSecret(`second-secret-${randomUUID()}`),
      newExpiresAt: new Date(Date.now() + 60_000),
    });

    expect(rotated).not.toBeNull();
    const oldRow = await prisma.refreshTokenRecord.findUniqueOrThrow({ where: { id: first.id } });
    expect(oldRow.usedAt).not.toBeNull();
    expect(oldRow.replacedByTokenId).toBe(rotated?.id);
  });

  it("refuses to rotate an already-used token a second time (reuse protection)", async () => {
    const { user } = await createCredentialUser({ displayName: "Integration User D" });
    const session = await sessionRepository.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const first = await sessionRepository.createRefreshToken({
      sessionId: session.id,
      tokenHash: refreshTokenService.hashSecret(`first-secret-${randomUUID()}`),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await sessionRepository.rotateRefreshToken({
      currentTokenId: first.id,
      sessionId: session.id,
      newTokenHash: refreshTokenService.hashSecret(`second-secret-${randomUUID()}`),
      newExpiresAt: new Date(Date.now() + 60_000),
    });

    const secondAttempt = await sessionRepository.rotateRefreshToken({
      currentTokenId: first.id,
      sessionId: session.id,
      newTokenHash: refreshTokenService.hashSecret(`third-secret-${randomUUID()}`),
      newExpiresAt: new Date(Date.now() + 60_000),
    });

    expect(secondAttempt).toBeNull();
  });

  it("under concurrent rotation of the same token, exactly one attempt succeeds", async () => {
    const { user } = await createCredentialUser({ displayName: "Integration User E" });
    const session = await sessionRepository.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const first = await sessionRepository.createRefreshToken({
      sessionId: session.id,
      tokenHash: refreshTokenService.hashSecret(`first-secret-${randomUUID()}`),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const [resultA, resultB] = await Promise.all([
      sessionRepository.rotateRefreshToken({
        currentTokenId: first.id,
        sessionId: session.id,
        newTokenHash: refreshTokenService.hashSecret(`race-a-${randomUUID()}`),
        newExpiresAt: new Date(Date.now() + 60_000),
      }),
      sessionRepository.rotateRefreshToken({
        currentTokenId: first.id,
        sessionId: session.id,
        newTokenHash: refreshTokenService.hashSecret(`race-b-${randomUUID()}`),
        newExpiresAt: new Date(Date.now() + 60_000),
      }),
    ]);

    const successCount = [resultA, resultB].filter((result) => result !== null).length;
    expect(successCount).toBe(1);
  });

  it("revokeSession immediately blocks the session from being treated as active", async () => {
    const { user } = await createCredentialUser({ displayName: "Integration User F" });
    const session = await sessionRepository.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await sessionRepository.revokeSession(session.id, "test_revocation");
    const reloaded = await sessionRepository.findSessionById(session.id);
    expect(reloaded?.revokedAt).not.toBeNull();
    expect(reloaded?.revokedReason).toBe("test_revocation");
  });

  it("an expired session is distinguishable from an active one via expiresAt", async () => {
    const { user } = await createCredentialUser({ displayName: "Integration User G" });
    const session = await sessionRepository.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    const reloaded = await sessionRepository.findSessionById(session.id);
    expect(reloaded && reloaded.expiresAt.getTime() < Date.now()).toBe(true);
  });

  it("logoutAll-equivalent revokeAllSessionsForUser revokes every session for that user only", async () => {
    const { user: userA } = await createCredentialUser({ displayName: "Integration User H1" });
    const { user: userB } = await createCredentialUser({ displayName: "Integration User H2" });

    const sessionA1 = await sessionRepository.createSession({ userId: userA.id, expiresAt: new Date(Date.now() + 60_000) });
    const sessionA2 = await sessionRepository.createSession({ userId: userA.id, expiresAt: new Date(Date.now() + 60_000) });
    const sessionB = await sessionRepository.createSession({ userId: userB.id, expiresAt: new Date(Date.now() + 60_000) });

    const revokedCount = await sessionRepository.revokeAllSessionsForUser(userA.id, "logout_all");
    expect(revokedCount).toBe(2);

    expect((await sessionRepository.findSessionById(sessionA1.id))?.revokedAt).not.toBeNull();
    expect((await sessionRepository.findSessionById(sessionA2.id))?.revokedAt).not.toBeNull();
    expect((await sessionRepository.findSessionById(sessionB.id))?.revokedAt).toBeNull();
  });

  it("resolves multiple assigned roles for one user without enforcing single-role cardinality", async () => {
    const { user } = await createCredentialUser({
      displayName: "Integration User I",
      roleCodes: ["ADMIN", "DISPATCHER"],
    });

    const roleCodes = await roleAssignmentRepository.listRoleCodesForUser(user.id);
    expect(roleCodes.sort()).toEqual(["ADMIN", "DISPATCHER"].sort());
  });

  it("resolves zero roles for a user with no assignment (also not enforced)", async () => {
    const { user } = await createCredentialUser({ displayName: "Integration User J" });
    const roleCodes = await roleAssignmentRepository.listRoleCodesForUser(user.id);
    expect(roleCodes).toEqual([]);
  });

  it("still has exactly the six approved system roles (unaffected by AUTH-001)", async () => {
    const roles = await prisma.role.findMany({ orderBy: { code: "asc" } });
    expect(roles.map((role) => role.code).sort()).toEqual([...DISPATCH_ROLE_CODES].sort());
  });
});
