import { JwtService } from "@nestjs/jwt";
import { AccessTokenService } from "./access-token.service";
import type { AuthConfig } from "../config/auth.config";

function buildConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    jwtAccessSecret: "test-only-access-secret-not-a-real-secret-value",
    jwtAccessTtlSeconds: 900,
    jwtIssuer: "dispatch-api-test",
    jwtAudience: "dispatch-clients-test",
    refreshTtlSeconds: 1_209_600,
    sessionAbsoluteTtlSeconds: 2_592_000,
    cookieName: "dispatch_refresh_token",
    cookieSecure: false,
    allowedOrigins: ["http://localhost:6001"],
    loginRateLimit: { limit: 5, ttlSeconds: 60 },
    refreshRateLimit: { limit: 30, ttlSeconds: 60 },
    passwordMinLength: 12,
    passwordMaxLength: 128,
    ...overrides,
  };
}

describe("AccessTokenService", () => {
  const USER_ID = "11111111-1111-1111-1111-111111111111";
  const SESSION_ID = "22222222-2222-2222-2222-222222222222";

  it("issues a JWT carrying only sub/sid/jti (+ standard claims) — no PII", async () => {
    const config = buildConfig();
    const service = new AccessTokenService(new JwtService(), config);
    const issued = await service.issue(USER_ID, SESSION_ID);

    const claims = await service.verify(issued.token);
    expect(claims.sub).toBe(USER_ID);
    expect(claims.sid).toBe(SESSION_ID);
    expect(claims.iss).toBe(config.jwtIssuer);
    expect(claims.aud).toBe(config.jwtAudience);
    expect(typeof claims.jti).toBe("string");
    expect(claims.jti.length).toBeGreaterThan(0);
    expect(Object.keys(claims).sort()).toEqual(["aud", "exp", "iat", "iss", "jti", "sid", "sub"]);
  });

  it("issues a token with a short, configured lifetime", async () => {
    const config = buildConfig({ jwtAccessTtlSeconds: 900 });
    const service = new AccessTokenService(new JwtService(), config);
    const issued = await service.issue(USER_ID, SESSION_ID);
    const expectedExpiry = Date.now() + 900 * 1000;
    expect(Math.abs(issued.expiresAt.getTime() - expectedExpiry)).toBeLessThan(2000);
  });

  it("rejects a token signed with a different secret", async () => {
    const config = buildConfig();
    const service = new AccessTokenService(new JwtService(), config);
    const issued = await service.issue(USER_ID, SESSION_ID);

    const otherConfig = buildConfig({ jwtAccessSecret: "a-completely-different-secret-value-test" });
    const otherService = new AccessTokenService(new JwtService(), otherConfig);
    await expect(otherService.verify(issued.token)).rejects.toThrow();
  });

  it("rejects a token with the wrong issuer", async () => {
    const config = buildConfig();
    const service = new AccessTokenService(new JwtService(), config);
    const issued = await service.issue(USER_ID, SESSION_ID);

    const wrongAudienceConfig = buildConfig({ jwtAudience: "some-other-audience" });
    const wrongAudienceService = new AccessTokenService(new JwtService(), wrongAudienceConfig);
    await expect(wrongAudienceService.verify(issued.token)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const config = buildConfig({ jwtAccessTtlSeconds: 1 });
    const service = new AccessTokenService(new JwtService(), config);
    const issued = await service.issue(USER_ID, SESSION_ID);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    await expect(service.verify(issued.token)).rejects.toThrow();
  }, 10_000);
});
