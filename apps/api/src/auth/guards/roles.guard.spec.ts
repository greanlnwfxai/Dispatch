import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  function buildGuard(requiredRoles: string[] | undefined) {
    const reflector = new Reflector();
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(requiredRoles);
    return new RolesGuard(reflector);
  }

  it("allows the request when the route declares no @Roles()", () => {
    const guard = buildGuard(undefined);
    const context = buildContext({ principal: undefined });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("throws Unauthorized when no principal is present (should not normally happen post-JwtAuthenticationGuard)", () => {
    const guard = buildGuard(["ADMIN"]);
    const context = buildContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("throws Forbidden when the principal lacks every required role", () => {
    const guard = buildGuard(["SUPER_ADMIN"]);
    const context = buildContext({ principal: { roleCodes: ["DISPATCHER"] } });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("allows the request when the principal has one of several allowed roles", () => {
    const guard = buildGuard(["ADMIN", "DISPATCHER"]);
    const context = buildContext({ principal: { roleCodes: ["DISPATCHER"] } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("never trusts a role list from anywhere other than the resolved principal", () => {
    const guard = buildGuard(["SUPER_ADMIN"]);
    // Even if some other part of the request object carried a spoofed role
    // claim, only `request.principal.roleCodes` is consulted.
    const context = buildContext({
      principal: { roleCodes: ["DISPATCHER"] },
      body: { roleCodes: ["SUPER_ADMIN"] },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
