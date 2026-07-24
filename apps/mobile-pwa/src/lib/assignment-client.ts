import {
  ASSIGNED_TASKS_PATH,
  buildAssignedTaskDetailPath,
  type AssignedTaskDetailDto,
  type ListAssignedTasksResponseBody,
} from "@dispatch/contracts";

/**
 * MVP-04 read-only "My assigned tasks" client for the
 * INTERNAL_DELIVERY_EMPLOYEE role. Every call goes through the
 * AuthProvider's `authFetch` (see auth-context.tsx) so the access token is
 * attached in memory only. Record scope (only the current primary
 * assignee's own tasks) is enforced server-side — this client never
 * assumes it, it only surfaces whatever the API returns or a 404.
 */
export type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export class AssignedTasksApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function parseJsonOrThrow<T>(response: Response, genericMessage: string): Promise<T> {
  if (!response.ok) {
    throw new AssignedTasksApiError(genericMessage, response.status);
  }
  return (await response.json()) as T;
}

export async function listMyAssignedTasks(authFetch: AuthFetch): Promise<ListAssignedTasksResponseBody> {
  const response = await authFetch(`${ASSIGNED_TASKS_PATH}?page=1&pageSize=50`);
  return parseJsonOrThrow(response, "Failed to load your assigned tasks.");
}

export async function getMyAssignedTaskDetail(authFetch: AuthFetch, taskId: string): Promise<AssignedTaskDetailDto> {
  const response = await authFetch(buildAssignedTaskDetailPath(taskId));
  return parseJsonOrThrow(response, "Assigned task not found.");
}
