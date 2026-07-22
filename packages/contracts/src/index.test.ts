import { describe, expect, it } from "vitest";
import { buildHealthUrl, isHealthResponse } from "./index";

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
