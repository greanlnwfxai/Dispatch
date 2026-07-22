import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { AuthConfig } from "../config/auth.config";
import { OriginGuard } from "./origin.guard";

function buildContext(origin?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { origin } }) }),
  } as unknown as ExecutionContext;
}

describe("OriginGuard", () => {
  const config = { allowedOrigins: ["http://localhost:6001", "http://localhost:6003"] } as AuthConfig;
  const guard = new OriginGuard(config);

  it("allows a request with no Origin header", () => {
    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });

  it("allows a request from an exact allow-listed origin", () => {
    expect(guard.canActivate(buildContext("http://localhost:6001"))).toBe(true);
  });

  it("rejects a request from an origin not on the allow-list", () => {
    expect(() => guard.canActivate(buildContext("https://evil.example.com"))).toThrow(ForbiddenException);
  });

  it("does not use a wildcard match — a near-miss origin is rejected", () => {
    expect(() => guard.canActivate(buildContext("http://localhost:6001.evil.example.com"))).toThrow(
      ForbiddenException,
    );
  });
});
