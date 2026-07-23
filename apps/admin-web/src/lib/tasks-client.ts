import {
  buildDeliveryTaskPath,
  buildDeliveryTaskSubmitPath,
  CUSTOMER_MASTER_SEARCH_PATH,
  DELIVERY_TASKS_PATH,
  type CreateDeliveryTaskRequestBody,
  type CustomerMasterSearchResponseBody,
  type DeliveryTaskDetailDto,
  type ListDeliveryTasksResponseBody,
  type UpdateDeliveryTaskDraftRequestBody,
} from "@dispatch/contracts";

/**
 * Business-endpoint client for MVP-02 (Customer Master search, Delivery
 * Task creation/editing/submission). Every call goes through the
 * AuthProvider's `authFetch` (see auth-context.tsx) so the access token is
 * attached in memory only and a single 401 triggers one silent
 * refresh+retry — this module never touches localStorage/sessionStorage/
 * IndexedDB and never handles the refresh token directly.
 */
export type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

export class TasksApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function parseJsonOrThrow<T>(response: Response, genericMessage: string): Promise<T> {
  if (!response.ok) {
    throw new TasksApiError(genericMessage, response.status);
  }
  return (await response.json()) as T;
}

export interface ListDeliveryTasksParams {
  status?: string;
  taskNumber?: string;
  page?: number;
  pageSize?: number;
}

export async function searchCustomerMaster(
  authFetch: AuthFetch,
  query: string,
): Promise<CustomerMasterSearchResponseBody> {
  const response = await authFetch(CUSTOMER_MASTER_SEARCH_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return parseJsonOrThrow(response, "ค้นหาข้อมูลลูกค้า/ปลายทางไม่สำเร็จ");
}

export async function createDeliveryTask(
  authFetch: AuthFetch,
  body: CreateDeliveryTaskRequestBody,
): Promise<DeliveryTaskDetailDto> {
  const response = await authFetch(DELIVERY_TASKS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow(response, "สร้างงานไม่สำเร็จ");
}

export async function updateDeliveryTaskDraft(
  authFetch: AuthFetch,
  taskId: string,
  body: UpdateDeliveryTaskDraftRequestBody,
): Promise<DeliveryTaskDetailDto> {
  const response = await authFetch(buildDeliveryTaskPath(taskId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow(response, "บันทึกแบบร่างไม่สำเร็จ");
}

export async function submitDeliveryTask(authFetch: AuthFetch, taskId: string): Promise<DeliveryTaskDetailDto> {
  const response = await authFetch(buildDeliveryTaskSubmitPath(taskId), { method: "POST" });
  return parseJsonOrThrow(response, "ส่งงานไม่สำเร็จ — ข้อมูลอาจไม่ครบถ้วน");
}

export async function getDeliveryTask(authFetch: AuthFetch, taskId: string): Promise<DeliveryTaskDetailDto> {
  const response = await authFetch(buildDeliveryTaskPath(taskId));
  return parseJsonOrThrow(response, "ไม่พบงานที่ต้องการ");
}

export async function listDeliveryTasks(
  authFetch: AuthFetch,
  params: ListDeliveryTasksParams = {},
): Promise<ListDeliveryTasksResponseBody> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.taskNumber) query.set("taskNumber", params.taskNumber);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));

  const response = await authFetch(`${DELIVERY_TASKS_PATH}?${query.toString()}`);
  return parseJsonOrThrow(response, "โหลดรายการงานไม่สำเร็จ");
}
