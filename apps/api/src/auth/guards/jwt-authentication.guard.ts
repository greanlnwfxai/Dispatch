import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { isDispatchRoleCode } from "@dispatch/shared-types";
import { PrismaSessionRepository } from "../../infrastructure/database/repositories/prisma-session.repository";
import { PrismaUserRepository } from "../../infrastructure/database/repositories/prisma-user.repository";
import { PrismaUserRoleAssignmentRepository } from "../../infrastructure/database/repositories/prisma-user-role-assignment.repository";
import { AccessTokenService } from "../tokens/access-token.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AuthenticatedPrincipal } from "../types/authenticated-principal";

interface RequestWithPrincipal extends Request {
  principal?: AuthenticatedPrincipal;
}

const GENERIC_UNAUTHORIZED = "Authentication required.";

/**
 * Verifies the JWT access token, then re-resolves the principal from
 * PostgreSQL on every request (session not revoked/expired, user active,
 * credentials enabled, current role codes) — the JWT's own claims are never
 * treated as the final authorization source (AUTH-001 boundary).
 */
@Injectable()
export class JwtAuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokenService: AccessTokenService,
    private readonly sessionRepository: PrismaSessionRepository,
    private readonly userRepository: PrismaUserRepository,
    private readonly roleAssignmentRepository: PrismaUserRoleAssignmentRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED);
    }

    let claims;
    try {
      claims = await this.accessTokenService.verify(token);
    } catch {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED);
    }

    const session = await this.sessionRepository.findSessionById(claims.sid);
    const now = new Date();
    if (!session || session.revokedAt !== null || session.expiresAt <= now) {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED);
    }

    const user = await this.userRepository.findById(claims.sub);
    if (!user || !user.isActive || !user.credentialsEnabled) {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED);
    }

    const roleCodes = (await this.roleAssignmentRepository.listRoleCodesForUser(user.id)).filter(
      isDispatchRoleCode,
    );

    request.principal = {
      userId: user.id,
      sessionId: session.id,
      displayName: user.displayName,
      roleCodes,
    };

    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return null;
    }
    const token = header.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }
}
