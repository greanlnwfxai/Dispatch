import type { DispatchRoleCode } from "@dispatch/shared-types";

/** Mirrors the server-side RBAC matrix (TasksController) — client-side only for UI visibility, never authoritative. */
export const TASK_CREATE_EDIT_SUBMIT_ROLES: DispatchRoleCode[] = ["SUPER_ADMIN", "ADMIN", "DISPATCHER"];

export function canCreateEditSubmitTasks(roleCodes: DispatchRoleCode[]): boolean {
  return roleCodes.some((code) => TASK_CREATE_EDIT_SUBMIT_ROLES.includes(code));
}
