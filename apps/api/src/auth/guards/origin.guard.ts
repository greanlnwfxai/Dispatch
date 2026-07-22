import { ForbiddenException, Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AUTH_CONFIG, type AuthConfig } from "../config/auth.config";

/**
 * Rejects credentialed cross-origin requests to auth endpoints from an
 * Origin not on the exact allow-list (AUTH-001 — no wildcard origin with
 * credentials). Requests with no Origin header (same-origin browser
 * navigation, server-to-server calls, most non-browser test tooling) are
 * allowed through; the browser's own CORS enforcement (see main.ts
 * `enableCors`) is the primary defense for cross-origin script access —
 * this guard is a defense-in-depth check specifically for cookie-bearing
 * auth routes.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    if (!origin) {
      return true;
    }
    if (!this.config.allowedOrigins.includes(origin)) {
      throw new ForbiddenException("Origin not allowed.");
    }
    return true;
  }
}
