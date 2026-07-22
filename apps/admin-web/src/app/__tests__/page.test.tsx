import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HomePage from "../page";
import { AuthProvider } from "../auth-context";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe("HomePage (protected placeholder)", () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects to /login when the session bootstrap finds no valid session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(null, false)),
    );

    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
  });

  it("displays the safe authenticated principal (displayName + role codes) after a successful bootstrap", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-token-value", accessTokenExpiresAt: new Date().toISOString() }),
      )
      .mockResolvedValueOnce(jsonResponse({ userId: "u-1", displayName: "Jane Doe", roleCodes: ["ADMIN"] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );

    expect(await screen.findByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText("ADMIN")).toBeTruthy();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("never writes the access token to localStorage or sessionStorage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "access-token-value", accessTokenExpiresAt: new Date().toISOString() }),
      )
      .mockResolvedValueOnce(jsonResponse({ userId: "u-1", displayName: "Jane Doe", roleCodes: ["ADMIN"] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );

    await screen.findByText("Jane Doe");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
