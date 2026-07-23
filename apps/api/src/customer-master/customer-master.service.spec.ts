import { BadRequestException } from "@nestjs/common";
import { CustomerMasterService } from "./customer-master.service";
import type { PrismaCustomerMasterRepository } from "../infrastructure/database/repositories/prisma-customer-master.repository";
import type { PrismaCustomerMasterSearchRepository } from "../infrastructure/database/repositories/prisma-customer-master-search.repository";

const ACTOR_ID = "11111111-1111-1111-1111-111111111111";
const SEARCH_ID = "22222222-2222-2222-2222-222222222222";

const MATCH = {
  customerId: "33333333-3333-3333-3333-333333333333",
  customerCode: "CUST-1",
  customerName: "Acme Co.",
  customerDestinationId: "44444444-4444-4444-4444-444444444444",
  destinationCode: "DEST-1",
  destinationName: "Warehouse B",
  address: "123 Example Rd.",
  contactName: null,
  contactPhone: null,
  deliveryInstructions: null,
  locationReference: null,
  accessNotes: null,
};

describe("CustomerMasterService", () => {
  function buildService(matches = [MATCH]) {
    const customerMasterRepository = {
      search: jest.fn().mockResolvedValue(matches),
      findActiveDestinationById: jest.fn(),
    };
    const customerMasterSearchRepository = {
      create: jest.fn().mockResolvedValue({
        id: SEARCH_ID,
        searchedByUserId: ACTOR_ID,
        normalizedQuery: "acme",
        matchedCustomerDestinationIds: matches.map((m) => m.customerDestinationId),
        resultCount: matches.length,
        searchedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }),
      findById: jest.fn(),
    };
    const service = new CustomerMasterService(
      customerMasterRepository as unknown as PrismaCustomerMasterRepository,
      customerMasterSearchRepository as unknown as PrismaCustomerMasterSearchRepository,
    );
    return { service, customerMasterRepository, customerMasterSearchRepository };
  }

  it("rejects an empty/whitespace-only query without touching the repository", async () => {
    const { service, customerMasterRepository } = buildService();
    await expect(service.search(ACTOR_ID, "   ")).rejects.toThrow(BadRequestException);
    expect(customerMasterRepository.search).not.toHaveBeenCalled();
  });

  it("records search evidence and returns a searchId + bounded active-only results", async () => {
    const { service, customerMasterSearchRepository } = buildService();
    const result = await service.search(ACTOR_ID, "  acme  ");

    expect(result.searchId).toBe(SEARCH_ID);
    expect(result.results).toEqual([
      expect.objectContaining({ customerDestinationId: MATCH.customerDestinationId, destinationName: "Warehouse B" }),
    ]);
    expect(typeof result.expiresAt).toBe("string");

    expect(customerMasterSearchRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        searchedByUserId: ACTOR_ID,
        normalizedQuery: "acme",
        matchedCustomerDestinationIds: [MATCH.customerDestinationId],
        resultCount: 1,
      }),
    );
  });

  it("records zero-result searches (an empty Master table remains valid)", async () => {
    const { service, customerMasterSearchRepository } = buildService([]);
    const result = await service.search(ACTOR_ID, "nothing-matches");

    expect(result.results).toEqual([]);
    expect(customerMasterSearchRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ resultCount: 0, matchedCustomerDestinationIds: [] }),
    );
  });
});
