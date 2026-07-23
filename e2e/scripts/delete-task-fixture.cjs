/**
 * MVP-02 Playwright fixture teardown — runs INSIDE the running `api`
 * container, mirroring create-task-fixture.cjs. Deletes only the exact
 * rows this fixture created (by the returned userId/customerId), never an
 * unscoped delete/truncate. Safe to call even if the test failed partway.
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs/promises");
const path = require("node:path");

async function main() {
  const userId = process.env.FIXTURE_USER_ID;
  const customerId = process.env.FIXTURE_CUSTOMER_ID;

  const prisma = new PrismaClient();
  try {
    const tasks = await prisma.deliveryTask.findMany({
      where: { createdByUserId: userId },
      select: { id: true },
    });
    const taskIds = tasks.map((t) => t.id);
    const preparations = await prisma.preparationRecord.findMany({
      where: { taskId: { in: taskIds } },
      select: { id: true },
    });
    const preparationIds = preparations.map((prep) => prep.id);
    const evidenceRows = await prisma.preparationEvidence.findMany({
      where: { preparationId: { in: preparationIds } },
      select: { objectKey: true },
    });
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
    await prisma.customerMasterSearch.deleteMany({ where: { searchedByUserId: userId } });
    await prisma.customerDestination.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.refreshTokenRecord.deleteMany({ where: { session: { userId } } });
    await prisma.authSession.deleteMany({ where: { userId } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    const evidenceRoot = process.env.EVIDENCE_STORAGE_ROOT || "/var/lib/dispatch/evidence";
    for (const row of evidenceRows) {
      if (!/^preparation\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(row.objectKey)) continue;
      const absolutePath = path.resolve(evidenceRoot, row.objectKey);
      if (!absolutePath.startsWith(path.resolve(evidenceRoot) + path.sep)) continue;
      await fs.unlink(absolutePath).catch((error) => {
        if (error && error.code !== "ENOENT") throw error;
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
