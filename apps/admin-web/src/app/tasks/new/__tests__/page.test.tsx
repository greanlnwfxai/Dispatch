import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import NewTaskPage from "../page";
import { AuthProvider } from "../../../auth-context";

const replaceMock = vi.fn();
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}));

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return { ok, status, json: async () => body } as Response;
}

function bootstrapAsDispatcher() {
  return vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ accessToken: "token", accessTokenExpiresAt: new Date().toISOString() }))
    .mockResolvedValueOnce(jsonResponse({ userId: "u-1", displayName: "Dispatcher User", roleCodes: ["DISPATCHER"] }));
}

describe("NewTaskPage — search-first Task creation flow", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    pushMock.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("only offers the Free-text fallback after a search has been performed", async () => {
    const fetchMock = bootstrapAsDispatcher();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <NewTaskPage />
      </AuthProvider>,
    );

    await screen.findByText("สร้างงานจัดส่งใหม่");
    expect(screen.queryByText("ปลายทางเฉพาะกิจ")).toBeNull();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        searchId: "search-1",
        results: [
          {
            customerId: "c-1",
            customerCode: null,
            customerName: "Acme Co.",
            customerDestinationId: "d-1",
            destinationCode: null,
            destinationName: "Warehouse B",
            address: "123 Rd.",
            contactName: null,
            contactPhone: null,
            deliveryInstructions: null,
            locationReference: null,
            accessNotes: null,
          },
        ],
        expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
      }),
    );

    fireEvent.change(screen.getByPlaceholderText("ค้นหาลูกค้า/ปลายทาง"), { target: { value: "acme" } });
    fireEvent.click(screen.getByText("ค้นหา"));

    expect(await screen.findByText("Warehouse B")).toBeTruthy();
    expect(screen.getByText("ปลายทางเฉพาะกิจ")).toBeTruthy();
  });

  it("selects a MASTER result and shows a read-only confirmation, then saves a DRAFT", async () => {
    const fetchMock = bootstrapAsDispatcher();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <NewTaskPage />
      </AuthProvider>,
    );
    await screen.findByText("สร้างงานจัดส่งใหม่");

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        searchId: "search-1",
        results: [
          {
            customerId: "c-1",
            customerCode: null,
            customerName: "Acme Co.",
            customerDestinationId: "d-1",
            destinationCode: null,
            destinationName: "Warehouse B",
            address: "123 Rd.",
            contactName: null,
            contactPhone: null,
            deliveryInstructions: null,
            locationReference: null,
            accessNotes: null,
          },
        ],
        expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
      }),
    );
    fireEvent.change(screen.getByPlaceholderText("ค้นหาลูกค้า/ปลายทาง"), { target: { value: "acme" } });
    fireEvent.click(screen.getByText("ค้นหา"));
    await screen.findByText("Warehouse B");

    fireEvent.click(screen.getByText("เลือก"));
    expect(await screen.findByText("แหล่งที่มา: MASTER")).toBeTruthy();
    // Never offers "save as Customer Master" (§9).
    expect(screen.queryByText(/save as customer master/i)).toBeNull();
    expect(screen.queryByText(/บันทึกเป็น customer master/i)).toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "task-1", status: "DRAFT" }, true, 201));
    fireEvent.click(screen.getByText("บันทึกเป็นแบบร่าง (Save as Draft)"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/tasks/task-1"));

    const createCall = fetchMock.mock.calls.find((call: unknown[]) => String(call[0]).endsWith("/tasks"));
    const createBody = JSON.parse(createCall?.[1]?.body as string);
    expect(createBody).toMatchObject({
      searchId: "search-1",
      destinationSource: "MASTER",
      customerId: "c-1",
      customerDestinationId: "d-1",
    });
  });

  it("switches to the Free-text form after choosing a fallback reason, requiring the reason to be recorded", async () => {
    const fetchMock = bootstrapAsDispatcher();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <NewTaskPage />
      </AuthProvider>,
    );
    await screen.findByText("สร้างงานจัดส่งใหม่");

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ searchId: "search-2", results: [], expiresAt: new Date(Date.now() + 1_800_000).toISOString() }),
    );
    fireEvent.change(screen.getByPlaceholderText("ค้นหาลูกค้า/ปลายทาง"), { target: { value: "nothing" } });
    fireEvent.click(screen.getByText("ค้นหา"));
    await screen.findByText("ไม่พบข้อมูลที่ตรงกัน");

    fireEvent.click(screen.getByText("ปลายทางเฉพาะกิจ"));
    expect(await screen.findByText(/แหล่งที่มา: FREE_TEXT/)).toBeTruthy();

    fireEvent.change(screen.getByText("ชื่อลูกค้า").querySelector("input")!, {
      target: { value: "Ad hoc Customer" },
    });
    fireEvent.change(screen.getByText("ชื่อปลายทาง").querySelector("input")!, {
      target: { value: "Ad hoc Destination" },
    });
    fireEvent.change(screen.getByText("ที่อยู่").querySelector("textarea")!, {
      target: { value: "Ad hoc Address" },
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "task-2", status: "DRAFT" }, true, 201));
    fireEvent.click(screen.getByText("บันทึกเป็นแบบร่าง (Save as Draft)"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/tasks/task-2"));

    const createCall = fetchMock.mock.calls.find((call: unknown[]) => String(call[0]).endsWith("/tasks"));
    const createBody = JSON.parse(createCall?.[1]?.body as string);
    expect(createBody).toMatchObject({
      searchId: "search-2",
      destinationSource: "FREE_TEXT",
      customerId: null,
      customerDestinationId: null,
      freeTextFallbackReason: "AD_HOC_DESTINATION",
      customerName: "Ad hoc Customer",
      destinationName: "Ad hoc Destination",
      address: "Ad hoc Address",
    });
  });

  it("never writes tokens or draft data to localStorage/sessionStorage", async () => {
    const fetchMock = bootstrapAsDispatcher();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AuthProvider>
        <NewTaskPage />
      </AuthProvider>,
    );
    await screen.findByText("สร้างงานจัดส่งใหม่");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
