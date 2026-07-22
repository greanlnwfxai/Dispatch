import type { DispatchRoleCode } from "@dispatch/shared-types";

/**
 * The authenticated principal, resolved server-side (session → user →
 * roles, all read from PostgreSQL) on every request — never derived solely
 * from JWT claims. See JwtAuthenticationGuard.
 */
export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  displayName: string;
  roleCodes: DispatchRoleCode[];
}
