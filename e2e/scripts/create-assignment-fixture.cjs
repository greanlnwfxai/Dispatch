/**
 * MVP-04 Playwright fixture setup — runs INSIDE the running `api`
 * container (`docker compose exec -T api node < this file`), never on the
 * host, because PostgreSQL has no host port mapping (CLAUDE.md §3/§11).
 * Uses only the api image's own `node_modules` (@prisma/client,
 * @node-rs/argon2) — no new dependency is added to any workspace for this.
 *
 * Creates a test-scoped actor User (assigning role), two
 * INTERNAL_DELIVERY_EMPLOYEE candidate Users, a Customer Master +
 * Destination, and one Delivery Task already at READY_FOR_DISPATCH (the
 * assignment flow does not exercise Task creation/preparation, so this
 * skips straight to the state MVP-04 acts on). Never touches the real
 * operator account or existing data. Prints the created ids as JSON on the
 * last stdout line.
 */
const { PrismaClient } = require("@prisma/client");
const { hash } = require("@node-rs/argon2");
const { randomUUID } = require("node:crypto");

async function main() {
  const marker = process.env.FIXTURE_MARKER;
  const actorLoginId = process.env.FIXTURE_ACTOR_LOGIN_ID;
  const password = process.env.FIXTURE_PASSWORD;
  const actorRoleCode = process.env.FIXTURE_ACTOR_ROLE_CODE || "DISPATCHER";

  const prisma = new PrismaClient();
  try {
    const passwordHash = await hash(password);
    const actor = await prisma.user.create({
      data: {
        displayName: `${marker}-${actorRoleCode.toLowerCase()} (playwright e2e, safe to delete)`,
        loginIdNormalized: actorLoginId,
        passwordHash,
        credentialsEnabled: true,
        credentialsUpdatedAt: new Date(),
      },
    });
    const actorRole = await prisma.role.findUniqueOrThrow({ where: { code: actorRoleCode } });
    await prisma.userRoleAssignment.create({ data: { userId: actor.id, roleId: actorRole.id } });

    const employeeRole = await prisma.role.findUniqueOrThrow({ where: { code: "INTERNAL_DELIVERY_EMPLOYEE" } });
    const candidateA = await prisma.user.create({
      data: { displayName: `${marker}-driver-a (playwright e2e, safe to delete)` },
    });
    await prisma.userRoleAssignment.create({ data: { userId: candidateA.id, roleId: employeeRole.id } });
    const candidateB = await prisma.user.create({
      data: { displayName: `${marker}-driver-b (playwright e2e, safe to delete)` },
    });
    await prisma.userRoleAssignment.create({ data: { userId: candidateB.id, roleId: employeeRole.id } });

    const customer = await prisma.customer.create({ data: { name: `${marker}-customer`, isActive: true } });
    const destination = await prisma.customerDestination.create({
      data: {
        customerId: customer.id,
        destinationName: `${marker}-destination`,
        address: "123 Playwright Assignment Test Rd.",
        isActive: true,
      },
    });

    const search = await prisma.customerMasterSearch.create({
      data: {
        searchedByUserId: actor.id,
        normalizedQuery: marker,
        matchedCustomerDestinationIds: [destination.id],
        resultCount: 1,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const task = await prisma.deliveryTask.create({
      data: {
        taskNumber: `MVP04PW-${randomUUID().slice(0, 8)}`,
        status: "READY_FOR_DISPATCH",
        plannedDeliveryDate: new Date("2026-09-15T00:00:00Z"),
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
        submittedAt: new Date(),
        destinationSource: "MASTER",
        customerId: customer.id,
        customerDestinationId: destination.id,
        customerSearchId: search.id,
        customerName: customer.name,
        destinationName: destination.destinationName,
        address: destination.address,
        snapshotCreatedAt: new Date(),
        events: {
          create: { eventType: "PREPARATION_READY_CONFIRMED", previousStatus: "PREPARING", newStatus: "READY_FOR_DISPATCH", actorUserId: actor.id },
        },
      },
    });

    process.stdout.write(
      JSON.stringify({
        actorUserId: actor.id,
        candidateAUserId: candidateA.id,
        candidateBUserId: candidateB.id,
        customerId: customer.id,
        searchId: search.id,
        taskId: task.id,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
