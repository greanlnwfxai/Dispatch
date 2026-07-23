import { Injectable } from "@nestjs/common";
import type {
  CreateCustomerMasterSearchInput,
  CustomerMasterSearchRecord,
  CustomerMasterSearchRepository,
} from "@dispatch/domain";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Server-verifiable Customer Master search evidence (§4.3). Never stores
 * secrets, tokens, or cookie values — only the normalized query text,
 * matched result ids, and actor/timing metadata.
 */
@Injectable()
export class PrismaCustomerMasterSearchRepository implements CustomerMasterSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCustomerMasterSearchInput): Promise<CustomerMasterSearchRecord> {
    return this.prisma.customerMasterSearch.create({
      data: {
        searchedByUserId: input.searchedByUserId,
        normalizedQuery: input.normalizedQuery,
        matchedCustomerDestinationIds: input.matchedCustomerDestinationIds,
        resultCount: input.resultCount,
        expiresAt: input.expiresAt,
      },
    });
  }

  async findById(id: string): Promise<CustomerMasterSearchRecord | null> {
    return this.prisma.customerMasterSearch.findUnique({ where: { id } });
  }
}
