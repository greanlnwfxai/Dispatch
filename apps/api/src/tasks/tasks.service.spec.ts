import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { TasksService } from "./tasks.service";
import type { CreateDeliveryTaskDto } from "./dto/create-delivery-task.dto";
import type { PrismaCustomerMasterRepository } from "../infrastructure/database/repositories/prisma-customer-master.repository";
import type { PrismaCustomerMasterSearchRepository } from "../infrastructure/database/repositories/prisma-customer-master-search.repository";
import type { PrismaDeliveryTaskRepository } from "../infrastructure/database/repositories/prisma-delivery-task.repository";
import type { PrismaTaskNumberGenerator } from "../infrastructure/database/repositories/prisma-task-number.generator";

const ACTOR_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "99999999-9999-9999-9999-999999999999";
const SEARCH_ID = "22222222-2222-2222-2222-222222222222";
const CUSTOMER_ID = "33333333-3333-3333-3333-333333333333";
const DESTINATION_ID = "44444444-4444-4444-4444-444444444444";
const TASK_ID = "55555555-5555-5555-5555-555555555555";

const CANONICAL_DESTINATION = {
  customerId: CUSTOMER_ID,
  customerCode: "CUST-1",
  customerName: "Canonical Customer Name",
  customerDestinationId: DESTINATION_ID,
  destinationCode: "DEST-1",
  destinationName: "Canonical Destination Name",
  address: "Canonical Address",
  contactName: "Canonical Contact",
  contactPhone: "000-000-0000",
  deliveryInstructions: null,
  locationReference: null,
  accessNotes: null,
};

function validSearch(overrides: Partial<{ searchedByUserId: string; expiresAt: Date; matchedCustomerDestinationIds: string[] }> = {}) {
  return {
    id: SEARCH_ID,
    searchedByUserId: ACTOR_ID,
    normalizedQuery: "canonical",
    matchedCustomerDestinationIds: [DESTINATION_ID],
    resultCount: 1,
    searchedAt: new Date(Date.now() - 1000),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    ...overrides,
  };
}

