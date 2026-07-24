import {
  buildDeliveryTaskPath,
  buildDeliveryTaskSubmitPath,
  buildPreparationConfirmReadyPath,
  buildPreparationCorrectionReviewPath,
  buildPreparationCorrectionsPath,
  buildPreparationEvidencePath,
  buildPreparationIssueResolvePath,
  buildPreparationIssuesPath,
  buildPreparationPath,
  buildPreparationStartPath,
  buildTaskAssignmentHistoryPath,
  buildTaskAssignmentPath,
  PREPARATION_CORRECTIONS_PATH,
  ASSIGNMENT_CANDIDATES_PATH,
  CUSTOMER_MASTER_SEARCH_PATH,
  DELIVERY_TASKS_PATH,
  type AssignmentHistoryResponseBody,
  type AssignTaskRequestBody,
  type CreatePreparationCorrectionRequestBody,
  type CreateDeliveryTaskRequestBody,
  type CurrentAssignmentResponseBody,
  type CustomerMasterSearchResponseBody,
  type DeliveryTaskDetailDto,
  type ListAssignmentCandidatesResponseBody,
  type ListDeliveryTasksResponseBody,
  type ListPreparationCorrectionsResponseBody,
  type PreparationDetailDto,
  type ReassignTaskRequestBody,
  type UpdatePreparationRequestBody,
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

/**
 * Carries the API's structured conflict `code` (e.g. `STALE_ASSIGNMENT`)
 * alongside the generic HTTP status, so the reassignment UI can show a
 * specific "refresh and try again" message instead of a generic error.
 */
export class AssignmentConflictError extends TasksApiError {
  constructor(
    message: string,
    status: number,
    public readonly code?: string,
  ) {
    super(message, status);
  }
}

async function parseAssignmentResponse<T>(response: Response, genericMessage: string): Promise<T> {
  if (!response.ok) {
    let code: string | undefined;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "code" in body && typeof (body as { code: unknown }).code === "string") {
        code = (body as { code: string }).code;
      }
    } catch {
      // Response body was not JSON — fall through with no code, generic message.
    }
    throw new AssignmentConflictError(
      code === "STALE_ASSIGNMENT" ? "การมอบหมายมีการเปลี่ยนแปลงหลังจากที่โหลดข้อมูลล่าสุด กรุณารีเฟรชแล้วลองใหม่อีกครั้ง" : genericMessage,
      response.status,
      code,
    );
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

export async function getPreparation(authFetch: AuthFetch, taskId: string): Promise<PreparationDetailDto | null> {
  const response = await authFetch(buildPreparationPath(taskId));
  if (response.status === 404) return null;
  return parseJsonOrThrow(response, "โหลดข้อมูลการเตรียมสินค้าไม่สำเร็จ");
}

export async function startPreparation(authFetch: AuthFetch, taskId: string): Promise<PreparationDetailDto> {
  const response = await authFetch(buildPreparationStartPath(taskId), { method: "POST" });
  return parseJsonOrThrow(response, "เริ่มเตรียมสินค้าไม่สำเร็จ");
}

export async function updatePreparation(
  authFetch: AuthFetch,
  taskId: string,
  body: UpdatePreparationRequestBody,
): Promise<PreparationDetailDto> {
  const response = await authFetch(buildPreparationPath(taskId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow(response, "บันทึกการเตรียมสินค้าไม่สำเร็จ");
}

export async function createPreparationIssue(
  authFetch: AuthFetch,
  taskId: string,
  body: { preparationItemId?: string | null; description: string },
): Promise<PreparationDetailDto> {
  const response = await authFetch(buildPreparationIssuesPath(taskId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow(response, "บันทึกปัญหาการเตรียมสินค้าไม่สำเร็จ");
}

export async function resolvePreparationIssue(
  authFetch: AuthFetch,
  taskId: string,
  issueId: string,
  body: { resolutionNote: string },
): Promise<PreparationDetailDto> {
  const response = await authFetch(buildPreparationIssueResolvePath(taskId, issueId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow(response, "แก้ไขสถานะปัญหาไม่สำเร็จ");
}

export async function uploadPreparationEvidence(authFetch: AuthFetch, taskId: string, file: File): Promise<PreparationDetailDto> {
  const formData = new FormData();
  formData.append("photo", file);
  const response = await authFetch(buildPreparationEvidencePath(taskId), { method: "POST", body: formData });
  return parseJsonOrThrow(response, "อัปโหลดรูปก่อนโหลดไม่สำเร็จ");
}

export async function confirmPreparationReady(authFetch: AuthFetch, taskId: string): Promise<PreparationDetailDto> {
  const response = await authFetch(buildPreparationConfirmReadyPath(taskId), { method: "POST" });
  return parseJsonOrThrow(response, "ยืนยันพร้อมจัดส่งไม่สำเร็จ");
}

export async function createPreparationCorrection(
  authFetch: AuthFetch,
  taskId: string,
  body: CreatePreparationCorrectionRequestBody,
): Promise<PreparationDetailDto> {
  const response = await authFetch(buildPreparationCorrectionsPath(taskId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow(response, "สร้าง Correction/Exception Record ไม่สำเร็จ");
}

export async function listPreparationCorrections(authFetch: AuthFetch): Promise<ListPreparationCorrectionsResponseBody> {
  const response = await authFetch(`${PREPARATION_CORRECTIONS_PATH}?page=1&pageSize=50`);
  return parseJsonOrThrow(response, "โหลดคิว Correction/Exception ไม่สำเร็จ");
}

export async function reviewPreparationCorrection(
  authFetch: AuthFetch,
  correctionId: string,
  reviewNote: string,
): Promise<unknown> {
  const response = await authFetch(buildPreparationCorrectionReviewPath(correctionId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewNote }),
  });
  return parseJsonOrThrow(response, "บันทึกผล Review ไม่สำเร็จ");
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

export interface ListAssignmentCandidatesParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listAssignmentCandidates(
  authFetch: AuthFetch,
  params: ListAssignmentCandidatesParams = {},
): Promise<ListAssignmentCandidatesResponseBody> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  const response = await authFetch(`${ASSIGNMENT_CANDIDATES_PATH}?${query.toString()}`);
  return parseJsonOrThrow(response, "โหลดรายชื่อพนักงานจัดส่งไม่สำเร็จ");
}

export async function getCurrentAssignment(authFetch: AuthFetch, taskId: string): Promise<CurrentAssignmentResponseBody> {
  const response = await authFetch(buildTaskAssignmentPath(taskId));
  return parseJsonOrThrow(response, "โหลดข้อมูลการมอบหมายไม่สำเร็จ");
}

export async function getAssignmentHistory(authFetch: AuthFetch, taskId: string): Promise<AssignmentHistoryResponseBody> {
  const response = await authFetch(buildTaskAssignmentHistoryPath(taskId));
  return parseJsonOrThrow(response, "โหลดประวัติการมอบหมายไม่สำเร็จ");
}

export async function assignTask(
  authFetch: AuthFetch,
  taskId: string,
  body: AssignTaskRequestBody,
): Promise<CurrentAssignmentResponseBody> {
  const response = await authFetch(buildTaskAssignmentPath(taskId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseAssignmentResponse(response, "มอบหมายงานไม่สำเร็จ");
}

export async function reassignTask(
  authFetch: AuthFetch,
  taskId: string,
  body: ReassignTaskRequestBody,
): Promise<CurrentAssignmentResponseBody> {
  const response = await authFetch(buildTaskAssignmentPath(taskId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseAssignmentResponse(response, "มอบหมายใหม่ไม่สำเร็จ");
}
