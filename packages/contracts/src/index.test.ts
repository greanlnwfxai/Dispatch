import { describe, expect, it } from "vitest";
import {
  buildAssignedTaskDetailPath,
  buildDeliveryTaskPath,
  buildDeliveryTaskSubmitPath,
  buildHealthUrl,
  buildPreparationConfirmReadyPath,
  buildPreparationEvidenceDownloadPath,
  buildPreparationPath,
  buildPreparationStartPath,
  buildTaskAssignmentHistoryPath,
  buildTaskAssignmentPath,
  PREPARATION_CORRECTIONS_PATH,
  ASSIGNED_TASKS_PATH,
  ASSIGNMENT_CANDIDATES_PATH,
  CUSTOMER_MASTER_SEARCH_PATH,
  DELIVERY_TASKS_PATH,
  isActiveAssignmentWorkloadStatus,
  isAssignmentType,
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

describe("MVP-04 assignment paths and re-exports", () => {
  it("exposes stable literal paths for candidate search and my-assigned-tasks", () => {
    expect(ASSIGNMENT_CANDIDATES_PATH).toBe("/assignment-candidates");
    expect(ASSIGNED_TASKS_PATH).toBe("/assigned-tasks");
  });

  it("builds task-assignment and assignment-history paths from a Task id", () => {
    expect(buildTaskAssignmentPath("task-1")).toBe("/tasks/task-1/assignment");
    expect(buildTaskAssignmentHistoryPath("task-1")).toBe("/tasks/task-1/assignment/history");
  });

  it("builds an assigned-task detail path from a Task id", () => {
    expect(buildAssignedTaskDetailPath("task-1")).toBe("/assigned-tasks/task-1");
  });

  it("re-exports the centralized assignment-type and active-workload-status guards", () => {
    expect(isAssignmentType("INITIAL")).toBe(true);
    expect(isAssignmentType("REASSIGNMENT")).toBe(true);
    expect(isAssignmentType("NOT_A_TYPE")).toBe(false);
    expect(isActiveAssignmentWorkloadStatus("ASSIGNED")).toBe(true);
    expect(isActiveAssignmentWorkloadStatus("DRAFT")).toBe(false);
  });
});
