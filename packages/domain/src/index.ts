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
  createdAt: Date;
  updatedAt: Date;
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
}

export interface RoleRepository {
  findByCode(code: string): Promise<RoleRecord | null>;
  listAll(): Promise<RoleRecord[]>;
}
