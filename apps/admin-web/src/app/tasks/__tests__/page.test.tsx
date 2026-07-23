import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TasksListPage from "../page";
import { AuthProvider } from "../../auth-context";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return { ok, status, json: async () => body } as Response;
}

function bootstrapAs(roleCodes: string[]) {
  return vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ accessToken: "token", accessTokenExpiresAt: new Date().toISOString() }))
    .mockResolvedValueOnce(jsonResponse({ userId: "u-1", displayName: "Test User", roleCodes }));
}

describe("TasksListPage", () => {
  beforeEach(() => replaceMock.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("redirects to /login when unauthenticated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null, false)));
    render(
      <AuthProvider>
        <TasksListPage />
      </AuthProvider>,
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
  });

  it("shows the create-task action for a DISPATCHER and lists returned tasks", async () => {
    const fetchMock = bootstrapAs(["DISPATCHER"]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: "t-1",
            taskNumber: "DSP-00000001",
            status: "DRAFT",
            plannedDeliveryDate: null,
            destinationSource: "MASTER",
            destinationName: "Warehouse B",
            customerName: "Acme Co.",
            createdByUserId: "u-1",
            createdAt: new Date().toISOString(),
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <TasksListPage />
      </AuthProvider>,
    );

    expect(await screen.findByText("DSP-00000001")).toBeTruthy();
    expect(screen.getByText("+ สร้างงานใหม่")).toBeTruthy();
  });

  it("hides the create-task action for a STOCK-only (read-only) user", async () => {
    const fetchMock = bootstrapAs(["STOCK"]);
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <TasksListPage />
      </AuthProvider>,
    );

    await screen.findByText("ยังไม่มีงาน");
    expect(screen.queryByText("+ สร้างงานใหม่")).toBeNull();
  });

  it("never writes to localStorage/sessionStorage while loading the Task list", async () => {
    const fetchMock = bootstrapAs(["DISPATCHER"]);
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <TasksListPage />
      </AuthProvider>,
    );

    await screen.findByText("ยังไม่มีงาน");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
