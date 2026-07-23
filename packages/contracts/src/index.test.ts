import { describe, expect, it } from "vitest";
import {
  buildDeliveryTaskPath,
  buildDeliveryTaskSubmitPath,
  buildHealthUrl,
  buildPreparationConfirmReadyPath,
  buildPreparationEvidenceDownloadPath,
  buildPreparationPath,
  buildPreparationStartPath,
  PREPARATION_CORRECTIONS_PATH,
  CUSTOMER_MASTER_SEARCH_PATH,
  DELIVERY_TASKS_PATH,
  isHealthResponse,
  isReadinessResponse,
} from "./index";

describe("buildHealthUrl", () => {
  it("appends /health to a base URL without a trailing slash", () => {
    expect(buildHealthUrl("http://localhost:6002")).toBe("http://localhost:6002/health");
  });

  it("strips a trailing slash before appending /health", () => {
    expect(buildHealthUrl("http://localhost:6002/")).toBe("http://localhost:6002/health");
  });
});

describe("MVP-03 preparation paths", () => {
  it("builds command-oriented preparation paths", () => {
    expect(buildPreparationPath("task-1")).toBe("/tasks/task-1/preparation");
    expect(buildPreparationStartPath("task-1")).toBe("/tasks/task-1/preparation/start");
    expect(buildPreparationConfirmReadyPath("task-1")).toBe("/tasks/task-1/preparation/confirm-ready");
    expect(buildPreparationEvidenceDownloadPath("task-1", "ev-1")).toBe("/tasks/task-1/preparation/evidence/ev-1");
    expect(PREPARATION_CORRECTIONS_PATH).toBe("/preparation-corrections");
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

describe("MVP-02 task/customer-master paths", () => {
  it("exposes stable literal paths", () => {
    expect(CUSTOMER_MASTER_SEARCH_PATH).toBe("/customer-master/search");
    expect(DELIVERY_TASKS_PATH).toBe("/tasks");
  });

  it("builds a Task detail path from an id", () => {
    expect(buildDeliveryTaskPath("abc-123")).toBe("/tasks/abc-123");
  });

  it("builds a Task submit path from an id", () => {
    expect(buildDeliveryTaskSubmitPath("abc-123")).toBe("/tasks/abc-123/submit");
  });
});
