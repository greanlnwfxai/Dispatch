import { describe, expect, it } from "vitest";
import { DISPATCH_SERVICE_NAMES, isDispatchServiceName } from "./index";

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
