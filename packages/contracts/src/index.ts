/**
 * Foundation-level API contracts shared between apps/api, apps/admin-web,
 * and apps/mobile-pwa.
 *
 * DEV-FOUNDATION-001 only introduces the health-check contract. Business
 * Command/Query contracts (CreateDeliveryTask, AssignDeliveryTask, ...) are
 * out of scope — see Dispatch Knowledge Topic 11 §17 for the future
 * command boundary this package will eventually expose.
 */

import type { HealthResponse, ReadinessResponse } from "@dispatch/shared-types";

export const HEALTH_ENDPOINT_PATH = "/health" as const;
export const HEALTH_LIVE_ENDPOINT_PATH = "/health/live" as const;
export const HEALTH_READY_ENDPOINT_PATH = "/health/ready" as const;

export function buildHealthUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}${HEALTH_ENDPOINT_PATH}`;
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value as { status: unknown }).status === "ok" &&
    "service" in value &&
    typeof (value as { service: unknown }).service === "string"
  );
}

/**
 * DEV-FOUNDATION-002: GET /health mirrors GET /health/ready — both return
 * the database-aware readiness payload. GET /health/live stays DB-free and
 * matches `isHealthResponse` only (no `database` field).
 */
export function isReadinessResponse(value: unknown): value is ReadinessResponse {
  return (
    isHealthResponse(value) &&
    "database" in value &&
    (value as { database: unknown }).database === "ok"
  );
}

export type { HealthResponse, ReadinessResponse } from "@dispatch/shared-types";

/**
 * Authentication API contract (AUTH-001). Shapes only — no client
 * implementation. `refreshToken` deliberately never appears here: it is
 * carried only by an HttpOnly cookie, never in a JSON body (see
 * CLAUDE.md AUTH-001 boundary).
 */
import type { DispatchRoleCode } from "@dispatch/shared-types";

export const AUTH_LOGIN_PATH = "/auth/login" as const;
export const AUTH_REFRESH_PATH = "/auth/refresh" as const;
export const AUTH_LOGOUT_PATH = "/auth/logout" as const;
export const AUTH_LOGOUT_ALL_PATH = "/auth/logout-all" as const;
export const AUTH_ME_PATH = "/auth/me" as const;

export interface AuthPrincipal {
  userId: string;
  displayName: string;
  roleCodes: DispatchRoleCode[];
}

export interface LoginRequestBody {
  loginId: string;
  password: string;
}

export interface AccessTokenResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface LoginResponseBody extends AccessTokenResponse {
  principal: AuthPrincipal;
}

export function buildAuthUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}${path}`;
}

/**
 * Customer/Destination Master search and Delivery Task creation contracts
 * (MVP-02). Shapes only — DTO validation lives in `apps/api`. Decimal
 * quantities are carried as strings end-to-end (JSON has no fixed-point
 * decimal type) so the client, server, and tests all agree on precision.
 */
import type {
  DeliveryTaskStatus,
  DestinationSource,
  FreeTextFallbackReason,
} from "@dispatch/shared-types";

export const CUSTOMER_MASTER_SEARCH_PATH = "/customer-master/search" as const;
export const DELIVERY_TASKS_PATH = "/tasks" as const;

export function buildDeliveryTaskPath(taskId: string): string {
  return `${DELIVERY_TASKS_PATH}/${taskId}`;
}

export function buildDeliveryTaskSubmitPath(taskId: string): string {
  return `${DELIVERY_TASKS_PATH}/${taskId}/submit`;
}

export interface CustomerMasterSearchRequestBody {
  query: string;
}

export interface CustomerMasterSearchResultDto {
  customerId: string;
  customerCode: string | null;
  customerName: string;
  customerDestinationId: string;
  destinationCode: string | null;
  destinationName: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  deliveryInstructions: string | null;
  locationReference: string | null;
  accessNotes: string | null;
}

export interface CustomerMasterSearchResponseBody {
  searchId: string;
  results: CustomerMasterSearchResultDto[];
  expiresAt: string;
}

export interface DeliveryTaskItemDto {
  lineNumber: number;
  description: string;
  /** Decimal serialized as a string (e.g. "10.500") — never a JS number. */
  plannedQuantity: string;
  unit: string;
  notes: string | null;
}

export interface TaskReferenceDto {
  referenceType: string;
  referenceValue: string;
}

/**
 * Destination-selection fields shared by create and PATCH. `searchId` is
 * always required (§4.3 — search-first applies to both MASTER and
 * FREE_TEXT). Master-source snapshot fields supplied by the client are
 * advisory only — the server always loads canonical values from the
 * database and ignores conflicting client input for MASTER selections.
 */
export interface DestinationSelectionRequestBody {
  searchId: string;
  destinationSource: DestinationSource;
  customerId?: string | null;
  customerDestinationId?: string | null;
  freeTextFallbackReason?: FreeTextFallbackReason | null;
  customerName?: string;
  destinationName?: string;
  address?: string;
  contactName?: string | null;
  contactPhone?: string | null;
  deliveryInstructions?: string | null;
  locationReference?: string | null;
  accessNotes?: string | null;
}

export interface CreateDeliveryTaskRequestBody extends DestinationSelectionRequestBody {
  plannedDeliveryDate?: string | null;
  items?: DeliveryTaskItemDto[];
  references?: TaskReferenceDto[];
}

/** All fields optional — PATCH only touches fields explicitly present in the body (no mass assignment). */
export interface UpdateDeliveryTaskDraftRequestBody {
  searchId?: string;
  destinationSource?: DestinationSource;
  customerId?: string | null;
  customerDestinationId?: string | null;
  freeTextFallbackReason?: FreeTextFallbackReason | null;
  customerName?: string;
  destinationName?: string;
  address?: string;
  contactName?: string | null;
  contactPhone?: string | null;
  deliveryInstructions?: string | null;
  locationReference?: string | null;
  accessNotes?: string | null;
  plannedDeliveryDate?: string | null;
  items?: DeliveryTaskItemDto[];
  references?: TaskReferenceDto[];
}

export interface DeliveryTaskEventDto {
  eventType: string;
  previousStatus: DeliveryTaskStatus | null;
  newStatus: DeliveryTaskStatus;
  actorUserId: string;
  occurredAt: string;
}

export interface DeliveryTaskSummaryDto {
  id: string;
  taskNumber: string;
  status: DeliveryTaskStatus;
  plannedDeliveryDate: string | null;
  destinationSource: DestinationSource;
  destinationName: string;
  customerName: string;
  createdByUserId: string;
  createdAt: string;
}

export interface DeliveryTaskDetailDto extends DeliveryTaskSummaryDto {
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  deliveryInstructions: string | null;
  locationReference: string | null;
  accessNotes: string | null;
  customerId: string | null;
  customerDestinationId: string | null;
  customerCodeSnapshot: string | null;
  destinationCodeSnapshot: string | null;
  freeTextFallbackReason: FreeTextFallbackReason | null;
  submittedAt: string | null;
  updatedByUserId: string;
  items: DeliveryTaskItemDto[];
  references: TaskReferenceDto[];
  events: DeliveryTaskEventDto[];
}

export interface ListDeliveryTasksResponseBody {
  items: DeliveryTaskSummaryDto[];
  page: number;
  pageSize: number;
  total: number;
}

export type { DeliveryTaskStatus, DestinationSource, FreeTextFallbackReason } from "@dispatch/shared-types";