describe("TasksService", () => {
  function buildService() {
    const deliveryTaskRepository = {
      createDraft: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      updateDraft: jest.fn(),
      submit: jest.fn(),
    };
    const customerMasterRepository = {
      search: jest.fn(),
      findActiveDestinationById: jest.fn().mockResolvedValue(CANONICAL_DESTINATION),
    };
    const customerMasterSearchRepository = {
      create: jest.fn(),
      findById: jest.fn().mockResolvedValue(validSearch()),
    };
    const taskNumberGenerator = {
      next: jest.fn().mockResolvedValue("DSP-00000001"),
    };

    const service = new TasksService(
      deliveryTaskRepository as unknown as PrismaDeliveryTaskRepository,
      customerMasterRepository as unknown as PrismaCustomerMasterRepository,
      customerMasterSearchRepository as unknown as PrismaCustomerMasterSearchRepository,
      taskNumberGenerator as unknown as PrismaTaskNumberGenerator,
    );

    return { service, deliveryTaskRepository, customerMasterRepository, customerMasterSearchRepository, taskNumberGenerator };
  }

  function baseCreateDto(overrides: Partial<CreateDeliveryTaskDto> = {}): CreateDeliveryTaskDto {
    return {
      searchId: SEARCH_ID,
      destinationSource: "MASTER",
      customerDestinationId: DESTINATION_ID,
      items: [{ lineNumber: 1, description: "Boxes", plannedQuantity: "10", unit: "BOX" }],
      references: [],
      ...overrides,
    } as CreateDeliveryTaskDto;
  }

  describe("create — MASTER source", () => {
    it("ignores client-supplied snapshot values and loads canonical Master data server-side", async () => {
      const { service, deliveryTaskRepository } = buildService();
      deliveryTaskRepository.createDraft.mockImplementation(async (input) => ({
        id: TASK_ID,
        taskNumber: "DSP-00000001",
        status: "DRAFT",
        createdAt: new Date(),
        updatedAt: new Date(),
        submittedAt: null,
        snapshotCreatedAt: new Date(),
        items: [],
        references: [],
        events: [],
        ...input,
      }));

      const dto = baseCreateDto({
        // Attempted client tampering — must be discarded in favor of canonical values.
        customerName: "TAMPERED NAME",
        destinationName: "TAMPERED DESTINATION",
        address: "TAMPERED ADDRESS",
      });

      await service.create(ACTOR_ID, dto);

      const createArgs = deliveryTaskRepository.createDraft.mock.calls[0][0];
      expect(createArgs.customerName).toBe(CANONICAL_DESTINATION.customerName);
      expect(createArgs.destinationName).toBe(CANONICAL_DESTINATION.destinationName);
      expect(createArgs.address).toBe(CANONICAL_DESTINATION.address);
      expect(createArgs.customerId).toBe(CUSTOMER_ID);
      expect(createArgs.customerDestinationId).toBe(DESTINATION_ID);
      expect(createArgs.freeTextFallbackReason).toBeNull();
    });

    it("rejects a MASTER selection whose destination was not part of the performed search", async () => {
      const { service, customerMasterSearchRepository } = buildService();
      customerMasterSearchRepository.findById.mockResolvedValue(
        validSearch({ matchedCustomerDestinationIds: ["66666666-6666-6666-6666-666666666666"] }),
      );

      await expect(service.create(ACTOR_ID, baseCreateDto())).rejects.toThrow(BadRequestException);
    });
  });

  describe("create — search-first evidence", () => {
    it("rejects when no search record exists for the given searchId", async () => {
      const { service, customerMasterSearchRepository } = buildService();
      customerMasterSearchRepository.findById.mockResolvedValue(null);

      await expect(service.create(ACTOR_ID, baseCreateDto())).rejects.toThrow(BadRequestException);
    });

    it("rejects a searchId that belongs to a different user (foreign searchId)", async () => {
      const { service, customerMasterSearchRepository } = buildService();
      customerMasterSearchRepository.findById.mockResolvedValue(validSearch({ searchedByUserId: OTHER_USER_ID }));

      await expect(service.create(ACTOR_ID, baseCreateDto())).rejects.toThrow(BadRequestException);
    });

    it("rejects an expired search reference", async () => {
      const { service, customerMasterSearchRepository } = buildService();
      customerMasterSearchRepository.findById.mockResolvedValue(
        validSearch({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.create(ACTOR_ID, baseCreateDto())).rejects.toThrow(BadRequestException);
    });
  });

  describe("create — FREE_TEXT source", () => {
    function freeTextDto(overrides: Partial<CreateDeliveryTaskDto> = {}): CreateDeliveryTaskDto {
      return baseCreateDto({
        destinationSource: "FREE_TEXT",
        customerDestinationId: undefined,
        customerId: undefined,
        customerName: "Ad hoc Customer",
        destinationName: "Ad hoc Destination",
        address: "Ad hoc Address",
        freeTextFallbackReason: "AD_HOC_DESTINATION",
        ...overrides,
      });
    }

    it("requires a valid fallback reason", async () => {
      const { service } = buildService();
      await expect(
        service.create(ACTOR_ID, freeTextDto({ freeTextFallbackReason: undefined })),
      ).rejects.toThrow(BadRequestException);
    });

    it("never creates or links a Customer Master record", async () => {
      const { service, deliveryTaskRepository, customerMasterRepository } = buildService();
      deliveryTaskRepository.createDraft.mockImplementation(async (input) => ({
        id: TASK_ID,
        taskNumber: "DSP-00000001",
        status: "DRAFT",
        createdAt: new Date(),
        updatedAt: new Date(),
        submittedAt: null,
        snapshotCreatedAt: new Date(),
        items: [],
        references: [],
        events: [],
        ...input,
      }));

      await service.create(ACTOR_ID, freeTextDto());

      const createArgs = deliveryTaskRepository.createDraft.mock.calls[0][0];
      expect(createArgs.customerId).toBeNull();
      expect(createArgs.customerDestinationId).toBeNull();
      expect(createArgs.destinationName).toBe("Ad hoc Destination");
      expect(customerMasterRepository.findActiveDestinationById).not.toHaveBeenCalled();
    });
  });

  describe("create — goods lines and references", () => {
    it("rejects a non-positive planned quantity", async () => {
      const { service } = buildService();
      await expect(
        service.create(
          ACTOR_ID,
          baseCreateDto({ items: [{ lineNumber: 1, description: "Boxes", plannedQuantity: "0", unit: "BOX" }] as never }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects duplicate line numbers", async () => {
      const { service } = buildService();
      await expect(
        service.create(
          ACTOR_ID,
          baseCreateDto({
            items: [
              { lineNumber: 1, description: "Boxes", plannedQuantity: "1", unit: "BOX" },
              { lineNumber: 1, description: "Crates", plannedQuantity: "2", unit: "BOX" },
            ] as never,
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a duplicate business reference type/value pair", async () => {
      const { service } = buildService();
      await expect(
        service.create(
          ACTOR_ID,
          baseCreateDto({
            references: [
              { referenceType: "PO_NUMBER", referenceValue: "PO-1" },
              { referenceType: "PO_NUMBER", referenceValue: "PO-1" },
            ] as never,
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("update", () => {
    it("throws NotFoundException for a missing Task", async () => {
      const { service, deliveryTaskRepository } = buildService();
      deliveryTaskRepository.findById.mockResolvedValue(null);
      await expect(service.update(ACTOR_ID, TASK_ID, {})).rejects.toThrow(NotFoundException);
    });

    it("rejects editing a Task that is no longer DRAFT (DRAFT-only)", async () => {
      const { service, deliveryTaskRepository } = buildService();
      deliveryTaskRepository.findById.mockResolvedValue({ id: TASK_ID, status: "WAITING_PREPARATION" });
      await expect(service.update(ACTOR_ID, TASK_ID, { plannedDeliveryDate: "2026-08-01" })).rejects.toThrow(
        ConflictException,
      );
    });

    it("requires destinationSource and searchId together when any destination field changes", async () => {
      const { service, deliveryTaskRepository } = buildService();
      deliveryTaskRepository.findById.mockResolvedValue({ id: TASK_ID, status: "DRAFT" });
      await expect(service.update(ACTOR_ID, TASK_ID, { destinationName: "New Name" })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("submit", () => {
    it("maps NOT_FOUND to NotFoundException", async () => {
      const { service, deliveryTaskRepository } = buildService();
      deliveryTaskRepository.submit.mockResolvedValue({ ok: false, failureReason: "NOT_FOUND" });
      await expect(service.submit(ACTOR_ID, TASK_ID)).rejects.toThrow(NotFoundException);
    });

    it("maps NOT_DRAFT to ConflictException", async () => {
      const { service, deliveryTaskRepository } = buildService();
      deliveryTaskRepository.submit.mockResolvedValue({ ok: false, failureReason: "NOT_DRAFT" });
      await expect(service.submit(ACTOR_ID, TASK_ID)).rejects.toThrow(ConflictException);
    });

    it("maps INCOMPLETE to BadRequestException carrying validation errors, with no stack/SQL detail", async () => {
      const { service, deliveryTaskRepository } = buildService();
      deliveryTaskRepository.submit.mockResolvedValue({
        ok: false,
        failureReason: "INCOMPLETE",
        validationErrors: [{ code: "AT_LEAST_ONE_ITEM_REQUIRED", message: "At least one planned goods line is required." }],
      });
      await expect(service.submit(ACTOR_ID, TASK_ID)).rejects.toThrow(BadRequestException);
    });

    it("maps SEARCH_EVIDENCE_INVALID to UnprocessableEntityException, with no stack/SQL/identifier detail", async () => {
      const { service, deliveryTaskRepository } = buildService();
      deliveryTaskRepository.submit.mockResolvedValue({
        ok: false,
        failureReason: "SEARCH_EVIDENCE_INVALID",
        validationErrors: [{ code: "SEARCH_EVIDENCE_INVALID", message: "Customer Master search evidence is missing, expired, or invalid." }],
      });
      await expect(service.submit(ACTOR_ID, TASK_ID)).rejects.toThrow(UnprocessableEntityException);
      try {
        await service.submit(ACTOR_ID, TASK_ID);
      } catch (error) {
        expect(JSON.stringify((error as UnprocessableEntityException).getResponse())).not.toMatch(
          /stack|prisma|postgres|sql/i,
        );
      }
    });
  });
});
