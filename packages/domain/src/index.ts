/**
 * Domain foundation layer.
 *
 * This package must remain pure TypeScript with zero framework
 * dependencies (no NestJS, Next.js, Prisma, React, or Docker-specific
 * code) so future domain aggregates (DeliveryTask, DeliveryAttempt,
 * ReturnedGoods, EmergencyOverride — see Dispatch Knowledge Topic 11 §7-8)
 * stay testable without infrastructure.
 *
 * No business aggregates or rules are defined in DEV-FOUNDATION-001.
 * Only a generic branded-identifier helper is provided as the shared
 * foundation that future domain identifiers (Task ID, Attempt ID, ...)
 * will build on.
 */

export type BrandedId<Brand extends string> = string & { readonly __brand: Brand };

export function createBrandedId<Brand extends string>(
  _brand: Brand,
  value: string,
): BrandedId<Brand> {
  if (value.trim().length === 0) {
    throw new Error("createBrandedId: value must not be empty");
  }
  return value as BrandedId<Brand>;
}

/**
 * Identity/Role technical persistence boundary (DEV-FOUNDATION-002).
 *
 * These are framework/ORM-independent record shapes and repository
 * interfaces only — no aggregates, no permission decisions, no
 * authentication. AUTH-001 owns login/credential behavior; this milestone
 * only establishes the persistence shape those future modules will build on.
 *
 * `UserRoleAssignment` intentionally represents an unbounded set of role
 * assignments per user. Whether a user may hold more than one active role
 * at a time is not decided by Dispatch Knowledge Topics 01-10 or Topic 11 —
 * this schema stays neutral so that policy can be added later (by AUTH-001
 * or a dedicated authorization milestone) without a schema rewrite.
 */

export interface UserRecord {
  id: string;
  displayName: string;
  isActive: boolean;
  credentialsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Extended shape used only by authentication lookups (AUTH-001). Carries
 * the credential fields (`passwordHash`, `loginIdNormalized`) that
 * `UserRecord` deliberately omits so ordinary identity reads never touch
 * credential material.
 */
export interface UserCredentialRecord extends UserRecord {
  loginIdNormalized: string | null;
  passwordHash: string | null;
  credentialsUpdatedAt: Date | null;
}

export interface RoleRecord {
  id: string;
  code: string;
  displayName: string;
  isSystemRole: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRoleAssignmentRecord {
  id: string;
  userId: string;
  roleId: string;
  assignedAt: Date;
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  /** Looks up a User by its normalized loginId (AUTH-001 credential lookup). */
  findByLoginId(loginIdNormalized: string): Promise<UserCredentialRecord | null>;
}

export interface RoleRepository {
  findByCode(code: string): Promise<RoleRecord | null>;
  listAll(): Promise<RoleRecord[]>;
}

/**
 * Reads a user's currently assigned role codes (AUTH-001 authorization
 * boundary). Intentionally returns however many codes are assigned — zero,
 * one, or several — since cardinality is not enforced (see UserRoleAssignment
 * schema note).
 */
export interface UserRoleAssignmentRepository {
  listRoleCodesForUser(userId: string): Promise<string[]>;
}

/**
 * Server-side session record (AUTH-001). A session is the unit of
 * revocation — see AuthSession Prisma model for the persistence rationale.
 */
export interface AuthSessionRecord {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}

/**
 * Opaque rotating refresh-token record (AUTH-001). `tokenHash` is a
 * cryptographic hash of the token's random secret — the raw token is never
 * persisted or returned by any repository method.
 */
export interface RefreshTokenRecordShape {
  id: string;
  sessionId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
}

export interface CreateSessionInput {
  userId: string;
  expiresAt: Date;
}

export interface CreateRefreshTokenInput {
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RotateRefreshTokenInput {
  currentTokenId: string;
  sessionId: string;
  newTokenHash: string;
  newExpiresAt: Date;
}

/**
 * Server-side session/revocation persistence boundary (AUTH-001). The
 * Prisma adapter (`PrismaSessionRepository`) is responsible for making
 * `rotateRefreshToken` atomic (a single conditional UPDATE guarding the
 * used/revoked check) so concurrent refresh attempts against the same
 * token can never both succeed — see AuthService for reuse handling when
 * this method returns `null`.
 */
export interface SessionRepository {
  createSession(input: CreateSessionInput): Promise<AuthSessionRecord>;
  findSessionById(id: string): Promise<AuthSessionRecord | null>;
  touchSessionLastSeen(id: string, lastSeenAt: Date): Promise<void>;
  revokeSession(id: string, reason: string): Promise<void>;
  revokeAllSessionsForUser(userId: string, reason: string): Promise<number>;

  createRefreshToken(input: CreateRefreshTokenInput): Promise<RefreshTokenRecordShape>;
  findRefreshTokenById(id: string): Promise<RefreshTokenRecordShape | null>;
  /**
   * Atomically transitions the current token to used and creates its
   * replacement. Returns `null` when the current token was not in a
   * rotatable state (already used or revoked) — the caller must treat that
   * as reuse and revoke the owning session.
   */
  rotateRefreshToken(input: RotateRefreshTokenInput): Promise<RefreshTokenRecordShape | null>;
  /** Marks every not-yet-used, not-yet-revoked token under a session as revoked. */
  revokeRefreshTokensForSession(sessionId: string): Promise<number>;
}
