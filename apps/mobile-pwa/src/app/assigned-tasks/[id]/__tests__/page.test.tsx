import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AssignedTaskDetailPage from "../page";
import { AuthProvider } from "../../../auth-context";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useParams: () => ({ id: "task-1" }),
}));

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function stubAuthenticatedFetch(detailResponse: Response) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ accessToken: "access-token-value", accessTokenExpiresAt: new Date().toISOString() }))
    .mockResolvedValueOnce(jsonResponse({ userId: "u-1", displayName: "Somchai Driver", roleCodes: ["INTERNAL_DELIVERY_EMPLOYEE"] }))
    .mockResolvedValueOnce(detailResponse);
  vi.stubGlobal("fetch", fetchMock);
}

describe("AssignedTaskDetailPage (MVP-04 — read-only record scope)", () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a not-found message — never task data — when the server rejects the request (supporting-only, unrelated, or unauthorized access)", async () => {
    stubAuthenticatedFetch(jsonResponse({ message: "Assigned task not found." }, false, 404));

    render(
      <AuthProvider>
        <AssignedTaskDetailPage />
      </AuthProvider>,
    );

    expect(await screen.findByText(/assigned task not found/i)).toBeTruthy();
  });

  it("renders the primary assignee's own assigned-task detail with supporting employees labeled informational-only, and no execution action", async () => {
    stubAuthenticatedFetch(
      jsonResponse({
        id: "task-1",
        taskNumber: "DSP-00000002",
        status: "ASSIGNED",
        destinationName: "Warehouse C",
        plannedDeliveryDate: "2026-09-05",
        assignedAt: new Date().toISOString(),
        address: "999 Delivery Rd.",
        contactName: "Somsri Customer",
        contactPhone: "081-000-0000",
        deliveryInstructions: "Ring the bell twice.",
        locationReference: null,
        accessNotes: null,
        preparationReady: true,
        supportingEmployees: [{ userId: "support-1", displayName: "Support Driver" }],
      }),
    );

    render(
      <AuthProvider>
        <AssignedTaskDetailPage />
      </AuthProvider>,
    );

    expect(await screen.findByText("DSP-00000002")).toBeTruthy();
    expect(screen.getByText("Warehouse C")).toBeTruthy();
    expect(screen.getByText(/supporting employees \(informational only\)/i)).toBeTruthy();
    expect(screen.getByText("Support Driver")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /start delivery|check.?in|upload evidence|record recipient|sign|close|return/i })).toBeNull();
  });
});
