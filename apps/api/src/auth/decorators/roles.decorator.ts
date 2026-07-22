import { SetMetadata } from "@nestjs/common";
import type { DispatchRoleCode } from "@dispatch/shared-types";

export const ROLES_KEY = "roles";

/** Declares which of the approved Dispatch role codes may access a route. */
export const Roles = (...roles: DispatchRoleCode[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
