import { UnauthorizedException } from "@nestjs/common";
import type { AuthConfig } from "./config/auth.config";
import { AuthService } from "./auth.service";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "22222222-2222-2222-2222-222222222222";
const TOKEN_ID = "33333333-3333-3333-3333-333333333333";
const NEW_TOKEN_ID = "44444444-4444-4444-4444-444444444444";

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

describe("AuthService", () => {
  function buildService(opts?: { config?: Partial<AuthConfig> }) {
    const config = buildConfig(opts?.config);

    const passwordHasher = {
      hash: jest.fn(),
      verify: jest.fn(),
    };
    const accessTokenService = {
      issue: jest.fn().mockResolvedValue({ token: "signed.jwt.token", expiresAt: new Date(Date.now() + 900_000) }),
    };
    const refreshTokenService = {
      generateSecret: jest.fn().mockReturnValue({ secret: "generated-secret", hash: "generated-hash" }),
      hashSecret: jest.fn(),
      buildTokenString: jest.fn((id: string, secret: string) => `${id}.${secret}`),
      parseTokenString: jest.fn((tokenString: string) => {
        const [tokenRecordId, secret] = tokenString.split(".");
        return tokenRecordId && secret ? { tokenRecordId, secret } : null;
      }),
      matchesHash: jest.fn().mockReturnValue(true),
    };
    const sessionRepository = {
      createSession: jest.fn().mockResolvedValue({
        id: SESSION_ID,
        userId: USER_ID,
        createdAt: new Date(),
        lastSeenAt: null,
        expiresAt: new Date(Date.now() + config.sessionAbsoluteTtlSeconds * 1000),
        revokedAt: null,
        revokedReason: null,
      }),
      findSessionById: jest.fn(),
      touchSessionLastSeen: jest.fn(),
      revokeSession: jest.fn(),
      revokeAllSessionsForUser: jest.fn(),
      createRefreshToken: jest.fn().mockResolvedValue({
        id: TOKEN_ID,
        sessionId: SESSION_ID,
        tokenHash: "generated-hash",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + config.refreshTtlSeconds * 1000),
        usedAt: null,
        revokedAt: null,
        replacedByTokenId: null,
      }),
      findRefreshTokenById: jest.fn(),
      rotateRefreshToken: jest.fn(),
      revokeRefreshTokensForSession: jest.fn(),
    };
    const userRepository = {
      findById: jest.fn(),
      findByLoginId: jest.fn(),
    };
    const roleAssignmentRepository = {
      listRoleCodesForUser: jest.fn().mockResolvedValue(["ADMIN"]),
    };

    const service = new AuthService(
      config,
      passwordHasher as never,
      accessTokenService as never,
      refreshTokenService as never,
      sessionRepository as never,
      userRepository as never,
      roleAssignmentRepository as never,
    );

    return {
      service,
      config,
      passwordHasher,
      accessTokenService,
      refreshTokenService,
      sessionRepository,
      userRepository,
      roleAssignmentRepository,
    };
  }

  describe("login", () => {
    it("succeeds for a valid loginId/password, creating a session and initial refresh token", async () => {
      const { service, userRepository, passwordHasher, sessionRepository } = buildService();
      userRepository.findByLoginId.mockResolvedValue({
        id: USER_ID,
        displayName: "Jane Doe",
        isActive: true,
        credentialsEnabled: true,
        passwordHash: "stored-hash",
        loginIdNormalized: "jane.doe",
        credentialsUpdatedAt: new Date(),
      });
      passwordHasher.verify.mockResolvedValue(true);

      const result = await service.login("  Jane.Doe  ", "correct-password-test-only");

      expect(userRepository.findByLoginId).toHaveBeenCalledWith("jane.doe");
      expect(sessionRepository.createSession).toHaveBeenCalledWith({ userId: USER_ID, expiresAt: expect.any(Date) });
      expect(sessionRepository.createRefreshToken).toHaveBeenCalled();
      expect(result.principal).toEqual({ userId: USER_ID, displayName: "Jane Doe", roleCodes: ["ADMIN"] });
      expect(result.refreshToken).toBe(`${TOKEN_ID}.generated-secret`);
    });

    it("rejects an unknown loginId with the generic error, without revealing existence", async () => {
      const { service, userRepository, passwordHasher } = buildService();
      userRepository.findByLoginId.mockResolvedValue(null);

      await expect(service.login("nobody", "whatever-password")).rejects.toThrow(UnauthorizedException);
      // Still burns comparable time via a dummy verify call.
      expect(passwordHasher.verify).toHaveBeenCalled();
    });

    it("rejects an invalid password with the same generic error as unknown loginId", async () => {
      const { service, userRepository, passwordHasher } = buildService();
      userRepository.findByLoginId.mockResolvedValue({
        id: USER_ID,
        displayName: "Jane Doe",
        isActive: true,
        credentialsEnabled: true,
        passwordHash: "stored-hash",
        loginIdNormalized: "jane.doe",
        credentialsUpdatedAt: new Date(),
      });
      passwordHasher.verify.mockResolvedValue(false);

      let unknownUserError: unknown;
      let wrongPasswordError: unknown;
      userRepository.findByLoginId.mockResolvedValueOnce(null);
      try {
        await service.login("unknown", "x");
      } catch (error) {
        unknownUserError = error;
      }
      try {
        await service.login("jane.doe", "wrong");
      } catch (error) {
        wrongPasswordError = error;
      }

      expect((unknownUserError as UnauthorizedException).message).toBe(
        (wrongPasswordError as UnauthorizedException).message,
      );
    });

    it("rejects an inactive user", async () => {
      const { service, userRepository } = buildService();
      userRepository.findByLoginId.mockResolvedValue({
        id: USER_ID,
        displayName: "Jane Doe",
        isActive: false,
        credentialsEnabled: true,
        passwordHash: "stored-hash",
        loginIdNormalized: "jane.doe",
        credentialsUpdatedAt: new Date(),
      });

      await expect(service.login("jane.doe", "whatever")).rejects.toThrow(UnauthorizedException);
    });

    it("rejects a user with credentials disabled", async () => {
      const { service, userRepository } = buildService();
      userRepository.findByLoginId.mockResolvedValue({
        id: USER_ID,
        displayName: "Jane Doe",
        isActive: true,
        credentialsEnabled: false,
        passwordHash: null,
        loginIdNormalized: "jane.doe",
        credentialsUpdatedAt: null,
      });

      await expect(service.login("jane.doe", "whatever")).rejects.toThrow(UnauthorizedException);
    });

    it("caps the refresh token's expiry to the session's absolute expiry", async () => {
      const { service, userRepository, passwordHasher, sessionRepository, config } = buildService({
        config: { sessionAbsoluteTtlSeconds: 10, refreshTtlSeconds: 1_209_600 },
      });
      userRepository.findByLoginId.mockResolvedValue({
        id: USER_ID,
        displayName: "Jane Doe",
        isActive: true,
        credentialsEnabled: true,
        passwordHash: "stored-hash",
        loginIdNormalized: "jane.doe",
        credentialsUpdatedAt: new Date(),
      });
      passwordHasher.verify.mockResolvedValue(true);

      await service.login("jane.doe", "correct-password-test-only");

      const createRefreshTokenArgs = sessionRepository.createRefreshToken.mock.calls[0][0];
      const sessionExpiresAt = sessionRepository.createSession.mock.results[0];
      void sessionExpiresAt;
      const maxExpected = Date.now() + config.sessionAbsoluteTtlSeconds * 1000 + 1000;
      expect(createRefreshTokenArgs.expiresAt.getTime()).toBeLessThanOrEqual(maxExpected);
    });
  });

  describe("refresh", () => {
    function validRecord(overrides: Record<string, unknown> = {}) {
      return {
        id: TOKEN_ID,
        sessionId: SESSION_ID,
        tokenHash: "stored-hash",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        revokedAt: null,
        replacedByTokenId: null,
        ...overrides,
      };
    }
    function validSession(overrides: Record<string, unknown> = {}) {
      return {
        id: SESSION_ID,
        userId: USER_ID,
        createdAt: new Date(),
        lastSeenAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        revokedReason: null,
        ...overrides,
      };
    }
    function activeUser(overrides: Record<string, unknown> = {}) {
      return { id: USER_ID, displayName: "Jane Doe", isActive: true, credentialsEnabled: true, ...overrides };
    }

    it("rotates a valid refresh token and issues a new access token", async () => {
      const { service, sessionRepository, userRepository } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue(validRecord());
      sessionRepository.findSessionById.mockResolvedValue(validSession());
      userRepository.findById.mockResolvedValue(activeUser());
      sessionRepository.rotateRefreshToken.mockResolvedValue({
        id: NEW_TOKEN_ID,
        sessionId: SESSION_ID,
        tokenHash: "generated-hash",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        revokedAt: null,
        replacedByTokenId: null,
      });

      const result = await service.refresh(`${TOKEN_ID}.correct-secret`);

      expect(sessionRepository.rotateRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ currentTokenId: TOKEN_ID, sessionId: SESSION_ID }),
      );
      expect(result.refreshToken).toBe(`${NEW_TOKEN_ID}.generated-secret`);
    });

    it("rejects a malformed refresh token string", async () => {
      const { service } = buildService();
      await expect(service.refresh("not-a-valid-token-string")).rejects.toThrow(UnauthorizedException);
    });

    it("rejects when the token id is not found", async () => {
      const { service, sessionRepository } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue(null);
      await expect(service.refresh(`${TOKEN_ID}.secret`)).rejects.toThrow(UnauthorizedException);
    });

    it("rejects when the secret does not match the stored hash", async () => {
      const { service, sessionRepository, refreshTokenService } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue(validRecord());
      refreshTokenService.matchesHash.mockReturnValue(false);
      await expect(service.refresh(`${TOKEN_ID}.wrong-secret`)).rejects.toThrow(UnauthorizedException);
    });

    it("revokes the session when a used token is presented again (reuse)", async () => {
      const { service, sessionRepository } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue(validRecord({ usedAt: new Date() }));

      await expect(service.refresh(`${TOKEN_ID}.secret`)).rejects.toThrow(UnauthorizedException);
      expect(sessionRepository.revokeSession).toHaveBeenCalledWith(SESSION_ID, "refresh_token_reuse");
    });

    it("revokes the session when an already-revoked token is presented again", async () => {
      const { service, sessionRepository } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue(validRecord({ revokedAt: new Date() }));

      await expect(service.refresh(`${TOKEN_ID}.secret`)).rejects.toThrow(UnauthorizedException);
      expect(sessionRepository.revokeSession).toHaveBeenCalledWith(SESSION_ID, "refresh_token_reuse");
    });

    it("rejects an expired (but never-used) token without forcing a session revoke", async () => {
      const { service, sessionRepository } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue(
        validRecord({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.refresh(`${TOKEN_ID}.secret`)).rejects.toThrow(UnauthorizedException);
      expect(sessionRepository.revokeSession).not.toHaveBeenCalled();
    });

    it("rejects when the owning session is revoked", async () => {
      const { service, sessionRepository } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue(validRecord());
      sessionRepository.findSessionById.mockResolvedValue(validSession({ revokedAt: new Date() }));

      await expect(service.refresh(`${TOKEN_ID}.secret`)).rejects.toThrow(UnauthorizedException);
    });

    it("rejects when the owning session is expired", async () => {
      const { service, sessionRepository } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue(validRecord());
      sessionRepository.findSessionById.mockResolvedValue(validSession({ expiresAt: new Date(Date.now() - 1000) }));

      await expect(service.refresh(`${TOKEN_ID}.secret`)).rejects.toThrow(UnauthorizedException);
    });

    it("treats a lost concurrent-rotation race (rotateRefreshToken -> null) as reuse and revokes the session", async () => {
      const { service, sessionRepository, userRepository } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue(validRecord());
      sessionRepository.findSessionById.mockResolvedValue(validSession());
      userRepository.findById.mockResolvedValue(activeUser());
      sessionRepository.rotateRefreshToken.mockResolvedValue(null);

      await expect(service.refresh(`${TOKEN_ID}.secret`)).rejects.toThrow(UnauthorizedException);
      expect(sessionRepository.revokeSession).toHaveBeenCalledWith(SESSION_ID, "refresh_token_concurrent_reuse");
    });

    it("rejects when the user backing the session is no longer active", async () => {
      const { service, sessionRepository, userRepository } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue(validRecord());
      sessionRepository.findSessionById.mockResolvedValue(validSession());
      userRepository.findById.mockResolvedValue(activeUser({ isActive: false }));

      await expect(service.refresh(`${TOKEN_ID}.secret`)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("logout", () => {
    it("is idempotent when no refresh token cookie was presented", async () => {
      const { service, sessionRepository } = buildService();
      await expect(service.logout(undefined)).resolves.toBeUndefined();
      expect(sessionRepository.revokeSession).not.toHaveBeenCalled();
    });

    it("is idempotent for an unknown token (never reveals whether it existed)", async () => {
      const { service, sessionRepository } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue(null);
      await expect(service.logout(`${TOKEN_ID}.secret`)).resolves.toBeUndefined();
      expect(sessionRepository.revokeSession).not.toHaveBeenCalled();
    });

    it("revokes the session and its refresh tokens for a valid token", async () => {
      const { service, sessionRepository } = buildService();
      sessionRepository.findRefreshTokenById.mockResolvedValue({
        id: TOKEN_ID,
        sessionId: SESSION_ID,
        tokenHash: "stored-hash",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        revokedAt: null,
        replacedByTokenId: null,
      });

      await service.logout(`${TOKEN_ID}.secret`);

      expect(sessionRepository.revokeSession).toHaveBeenCalledWith(SESSION_ID, "logout");
      expect(sessionRepository.revokeRefreshTokensForSession).toHaveBeenCalledWith(SESSION_ID);
    });
  });

  describe("logoutAll", () => {
    it("revokes every session for the given user only", async () => {
      const { service, sessionRepository } = buildService();
      await service.logoutAll(USER_ID);
      expect(sessionRepository.revokeAllSessionsForUser).toHaveBeenCalledWith(USER_ID, "logout_all");
    });
  });
});
