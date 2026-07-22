import { PrismaClient } from "@prisma/client";
import { DISPATCH_ROLE_CODES, type DispatchRoleCode } from "@dispatch/shared-types";

/**
 * Idempotent system-role seed (DEV-FOUNDATION-002).
 *
 * Inserts or updates exactly the six approved Dispatch application roles.
 * Never creates a User, never touches credentials, never deletes unknown
 * data. Safe to run repeatedly in local development and CI.
 */

const ROLE_DISPLAY_NAMES: Record<DispatchRoleCode, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  DISPATCHER: "Dispatcher",
  STOCK: "Stock",
  INTERNAL_DELIVERY_EMPLOYEE: "Internal Delivery Employee",
  MANAGEMENT_AUDITOR: "Management / Auditor",
};

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const code of DISPATCH_ROLE_CODES) {
    const existing = await prisma.role.findUnique({ where: { code } });

    if (existing && !existing.isSystemRole) {
      throw new Error(
        `Seed conflict: role code "${code}" already exists but is not marked as a system role. ` +
          "Refusing to overwrite — resolve the conflicting record manually before re-running the seed.",
      );
    }

    await prisma.role.upsert({
      where: { code },
      update: { displayName: ROLE_DISPLAY_NAMES[code], isSystemRole: true },
      create: { code, displayName: ROLE_DISPLAY_NAMES[code], isSystemRole: true },
    });
  }

  const roleCount = await prisma.role.count();
  const seededRoles = await prisma.role.findMany({
    select: { code: true },
    orderBy: { code: "asc" },
  });

  console.log(`Dispatch system-role seed complete. ${roleCount} role(s) present:`);
  for (const role of seededRoles) {
    console.log(`  - ${role.code}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("Dispatch system-role seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
