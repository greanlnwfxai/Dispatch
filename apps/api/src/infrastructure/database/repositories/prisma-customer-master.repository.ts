import { Injectable } from "@nestjs/common";
import type { Customer, CustomerDestination } from "@prisma/client";
import type { CustomerMasterRepository, CustomerMasterSearchMatch, SearchCustomerMasterInput } from "@dispatch/domain";
import { PrismaService } from "../prisma/prisma.service";

type CustomerDestinationWithCustomer = CustomerDestination & { customer: Customer };

/**
 * Read-only Customer/Destination Master search (BDR-CUSTOMER-001/002 —
 * approved 2026-07-20). No create/edit/delete method exists here or
 * anywhere in MVP-02 — see CLAUDE.md §15 "No Customer Master
 * administration".
 */
@Injectable()
export class PrismaCustomerMasterRepository implements CustomerMasterRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(input: SearchCustomerMasterInput): Promise<CustomerMasterSearchMatch[]> {
    const rows = await this.prisma.customerDestination.findMany({
      where: {
        isActive: true,
        customer: { isActive: true },
        OR: [
          { destinationName: { contains: input.normalizedQuery, mode: "insensitive" } },
          { code: { contains: input.normalizedQuery, mode: "insensitive" } },
          { customer: { name: { contains: input.normalizedQuery, mode: "insensitive" } } },
          { customer: { code: { contains: input.normalizedQuery, mode: "insensitive" } } },
        ],
      },
      include: { customer: true },
      orderBy: { destinationName: "asc" },
      take: input.limit,
    });

    return rows.map((row) => this.toMatch(row));
  }

  async findActiveDestinationById(customerDestinationId: string): Promise<CustomerMasterSearchMatch | null> {
    const row = await this.prisma.customerDestination.findFirst({
      where: { id: customerDestinationId, isActive: true, customer: { isActive: true } },
      include: { customer: true },
    });
    return row ? this.toMatch(row) : null;
  }

  private toMatch(row: CustomerDestinationWithCustomer): CustomerMasterSearchMatch {
    return {
      customerId: row.customer.id,
      customerCode: row.customer.code,
      customerName: row.customer.name,
      customerDestinationId: row.id,
      destinationCode: row.code,
      destinationName: row.destinationName,
      address: row.address,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      deliveryInstructions: row.deliveryInstructions,
      locationReference: row.locationReference,
      accessNotes: row.accessNotes,
    };
  }
}
