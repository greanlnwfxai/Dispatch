import { describe, expect, it } from "vitest";
import { buildHealthUrl, isHealthResponse, isReadinessResponse } from "./index";

describe("buildHealthUrl", () => {
  it("appends /health to a base URL without a trailing slash", () => {
    expect(buildHealthUrl("http://localhost:6002")).toBe("http://localhost:6002/health");
  });

  it("strips a trailing slash before appending /health", () => {
    expect(buildHealthUrl("http://localhost:6002/")).toBe("http://localhost:6002/health");
  });
});

describe("isHealthResponse", () => {
  it("accepts a well-formed health response", () => {
    expect(isHealthResponse({ status: "ok", service: "dispatch-api" })).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(isHealthResponse(null)).toBe(false);
    expect(isHealthResponse({ status: "error" })).toBe(false);
    expect(isHealthResponse({ status: "ok" })).toBe(false);
  });
});

describe("isReadinessResponse", () => {
  it("accepts a well-formed readiness response", () => {
    expect(isReadinessResponse({ status: "ok", service: "dispatch-api", database: "ok" })).toBe(true);
  });

  it("rejects a liveness-only payload missing the database field", () => {
    expect(isReadinessResponse({ status: "ok", service: "dispatch-api" })).toBe(false);
  });

  it("rejects malformed payloads", () => {
    expect(isReadinessResponse(null)).toBe(false);
    expect(isReadinessResponse({ status: "ok", service: "dispatch-api", database: "down" })).toBe(false);
  });
});
