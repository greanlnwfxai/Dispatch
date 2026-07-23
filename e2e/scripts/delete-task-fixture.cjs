/**
 * MVP-02 Playwright fixture teardown — runs INSIDE the running `api`
 * container, mirroring create-task-fixture.cjs. Deletes only the exact
 * rows this fixture created (by the returned userId/customerId), never an
 * unscoped delete/truncate. Safe to call even if the test failed partway.
 */
const { PrismaClient } = require("@prisma/client");

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
    await prisma.taskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.deliveryTask.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.customerMasterSearch.deleteMany({ where: { searchedByUserId: userId } });
    await prisma.customerDestination.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.refreshTokenRecord.deleteMany({ where: { session: { userId } } });
    await prisma.authSession.deleteMany({ where: { userId } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
