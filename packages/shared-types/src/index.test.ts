import { describe, expect, it } from "vitest";
import { DISPATCH_ROLE_CODES, DISPATCH_SERVICE_NAMES, isDispatchRoleCode, isDispatchServiceName } from "./index";

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
