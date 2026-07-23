import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaCustomerMasterRepository } from "../src/infrastructure/database/repositories/prisma-customer-master.repository";
import { PrismaService } from "../src/infrastructure/database/prisma/prisma.service";

/**
 * Customer Master search database integration coverage (MVP-02,
 * BDR-CUSTOMER-001/002). Requires a reachable PostgreSQL via DATABASE_URL
 * with the MVP-02 migration deployed. Read-only Customer Master — no
 * create/edit/delete endpoint exists; this suite creates its own uniquely
 * scoped fixture rows directly via Prisma and deletes exactly those rows
 * afterward, never touching unrelated data.
 */
const prisma = new PrismaClient();

describe("Customer Master search — database integration", () => {
  let prismaService: PrismaService;
  let repository: PrismaCustomerMasterRepository;

  const marker = `mvp02-test-${randomUUID()}`;
  const customerIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    prismaService = new PrismaService();
    await prismaService.$connect();
    repository = new PrismaCustomerMasterRepository(prismaService);

    const activeCustomer = await prisma.customer.create({
      data: { name: `${marker}-active-customer`, isActive: true },
    });
    customerIds.push(activeCustomer.id);
    await prisma.customerDestination.create({
      data: {
        customerId: activeCustomer.id,
        destinationName: `${marker}-active-destination`,
        address: "123 Active Rd.",
        isActive: true,
      },
    });

    const inactiveDestinationCustomer = await prisma.customer.create({
      data: { name: `${marker}-customer-with-inactive-destination`, isActive: true },
    });
    customerIds.push(inactiveDestinationCustomer.id);
    await prisma.customerDestination.create({
      data: {
        customerId: inactiveDestinationCustomer.id,
        destinationName: `${marker}-inactive-destination`,
        address: "456 Inactive Rd.",
        isActive: false,
      },
    });

    const inactiveCustomer = await prisma.customer.create({
      data: { name: `${marker}-inactive-customer`, isActive: false },
    });
    customerIds.push(inactiveCustomer.id);
    await prisma.customerDestination.create({
      data: {
        customerId: inactiveCustomer.id,
        destinationName: `${marker}-destination-of-inactive-customer`,
        address: "789 Some Rd.",
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.customerDestination.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await prismaService.$disconnect();
    await prisma.$disconnect();
  });

  it("returns only active Customer + active Destination matches", async () => {
    const results = await repository.search({ normalizedQuery: marker, limit: 20 });

    expect(results).toHaveLength(1);
    expect(results[0]?.destinationName).toBe(`${marker}-active-destination`);
  });

  it("excludes a Destination belonging to an inactive Customer", async () => {
    const results = await repository.search({ normalizedQuery: `${marker}-destination-of-inactive-customer`, limit: 20 });
    expect(results).toHaveLength(0);
  });

  it("excludes an inactive Destination even under an active Customer", async () => {
    const results = await repository.search({ normalizedQuery: `${marker}-inactive-destination`, limit: 20 });
    expect(results).toHaveLength(0);
  });

  it("findActiveDestinationById returns null for an inactive destination", async () => {
    const inactive = await prisma.customerDestination.findFirstOrThrow({
      where: { destinationName: `${marker}-inactive-destination` },
    });
    const found = await repository.findActiveDestinationById(inactive.id);
    expect(found).toBeNull();
  });

  it("findActiveDestinationById returns the match for an active destination", async () => {
    const active = await prisma.customerDestination.findFirstOrThrow({
      where: { destinationName: `${marker}-active-destination` },
    });
    const found = await repository.findActiveDestinationById(active.id);
    expect(found?.customerDestinationId).toBe(active.id);
  });
});
