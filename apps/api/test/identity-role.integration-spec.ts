import { execSync } from "node:child_process";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { DISPATCH_ROLE_CODES } from "@dispatch/shared-types";
import { PrismaRoleRepository } from "../src/infrastructure/database/repositories/prisma-role.repository";
import { PrismaUserRepository } from "../src/infrastructure/database/repositories/prisma-user.repository";
import { PrismaService } from "../src/infrastructure/database/prisma/prisma.service";

/**
 * Database integration coverage (DEV-FOUNDATION-002). Requires a reachable
 * PostgreSQL via DATABASE_URL with the identity/role migration already
 * deployed and the system-role seed already run at least once (see
 * scripts/db-verify.sh). Not part of the default `npm test` unit suite —
 * run via `npm run test:integration` (apps/api workspace).
 *
 * Data isolation: this suite only reads the seeded system roles (never
 * mutates them) and creates/deletes its own uniquely-scoped test User row.
 * It never truncates or deletes unscoped/unknown data.
 */
const API_ROOT = path.resolve(__dirname, "..");
const prisma = new PrismaClient();

describe("Identity/Role database integration", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("Prisma connects to PostgreSQL", async () => {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    expect(result[0]?.ok).toBe(1);
  });

  it("has exactly the six approved system roles seeded, matching the shared runtime constant", async () => {
    const roles = await prisma.role.findMany({ orderBy: { code: "asc" } });
    expect(roles).toHaveLength(6);

    const codes = roles.map((role) => role.code).sort();
    expect(codes).toEqual([...DISPATCH_ROLE_CODES].sort());

    for (const role of roles) {
      expect(role.isSystemRole).toBe(true);
    }
  });

  it("does not contain a default User", async () => {
    const userCount = await prisma.user.count();
    expect(userCount).toBe(0);
  });

  it(
    "role seed is idempotent — running the real seed script twice does not duplicate rows",
    () => {
      execSync("npm run db:seed", { cwd: API_ROOT, stdio: "pipe" });
      execSync("npm run db:seed", { cwd: API_ROOT, stdio: "pipe" });
    },
    30_000,
  );

  it("role count stays at exactly six after re-seeding", async () => {
    const roleCount = await prisma.role.count();
    expect(roleCount).toBe(6);
  });

  it("enforces the unique role-code constraint", async () => {
    await expect(
      prisma.role.create({
        data: { code: DISPATCH_ROLE_CODES[0], displayName: "Duplicate role — must be rejected" },
      }),
    ).rejects.toThrow();
  });

  describe("repository adapters", () => {
    let prismaService: PrismaService;
    let userRepository: PrismaUserRepository;
    let roleRepository: PrismaRoleRepository;
    let testUserId: string;

    beforeAll(async () => {
      prismaService = new PrismaService();
      await prismaService.$connect();
      userRepository = new PrismaUserRepository(prismaService);
      roleRepository = new PrismaRoleRepository(prismaService);

      const testUser = await prismaService.user.create({
        data: { displayName: "DEV-FOUNDATION-002 integration test user (safe to delete)" },
      });
      testUserId = testUser.id;
    });

    afterAll(async () => {
      // Delete only the exact row this test created — never an unscoped
      // delete/truncate against shared development data.
      await prismaService.user.delete({ where: { id: testUserId } });
      await prismaService.$disconnect();
    });

    it("PrismaUserRepository reads back the technical User record it created", async () => {
      const found = await userRepository.findById(testUserId);
      expect(found?.id).toBe(testUserId);
      expect(found?.displayName).toBe("DEV-FOUNDATION-002 integration test user (safe to delete)");
      expect(found?.isActive).toBe(true);
    });

    it("PrismaUserRepository returns null for an unknown id", async () => {
      const found = await userRepository.findById("00000000-0000-0000-0000-000000000000");
      expect(found).toBeNull();
    });

    it("PrismaRoleRepository reads an existing seeded Role record", async () => {
      const found = await roleRepository.findByCode("ADMIN");
      expect(found?.code).toBe("ADMIN");
      expect(found?.isSystemRole).toBe(true);
    });

    it("PrismaRoleRepository.listAll returns all six seeded roles", async () => {
      const all = await roleRepository.listAll();
      expect(all).toHaveLength(6);
    });
  });
});
