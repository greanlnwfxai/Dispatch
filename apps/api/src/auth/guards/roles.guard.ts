import { ForbiddenException, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { DispatchRoleCode } from "@dispatch/shared-types";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthenticatedPrincipal } from "../types/authenticated-principal";

interface RequestWithPrincipal extends Request {
  principal?: AuthenticatedPrincipal;
}

/**
 * Authorizes against the principal JwtAuthenticationGuard already resolved
 * from PostgreSQL — never against client-supplied or JWT-claimed role data.
 * Must run after JwtAuthenticationGuard (global) in the guard chain.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<DispatchRoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.principal;
    if (!principal) {
      throw new UnauthorizedException("Authentication required.");
    }

    const hasRequiredRole = principal.roleCodes.some((code) => requiredRoles.includes(code));
    if (!hasRequiredRole) {
      throw new ForbiddenException("Insufficient role for this operation.");
    }

    return true;
  }
}
