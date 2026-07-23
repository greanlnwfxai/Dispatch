import type { DispatchRoleCode } from "@dispatch/shared-types";

/** Mirrors the server-side RBAC matrix (TasksController) — client-side only for UI visibility, never authoritative. */
export const TASK_CREATE_EDIT_SUBMIT_ROLES: DispatchRoleCode[] = ["SUPER_ADMIN", "ADMIN", "DISPATCHER"];

export function canCreateEditSubmitTasks(roleCodes: DispatchRoleCode[]): boolean {
  return roleCodes.some((code) => TASK_CREATE_EDIT_SUBMIT_ROLES.includes(code));
}

export const PREPARATION_WRITE_ROLES: DispatchRoleCode[] = ["SUPER_ADMIN", "ADMIN", "STOCK"];
export const CORRECTION_CREATE_ROLES: DispatchRoleCode[] = ["ADMIN"];
export const CORRECTION_REVIEW_ROLES: DispatchRoleCode[] = ["SUPER_ADMIN"];

export function canWritePreparation(roleCodes: DispatchRoleCode[]): boolean {
  return roleCodes.some((code) => PREPARATION_WRITE_ROLES.includes(code));
}

export function canCreatePreparationCorrection(roleCodes: DispatchRoleCode[]): boolean {
  return roleCodes.some((code) => CORRECTION_CREATE_ROLES.includes(code));
}

export function canReviewPreparationCorrection(roleCodes: DispatchRoleCode[]): boolean {
  return roleCodes.some((code) => CORRECTION_REVIEW_ROLES.includes(code));
}
