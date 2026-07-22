import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import LoginPage from "../page";
import { AuthProvider } from "../../auth-context";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("LoginPage", () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders accessible loginId and password fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null, false)));
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    expect(await screen.findByLabelText("Login ID")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("shows a generic error message on failed login, without revealing the reason", async () => {
    const fetchMock = vi
      .fn()
      // Initial bootstrap refresh — no session yet.
      .mockResolvedValueOnce(jsonResponse(null, false))
      // Login attempt fails.
      .mockResolvedValueOnce(jsonResponse({ message: "should not be shown verbatim" }, false));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    await screen.findByLabelText("Login ID");
    fireEvent.change(screen.getByLabelText("Login ID"), { target: { value: "someone" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password-test-only" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Invalid loginId or password.");
  });

  it("disables the submit button while the request is in flight", async () => {
    let resolveLogin: (value: Response) => void = () => undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, false))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveLogin = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    await screen.findByLabelText("Login ID");
    fireEvent.change(screen.getByLabelText("Login ID"), { target: { value: "someone" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "some-password-test-only" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole("button")).toHaveProperty("disabled", true));

    resolveLogin(
      jsonResponse({
        accessToken: "token",
        accessTokenExpiresAt: new Date().toISOString(),
        principal: { userId: "u-1", displayName: "Jane Doe", roleCodes: [] },
      }),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });
});
