import { BadRequestException, Injectable } from "@nestjs/common";
import type { CustomerMasterSearchResponseBody, CustomerMasterSearchResultDto } from "@dispatch/contracts";
import { PrismaCustomerMasterRepository } from "../infrastructure/database/repositories/prisma-customer-master.repository";
import { PrismaCustomerMasterSearchRepository } from "../infrastructure/database/repositories/prisma-customer-master-search.repository";

/** Bounded result set — never a dump of the whole Master table (§4.3, §7). */
const SEARCH_RESULT_LIMIT = 20;
/** Short-lived by design (§4.3) — long enough for one create/edit flow, not for reuse across sessions. */
const SEARCH_TTL_MS = 30 * 60 * 1000;

/**
 * SearchCustomerMaster use case (BDR-CUSTOMER-001/002, approved
 * 2026-07-20). Read-only — no Customer/Destination create/edit/delete
 * exists here or anywhere in MVP-02.
 */
@Injectable()
export class CustomerMasterService {
  constructor(
    private readonly customerMasterRepository: PrismaCustomerMasterRepository,
    private readonly customerMasterSearchRepository: PrismaCustomerMasterSearchRepository,
  ) {}

  async search(actorUserId: string, rawQuery: string): Promise<CustomerMasterSearchResponseBody> {
    const normalizedQuery = rawQuery.trim();
    if (normalizedQuery.length === 0) {
      throw new BadRequestException("A search query is required.");
    }

    const matches = await this.customerMasterRepository.search({
      normalizedQuery,
      limit: SEARCH_RESULT_LIMIT,
    });

    const expiresAt = new Date(Date.now() + SEARCH_TTL_MS);
    const searchRecord = await this.customerMasterSearchRepository.create({
      searchedByUserId: actorUserId,
      normalizedQuery,
      matchedCustomerDestinationIds: matches.map((match) => match.customerDestinationId),
      resultCount: matches.length,
      expiresAt,
    });

    const results: CustomerMasterSearchResultDto[] = matches.map((match) => ({
      customerId: match.customerId,
      customerCode: match.customerCode,
      customerName: match.customerName,
      customerDestinationId: match.customerDestinationId,
      destinationCode: match.destinationCode,
      destinationName: match.destinationName,
      address: match.address,
      contactName: match.contactName,
      contactPhone: match.contactPhone,
      deliveryInstructions: match.deliveryInstructions,
      locationReference: match.locationReference,
      accessNotes: match.accessNotes,
    }));

    return {
      searchId: searchRecord.id,
      results,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
