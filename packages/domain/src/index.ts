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
