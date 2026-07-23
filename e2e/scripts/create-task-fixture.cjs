/**
 * MVP-02 Playwright fixture setup — runs INSIDE the running `api` container
 * (`docker compose exec -T api node < this file`), never on the host,
 * because PostgreSQL has no host port mapping (CLAUDE.md §3/§11). Uses only
 * the api image's own `node_modules` (@prisma/client, @node-rs/argon2) —
 * no new dependency is added to any workspace for this.
 *
 * Creates exactly one test-scoped User + Customer Master
 * fixture. Never touches the real operator account or existing data.
 * Prints the created ids as JSON on the last stdout line.
 */
const { PrismaClient } = require("@prisma/client");
const { hash } = require("@node-rs/argon2");

async function main() {
  const marker = process.env.FIXTURE_MARKER;
  const loginId = process.env.FIXTURE_LOGIN_ID;
  const password = process.env.FIXTURE_PASSWORD;
  const roleCode = process.env.FIXTURE_ROLE_CODE || "DISPATCHER";

  const prisma = new PrismaClient();
  try {
    const passwordHash = await hash(password);
    const user = await prisma.user.create({
      data: {
        displayName: `${marker}-${roleCode.toLowerCase()} (playwright e2e, safe to delete)`,
        loginIdNormalized: loginId,
        passwordHash,
        credentialsEnabled: true,
        credentialsUpdatedAt: new Date(),
      },
    });

    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id } });

    const customer = await prisma.customer.create({
      data: { name: `${marker}-customer`, isActive: true },
    });
    const destination = await prisma.customerDestination.create({
      data: {
        customerId: customer.id,
        destinationName: `${marker}-destination`,
        address: "123 Playwright Test Rd.",
        isActive: true,
      },
    });

    process.stdout.write(
      JSON.stringify({ userId: user.id, customerId: customer.id, destinationId: destination.id }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
