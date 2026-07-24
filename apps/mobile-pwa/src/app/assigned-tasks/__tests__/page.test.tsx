import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AssignedTasksPage from "../page";
import { AuthProvider } from "../../auth-context";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 403, json: async () => body } as Response;
}

function stubAuthenticatedFetch(roleCodes: string[], listResponse: Response) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ accessToken: "access-token-value", accessTokenExpiresAt: new Date().toISOString() }))
    .mockResolvedValueOnce(jsonResponse({ userId: "u-1", displayName: "Somchai Driver", roleCodes }))
    .mockResolvedValueOnce(listResponse);
  vi.stubGlobal("fetch", fetchMock);
}

describe("AssignedTasksPage (MVP-04 — my assigned tasks)", () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a role-restriction message for a non-INTERNAL_DELIVERY_EMPLOYEE principal, with no task fetch attempted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ accessToken: "access-token-value", accessTokenExpiresAt: new Date().toISOString() }))
      .mockResolvedValueOnce(jsonResponse({ userId: "u-2", displayName: "Ann Dispatcher", roleCodes: ["DISPATCHER"] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <AssignedTasksPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/only available to internal delivery employees/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows an empty-state message when the employee has no assigned tasks", async () => {
    stubAuthenticatedFetch(["INTERNAL_DELIVERY_EMPLOYEE"], jsonResponse({ items: [], page: 1, pageSize: 50, total: 0 }));

    render(
      <AuthProvider>
        <AssignedTasksPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/you have no assigned tasks/i)).toBeTruthy();
  });

  it("renders the employee's own assigned tasks as links to the detail page", async () => {
    stubAuthenticatedFetch(
      ["INTERNAL_DELIVERY_EMPLOYEE"],
      jsonResponse({
        items: [
          {
            id: "task-1",
            taskNumber: "DSP-00000001",
            status: "ASSIGNED",
            destinationName: "Warehouse B",
            plannedDeliveryDate: "2026-09-01",
            assignedAt: new Date().toISOString(),
          },
        ],
        page: 1,
        pageSize: 50,
        total: 1,
      }),
    );

    render(
      <AuthProvider>
        <AssignedTasksPage />
      </AuthProvider>,
    );

    const link = await screen.findByRole("link", { name: /DSP-00000001/ });
    expect(link.getAttribute("href")).toBe("/assigned-tasks/task-1");
    expect(screen.getByText("Warehouse B")).toBeTruthy();
    await waitFor(() => expect(replaceMock).not.toHaveBeenCalled());
  });
});
