/**
 * MVP-04 Playwright fixture teardown — runs INSIDE the running `api`
 * container, mirroring create-assignment-fixture.cjs. Deletes only the
 * exact rows this fixture (and the test it supports) created, never an
 * unscoped delete/truncate. Safe to call even if the test failed partway.
 * `task_assignments` has a self-referential RESTRICT FK
 * (`previousAssignmentId`), so rows are deleted individually, newest
 * first, rather than in one bulk statement.
 */
const { PrismaClient } = require("@prisma/client");

async function main() {
  const taskId = process.env.FIXTURE_TASK_ID;
  const actorUserId = process.env.FIXTURE_ACTOR_USER_ID;
  const candidateAUserId = process.env.FIXTURE_CANDIDATE_A_USER_ID;
  const candidateBUserId = process.env.FIXTURE_CANDIDATE_B_USER_ID;
  const customerId = process.env.FIXTURE_CUSTOMER_ID;

  const prisma = new PrismaClient();
  try {
    await prisma.taskAssignmentSupport.deleteMany({ where: { assignment: { taskId } } });
    await prisma.taskCurrentAssignment.deleteMany({ where: { taskId } });
    const assignments = await prisma.taskAssignment.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    for (const assignment of assignments) {
      await prisma.taskAssignment.delete({ where: { id: assignment.id } });
    }
    await prisma.taskEvent.deleteMany({ where: { taskId } });
    await prisma.deliveryTask.deleteMany({ where: { id: taskId } });
    await prisma.customerMasterSearch.deleteMany({ where: { searchedByUserId: actorUserId } });
    await prisma.customerDestination.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });

    for (const userId of [actorUserId, candidateAUserId, candidateBUserId]) {
      if (!userId) continue;
      await prisma.refreshTokenRecord.deleteMany({ where: { session: { userId } } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.userRoleAssignment.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
