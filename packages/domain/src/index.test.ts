import { describe, expect, it } from "vitest";
import {
  createBrandedId,
  findDuplicateTaskReferences,
  formatDeliveryTaskNumber,
  validateDeliveryTaskSubmission,
  validateDestinationSelection,
  validateGoodsLineInput,
  validateSubmitSearchEvidence,
  validateTaskReferenceInput,
} from "./index";
import type {
  DeliveryTaskSubmissionSnapshot,
  DestinationSelectionInput,
  RoleRecord,
  RoleRepository,
  SubmitSearchEvidenceSnapshot,
  UserCredentialRecord,
  UserRecord,
  UserRepository,
} from "./index";

describe("createBrandedId", () => {
  it("returns the underlying string value", () => {
    const id = createBrandedId("ExampleId", "abc-123");
    expect(id).toBe("abc-123");
  });

  it("rejects an empty value", () => {
    expect(() => createBrandedId("ExampleId", "  ")).toThrow();
  });
});

describe("Identity/Role repository boundary", () => {
  it("UserRepository/RoleRepository stay framework/ORM-independent shapes", async () => {
    const user: UserRecord = {
      id: "11111111-1111-1111-1111-111111111111",
      displayName: "Example User",
      isActive: true,
      credentialsEnabled: false,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const userCredential: UserCredentialRecord = {
      ...user,
      loginIdNormalized: "example-login",
      passwordHash: "argon2id-hash-placeholder",
      credentialsUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const role: RoleRecord = {
      id: "22222222-2222-2222-2222-222222222222",
      code: "ADMIN",
      displayName: "Admin",
      isSystemRole: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };

    const userRepository: UserRepository = {
      findById: async (id) => (id === user.id ? user : null),
      findByLoginId: async (loginIdNormalized) =>
        loginIdNormalized === userCredential.loginIdNormalized ? userCredential : null,
    };
    const roleRepository: RoleRepository = {
      findByCode: async (code) => (code === role.code ? role : null),
      listAll: async () => [role],
    };

    await expect(userRepository.findById(user.id)).resolves.toEqual(user);
    await expect(userRepository.findByLoginId("example-login")).resolves.toEqual(userCredential);
    await expect(roleRepository.findByCode(role.code)).resolves.toEqual(role);
    await expect(roleRepository.listAll()).resolves.toEqual([role]);
  });
});

const completeSnapshot: DeliveryTaskSubmissionSnapshot = {
  status: "DRAFT",
  plannedDeliveryDate: new Date("2026-08-01T00:00:00Z"),
  destinationSource: "MASTER",
  destinationName: "Warehouse B",
  address: "123 Example Rd.",
  customerSearchId: "33333333-3333-3333-3333-333333333333",
  freeTextFallbackReason: null,
  items: [{ plannedQuantity: "10.000", unit: "BOX", description: "Sample goods" }],
};

describe("validateDeliveryTaskSubmission (VR-TASK-001a)", () => {
  it("accepts a fully complete MASTER-sourced snapshot", () => {
    expect(validateDeliveryTaskSubmission(completeSnapshot)).toEqual([]);
  });

  it("hard-blocks a missing planned delivery date (BR-TASK-004)", () => {
    const errors = validateDeliveryTaskSubmission({ ...completeSnapshot, plannedDeliveryDate: null });
    expect(errors.map((e) => e.code)).toContain("PLANNED_DELIVERY_DATE_REQUIRED");
  });

  it("hard-blocks a missing destination name/address (BR-TASK-003)", () => {
    const errors = validateDeliveryTaskSubmission({ ...completeSnapshot, destinationName: "", address: "  " });
    expect(errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(["DESTINATION_NAME_REQUIRED", "DESTINATION_ADDRESS_REQUIRED"]),
    );
  });

  it("hard-blocks a missing Customer Master search (search-first, §4.3)", () => {
    const errors = validateDeliveryTaskSubmission({ ...completeSnapshot, customerSearchId: null });
    expect(errors.map((e) => e.code)).toContain("CUSTOMER_MASTER_SEARCH_REQUIRED");
  });

  it("hard-blocks FREE_TEXT with no fallback reason", () => {
    const errors = validateDeliveryTaskSubmission({
      ...completeSnapshot,
      destinationSource: "FREE_TEXT",
      freeTextFallbackReason: null,
    });
    expect(errors.map((e) => e.code)).toContain("FREE_TEXT_FALLBACK_REASON_REQUIRED");
  });

  it("hard-blocks an empty item list (BR-TASK-008)", () => {
    const errors = validateDeliveryTaskSubmission({ ...completeSnapshot, items: [] });
    expect(errors.map((e) => e.code)).toContain("AT_LEAST_ONE_ITEM_REQUIRED");
  });

  it("hard-blocks a non-positive planned quantity", () => {
    const errors = validateDeliveryTaskSubmission({
      ...completeSnapshot,
      items: [{ plannedQuantity: "0", unit: "BOX", description: "Sample goods" }],
    });
    expect(errors.map((e) => e.code)).toContain("ITEM_QUANTITY_MUST_BE_POSITIVE");
  });
});

describe("validateSubmitSearchEvidence (blocking review finding fix)", () => {
  const ACTOR_ID = "11111111-1111-1111-1111-111111111111";
  const OTHER_USER_ID = "99999999-9999-9999-9999-999999999999";
  const DESTINATION_ID = "44444444-4444-4444-4444-444444444444";
  const now = new Date("2026-08-01T12:00:00Z");

  function baseInput(overrides: Partial<SubmitSearchEvidenceSnapshot> = {}): SubmitSearchEvidenceSnapshot {
    return {
      now,
      actorUserId: ACTOR_ID,
      destinationSource: "FREE_TEXT",
      customerDestinationId: null,
      search: {
        searchedByUserId: ACTOR_ID,
        searchedAt: new Date(now.getTime() - 1000),
        expiresAt: new Date(now.getTime() + 1000),
        matchedCustomerDestinationIds: [],
      },
      activeMasterDestinationFound: false,
      ...overrides,
    };
  }

  it("accepts a FREE_TEXT submission with valid, owned, unexpired evidence", () => {
    expect(validateSubmitSearchEvidence(baseInput())).toEqual([]);
  });

  it("rejects missing search evidence", () => {
    const errors = validateSubmitSearchEvidence(baseInput({ search: null }));
    expect(errors.map((e) => e.code)).toEqual(["SEARCH_EVIDENCE_INVALID"]);
  });

  it("rejects search evidence belonging to a different user", () => {
    const errors = validateSubmitSearchEvidence(
      baseInput({ search: { ...baseInput().search!, searchedByUserId: OTHER_USER_ID } }),
    );
    expect(errors.map((e) => e.code)).toEqual(["SEARCH_EVIDENCE_INVALID"]);
  });

  it("rejects expired search evidence", () => {
    const errors = validateSubmitSearchEvidence(
      baseInput({ search: { ...baseInput().search!, expiresAt: new Date(now.getTime() - 1) } }),
    );
    expect(errors.map((e) => e.code)).toEqual(["SEARCH_EVIDENCE_INVALID"]);
  });

  it("rejects search evidence with searchedAt later than submission time", () => {
    const errors = validateSubmitSearchEvidence(
      baseInput({ search: { ...baseInput().search!, searchedAt: new Date(now.getTime() + 1) } }),
    );
    expect(errors.map((e) => e.code)).toEqual(["SEARCH_EVIDENCE_INVALID"]);
  });

  it("rejects a MASTER submission whose destination is not covered by the search's matched set", () => {
    const errors = validateSubmitSearchEvidence(
      baseInput({
        destinationSource: "MASTER",
        customerDestinationId: DESTINATION_ID,
        search: { ...baseInput().search!, matchedCustomerDestinationIds: [] },
        activeMasterDestinationFound: true,
      }),
    );
    expect(errors.map((e) => e.code)).toEqual(["SEARCH_EVIDENCE_INVALID"]);
  });

  it("rejects a MASTER submission whose destination is no longer an active Master record", () => {
    const errors = validateSubmitSearchEvidence(
      baseInput({
        destinationSource: "MASTER",
        customerDestinationId: DESTINATION_ID,
        search: { ...baseInput().search!, matchedCustomerDestinationIds: [DESTINATION_ID] },
        activeMasterDestinationFound: false,
      }),
    );
    expect(errors.map((e) => e.code)).toEqual(["SEARCH_EVIDENCE_INVALID"]);
  });

  it("accepts a MASTER submission whose destination is covered and still active", () => {
    const errors = validateSubmitSearchEvidence(
      baseInput({
        destinationSource: "MASTER",
        customerDestinationId: DESTINATION_ID,
        search: { ...baseInput().search!, matchedCustomerDestinationIds: [DESTINATION_ID] },
        activeMasterDestinationFound: true,
      }),
    );
    expect(errors).toEqual([]);
  });

  it("every failure returns the identical generic error, never disclosing the specific reason", () => {
    const missing = validateSubmitSearchEvidence(baseInput({ search: null }));
    const foreign = validateSubmitSearchEvidence(
      baseInput({ search: { ...baseInput().search!, searchedByUserId: OTHER_USER_ID } }),
    );
    const expired = validateSubmitSearchEvidence(
      baseInput({ search: { ...baseInput().search!, expiresAt: new Date(now.getTime() - 1) } }),
    );
    expect(missing).toEqual(foreign);
    expect(foreign).toEqual(expired);
  });
});

describe("validateDestinationSelection", () => {
  const masterSelection: DestinationSelectionInput = {
    destinationSource: "MASTER",
    customerId: "44444444-4444-4444-4444-444444444444",
    customerDestinationId: "55555555-5555-5555-5555-555555555555",
    customerSearchId: "33333333-3333-3333-3333-333333333333",
    freeTextFallbackReason: null,
    customerName: "Acme Co.",
    destinationName: "Warehouse B",
    address: "123 Example Rd.",
    contactName: null,
    contactPhone: null,
    deliveryInstructions: null,
    locationReference: null,
    accessNotes: null,
    customerCodeSnapshot: null,
    destinationCodeSnapshot: null,
  };

  it("accepts a valid MASTER selection", () => {
    expect(validateDestinationSelection(masterSelection)).toEqual([]);
  });

  it("rejects MASTER without a selected Customer/Destination", () => {
    const errors = validateDestinationSelection({ ...masterSelection, customerId: null, customerDestinationId: null });
    expect(errors.map((e) => e.code)).toContain("MASTER_SELECTION_REQUIRED");
  });

  it("rejects FREE_TEXT that references a Master record (never auto-link)", () => {
    const errors = validateDestinationSelection({
      ...masterSelection,
      destinationSource: "FREE_TEXT",
      freeTextFallbackReason: "AD_HOC_DESTINATION",
    });
    expect(errors.map((e) => e.code)).toContain("FREE_TEXT_MUST_NOT_REFERENCE_MASTER");
  });

  it("accepts a valid FREE_TEXT selection", () => {
    const errors = validateDestinationSelection({
      ...masterSelection,
      destinationSource: "FREE_TEXT",
      customerId: null,
      customerDestinationId: null,
      freeTextFallbackReason: "NO_SUITABLE_MASTER",
    });
    expect(errors).toEqual([]);
  });

  it("rejects an invalid destinationSource", () => {
    const errors = validateDestinationSelection({ ...masterSelection, destinationSource: "SOMETHING_ELSE" });
    expect(errors.map((e) => e.code)).toContain("DESTINATION_SOURCE_INVALID");
  });
});

describe("validateGoodsLineInput", () => {
  it("accepts a valid line", () => {
    expect(
      validateGoodsLineInput({ lineNumber: 1, description: "Boxes", plannedQuantity: "5", unit: "BOX", notes: null }),
    ).toEqual([]);
  });

  it("rejects zero/negative quantity", () => {
    const errors = validateGoodsLineInput({
      lineNumber: 1,
      description: "Boxes",
      plannedQuantity: "-1",
      unit: "BOX",
      notes: null,
    });
    expect(errors.map((e) => e.code)).toContain("ITEM_QUANTITY_MUST_BE_POSITIVE");
  });
});

describe("findDuplicateTaskReferences", () => {
  it("flags a duplicate type/value pair on the same Task", () => {
    const duplicates = findDuplicateTaskReferences([
      { referenceType: "PO_NUMBER", referenceValue: "PO-1" },
      { referenceType: "PO_NUMBER", referenceValue: "PO-1" },
      { referenceType: "PO_NUMBER", referenceValue: "PO-2" },
    ]);
    expect(duplicates).toEqual([{ referenceType: "PO_NUMBER", referenceValue: "PO-1" }]);
  });

  it("returns no duplicates for distinct references", () => {
    expect(
      findDuplicateTaskReferences([
        { referenceType: "PO_NUMBER", referenceValue: "PO-1" },
        { referenceType: "SO_NUMBER", referenceValue: "PO-1" },
      ]),
    ).toEqual([]);
  });
});

describe("validateTaskReferenceInput", () => {
  it("rejects an empty referenceType/referenceValue", () => {
    const errors = validateTaskReferenceInput({ referenceType: "  ", referenceValue: "" });
    expect(errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(["REFERENCE_TYPE_INVALID", "REFERENCE_VALUE_INVALID"]),
    );
  });
});

describe("formatDeliveryTaskNumber", () => {
  it("formats a sequence value with an 8-digit zero-padded, DSP-prefixed number", () => {
    expect(formatDeliveryTaskNumber(1)).toBe("DSP-00000001");
    expect(formatDeliveryTaskNumber(1234n)).toBe("DSP-00001234");
  });

  it("rejects a non-positive sequence value", () => {
    expect(() => formatDeliveryTaskNumber(0)).toThrow();
    expect(() => formatDeliveryTaskNumber(-5)).toThrow();
  });
});
