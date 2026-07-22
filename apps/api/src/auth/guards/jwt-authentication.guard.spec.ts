import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthenticationGuard } from "./jwt-authentication.guard";

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe("JwtAuthenticationGuard", () => {
  const USER_ID = "11111111-1111-1111-1111-111111111111";
  const SESSION_ID = "22222222-2222-2222-2222-222222222222";

  function buildGuard(overrides: {
    isPublic?: boolean;
    verify?: () => Promise<{ sub: string; sid: string }>;
    session?: unknown;
    user?: unknown;
    roleCodes?: string[];
  }) {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(overrides.isPublic ?? false);

    const accessTokenService = {
      verify: overrides.verify ?? jest.fn().mockResolvedValue({ sub: USER_ID, sid: SESSION_ID }),
    };
    const sessionRepository = {
      findSessionById: jest.fn().mockResolvedValue(
        overrides.session === undefined
          ? { id: SESSION_ID, userId: USER_ID, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) }
          : overrides.session,
      ),
    };
    const userRepository = {
      findById: jest.fn().mockResolvedValue(
        overrides.user === undefined
          ? { id: USER_ID, displayName: "Test User", isActive: true, credentialsEnabled: true }
          : overrides.user,
      ),
    };
    const roleAssignmentRepository = {
      listRoleCodesForUser: jest.fn().mockResolvedValue(overrides.roleCodes ?? ["ADMIN"]),
    };

    const guard = new JwtAuthenticationGuard(
      reflector,
      accessTokenService as never,
      sessionRepository as never,
      userRepository as never,
      roleAssignmentRepository as never,
    );

    return { guard, sessionRepository, userRepository, roleAssignmentRepository };
  }

  it("allows a route marked @Public() without checking the token", async () => {
    const { guard } = buildGuard({ isPublic: true });
    const context = buildContext({ headers: {} });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("rejects a request with no Authorization header", async () => {
    const { guard } = buildGuard({});
    const context = buildContext({ headers: {} });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a malformed Authorization header", async () => {
    const { guard } = buildGuard({});
    const context = buildContext({ headers: { authorization: "NotBearer abc" } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects an invalid/expired JWT", async () => {
    const { guard } = buildGuard({ verify: jest.fn().mockRejectedValue(new Error("bad token")) });
    const context = buildContext({ headers: { authorization: "Bearer whatever" } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects when the session is revoked", async () => {
    const { guard } = buildGuard({
      session: { id: SESSION_ID, userId: USER_ID, revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
    });
    const context = buildContext({ headers: { authorization: "Bearer valid" } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects when the session is expired", async () => {
    const { guard } = buildGuard({
      session: { id: SESSION_ID, userId: USER_ID, revokedAt: null, expiresAt: new Date(Date.now() - 60_000) },
    });
    const context = buildContext({ headers: { authorization: "Bearer valid" } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects when the session does not exist", async () => {
    const { guard } = buildGuard({ session: null });
    const context = buildContext({ headers: { authorization: "Bearer valid" } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects when the user is inactive", async () => {
    const { guard } = buildGuard({
      user: { id: USER_ID, displayName: "Test", isActive: false, credentialsEnabled: true },
    });
    const context = buildContext({ headers: { authorization: "Bearer valid" } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects when credentials are disabled", async () => {
    const { guard } = buildGuard({
      user: { id: USER_ID, displayName: "Test", isActive: true, credentialsEnabled: false },
    });
    const context = buildContext({ headers: { authorization: "Bearer valid" } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("attaches a safe principal (no passwordHash/loginId) resolved from the database", async () => {
    const { guard } = buildGuard({ roleCodes: ["ADMIN", "DISPATCHER"] });
    const request: Record<string, unknown> = { headers: { authorization: "Bearer valid" } };
    const context = buildContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.principal).toEqual({
      userId: USER_ID,
      sessionId: SESSION_ID,
      displayName: "Test User",
      roleCodes: ["ADMIN", "DISPATCHER"],
    });
  });

  it("filters out any role code that is not one of the approved Dispatch role codes", async () => {
    const { guard } = buildGuard({ roleCodes: ["ADMIN", "NOT_A_REAL_ROLE"] });
    const request: Record<string, unknown> = { headers: { authorization: "Bearer valid" } };
    const context = buildContext(request);

    await guard.canActivate(context);
    expect((request.principal as { roleCodes: string[] }).roleCodes).toEqual(["ADMIN"]);
  });
});
