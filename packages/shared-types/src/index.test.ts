import { describe, expect, it } from "vitest";
import {
  DELIVERY_TASK_STATUS_CODES,
  DESTINATION_SOURCE_CODES,
  DISPATCH_ROLE_CODES,
  DISPATCH_SERVICE_NAMES,
  FREE_TEXT_FALLBACK_REASON_CODES,
  isDeliveryTaskStatus,
  isDestinationSource,
  isDispatchRoleCode,
  isDispatchServiceName,
  isFreeTextFallbackReason,
} from "./index";

describe("isDispatchServiceName", () => {
  it("accepts every declared service name", () => {
    for (const name of DISPATCH_SERVICE_NAMES) {
      expect(isDispatchServiceName(name)).toBe(true);
    }
  });

  it("rejects an unknown service name", () => {
    expect(isDispatchServiceName("not-a-dispatch-service")).toBe(false);
  });
});

describe("DISPATCH_ROLE_CODES", () => {
  it("contains exactly the six approved Phase 1 application roles", () => {
    expect([...DISPATCH_ROLE_CODES].sort()).toEqual(
      [
        "ADMIN",
        "DISPATCHER",
        "INTERNAL_DELIVERY_EMPLOYEE",
        "MANAGEMENT_AUDITOR",
        "STOCK",
        "SUPER_ADMIN",
      ].sort(),
    );
    expect(DISPATCH_ROLE_CODES).toHaveLength(6);
  });

  it("does not contain roles outside Phase 1 application accounts", () => {
    const forbidden = ["EXTERNAL_COURIER", "CUSTOMER", "SECURITY_REVIEWER", "DRIVER", "EMPLOYEE"];
    for (const code of forbidden) {
      expect((DISPATCH_ROLE_CODES as readonly string[])).not.toContain(code);
    }
  });
});

describe("isDispatchRoleCode", () => {
  it("accepts every declared role code", () => {
    for (const code of DISPATCH_ROLE_CODES) {
      expect(isDispatchRoleCode(code)).toBe(true);
    }
  });

  it("rejects an unknown role code", () => {
    expect(isDispatchRoleCode("NOT_A_ROLE")).toBe(false);
  });
});

describe("DELIVERY_TASK_STATUS_CODES", () => {
  it("contains exactly the 10 conceptual Main Task Status values (Topic 04 §5)", () => {
    expect(DELIVERY_TASK_STATUS_CODES).toHaveLength(10);
    expect([...DELIVERY_TASK_STATUS_CODES]).toEqual([
      "DRAFT",
      "WAITING_PREPARATION",
      "PREPARING",
      "READY_FOR_DISPATCH",
      "ASSIGNED",
      "IN_TRANSIT",
      "AT_DESTINATION",
      "WAITING_NEXT_ATTEMPT",
      "COMPLETED",
      "CANCELLED",
    ]);
  });

  it("isDeliveryTaskStatus accepts every declared status and rejects unknown values", () => {
    for (const status of DELIVERY_TASK_STATUS_CODES) {
      expect(isDeliveryTaskStatus(status)).toBe(true);
    }
    expect(isDeliveryTaskStatus("NOT_A_STATUS")).toBe(false);
  });
});

describe("DESTINATION_SOURCE_CODES", () => {
  it("contains exactly MASTER and FREE_TEXT", () => {
    expect([...DESTINATION_SOURCE_CODES].sort()).toEqual(["FREE_TEXT", "MASTER"]);
  });

  it("isDestinationSource accepts declared values and rejects unknown ones", () => {
    for (const code of DESTINATION_SOURCE_CODES) {
      expect(isDestinationSource(code)).toBe(true);
    }
    expect(isDestinationSource("SOMETHING_ELSE")).toBe(false);
  });
});

describe("FREE_TEXT_FALLBACK_REASON_CODES", () => {
  it("contains exactly NO_SUITABLE_MASTER and AD_HOC_DESTINATION", () => {
    expect([...FREE_TEXT_FALLBACK_REASON_CODES].sort()).toEqual(["AD_HOC_DESTINATION", "NO_SUITABLE_MASTER"]);
  });

  it("isFreeTextFallbackReason accepts declared values and rejects unknown ones", () => {
    for (const code of FREE_TEXT_FALLBACK_REASON_CODES) {
      expect(isFreeTextFallbackReason(code)).toBe(true);
    }
    expect(isFreeTextFallbackReason("BECAUSE")).toBe(false);
  });
});
