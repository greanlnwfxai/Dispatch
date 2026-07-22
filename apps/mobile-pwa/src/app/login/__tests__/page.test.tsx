import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("renders accessible loginId and password fields sized for a mobile viewport", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null, false)));
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    expect(await screen.findByLabelText("Login ID")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("shows a generic error on failed login", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, false))
      .mockResolvedValueOnce(jsonResponse({ message: "internal detail" }, false));
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

  it("redirects to / after a successful login", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, false))
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: "token",
          accessTokenExpiresAt: new Date().toISOString(),
          principal: { userId: "u-1", displayName: "Jane Doe", roleCodes: [] },
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
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-password-test-only" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });
});
