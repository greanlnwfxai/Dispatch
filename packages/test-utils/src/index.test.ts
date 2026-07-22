import { describe, expect, it } from "vitest";
import { expectOkHealthResponse } from "./index";

describe("expectOkHealthResponse", () => {
  it("does not throw for a matching health response", () => {
    expect(() =>
      expectOkHealthResponse({ status: "ok", service: "dispatch-api" }, "dispatch-api"),
    ).not.toThrow();
  });

  it("throws when the service name does not match", () => {
    expect(() =>
      expectOkHealthResponse({ status: "ok", service: "dispatch-api" }, "dispatch-admin-web"),
    ).toThrow();
  });

  it("throws for a malformed body", () => {
    expect(() => expectOkHealthResponse(null, "dispatch-api")).toThrow();
    expect(() => expectOkHealthResponse({ status: "error" }, "dispatch-api")).toThrow();
  });
});
