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

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MVP-02 — Customer and Task Creation
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Framework/ORM-independent record shapes, repository ports, and pure
 * business-validation functions for read-only Customer/Destination Master
 * search and DRAFT Delivery Task creation/editing/submission.
 *
 * Traceability: BDR-CUSTOMER-001 (Option C, approved), BDR-CUSTOMER-002
 * (Option B, approved), BR-TASK-003 through BR-TASK-010, BR-DATA-003,
 * VR-TASK-001a (Dispatch Knowledge Topic 06 §11).
 *
 * BDR-CUSTOMER-003 (exact frozen-snapshot field set beyond the approved
 * minimum of destination name + address + Destination Source) and
 * BDR-TASK-001 (mandatory business reference-number set) remain OPEN
 * business decisions — see docs/CTO_SUMMARY_MVP_02.md. This module
 * implements only a technical resolution constrained by the already
 * approved rules, and a flexible, non-mandatory TaskReference model; it
 * does not resolve either BDR.
 */

/** Read-only Customer Master record — no create/edit/delete in MVP-02. */
export interface CustomerRecord {
  id: string;
  code: string | null;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Read-only Customer Destination Master record — no create/edit/delete in MVP-02. */
export interface CustomerDestinationRecord {
  id: string;
  customerId: string;
  code: string | null;
  destinationName: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  deliveryInstructions: string | null;
  locationReference: string | null;
  accessNotes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** A joined, active Customer + Customer Destination row as returned by search. */
export interface CustomerMasterSearchMatch {
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

export interface SearchCustomerMasterInput {
  normalizedQuery: string;
  limit: number;
}

/** Read-only Customer/Destination Master search (BDR-CUSTOMER-001/002). No CRUD. */
export interface CustomerMasterRepository {
  search(input: SearchCustomerMasterInput): Promise<CustomerMasterSearchMatch[]>;
  /** Active-only lookup, used to re-verify a MASTER selection server-side. */
  findActiveDestinationById(customerDestinationId: string): Promise<CustomerMasterSearchMatch | null>;
}

/**
 * Server-verifiable evidence that a Customer Master search was performed
 * (§4.3) — required before a destination (MASTER or FREE_TEXT) may be
 * attached to a Task. Short-lived by design (`expiresAt`); never stores
 * secrets, tokens, or cookie values.
 */
export interface CustomerMasterSearchRecord {
  id: string;
  searchedByUserId: string;
  normalizedQuery: string;
  matchedCustomerDestinationIds: string[];
  resultCount: number;
  searchedAt: Date;
  expiresAt: Date;
}

export interface CreateCustomerMasterSearchInput {
  searchedByUserId: string;
  normalizedQuery: string;
  matchedCustomerDestinationIds: string[];
  resultCount: number;
  expiresAt: Date;
}

export interface CustomerMasterSearchRepository {
  create(input: CreateCustomerMasterSearchInput): Promise<CustomerMasterSearchRecord>;
  findById(id: string): Promise<CustomerMasterSearchRecord | null>;
}

/** Planned goods line on a Delivery Task (planned only — no stock deduction). */
export interface DeliveryTaskItemRecord {
  id: string;
  taskId: string;
  lineNumber: number;
  description: string;
  /** Decimal serialized as a string to avoid float precision loss crossing the Prisma boundary. */
  plannedQuantity: string;
  unit: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryTaskItemInput {
  lineNumber: number;
  description: string;
  plannedQuantity: string;
  unit: string;
  notes: string | null;
}

/**
 * Optional, flexible business-reference child record (BDR-TASK-001 —
 * OPEN). No reference type is mandatory in this milestone; this shape only
 * lets a future, Product-Owner-approved policy make specific types
 * mandatory without a Task identity/schema rewrite.
 */
export interface TaskReferenceRecord {
  id: string;
  taskId: string;
  referenceType: string;
  referenceValue: string;
  createdAt: Date;
}

export interface TaskReferenceInput {
  referenceType: string;
  referenceValue: string;
}

/** Append-only Task status-history entry — never updated or deleted. */
export interface TaskEventRecord {
  id: string;
  taskId: string;
  eventType: string;
  previousStatus: string | null;
  newStatus: string;
  actorUserId: string;
  occurredAt: Date;
  metadata: Record<string, unknown> | null;
}

/**
 * Delivery Task aggregate — DRAFT/WAITING_PREPARATION only reachable in
 * MVP-02 (see `DELIVERY_TASK_STATUS_CODES` for the full conceptual
 * lifecycle). Snapshot columns (`customerName` through
 * `destinationCodeSnapshot`) are the Historical Destination Snapshot
 * (BR-TASK-009/BR-DATA-003) — immutable once the Task leaves DRAFT, since
 * no endpoint accepts writes to a non-DRAFT Task.
 */
export interface DeliveryTaskRecord {
  id: string;
  taskNumber: string;
  status: string;
  plannedDeliveryDate: Date | null;
  createdByUserId: string;
  updatedByUserId: string;
  submittedAt: Date | null;
  destinationSource: string;
  customerId: string | null;
  customerDestinationId: string | null;
  customerSearchId: string;
  freeTextFallbackReason: string | null;
  customerName: string;
  destinationName: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  deliveryInstructions: string | null;
  locationReference: string | null;
  accessNotes: string | null;
  customerCodeSnapshot: string | null;
  destinationCodeSnapshot: string | null;
  snapshotCreatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryTaskDetailRecord extends DeliveryTaskRecord {
  items: DeliveryTaskItemRecord[];
  references: TaskReferenceRecord[];
  events: TaskEventRecord[];
}

export interface DestinationSelectionInput {
  destinationSource: string;
  customerId: string | null;
  customerDestinationId: string | null;
  customerSearchId: string;
  freeTextFallbackReason: string | null;
  customerName: string;
  destinationName: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  deliveryInstructions: string | null;
  locationReference: string | null;
  accessNotes: string | null;
  customerCodeSnapshot: string | null;
  destinationCodeSnapshot: string | null;
}

export interface CreateDeliveryTaskInput extends DestinationSelectionInput {
  createdByUserId: string;
  plannedDeliveryDate: Date | null;
  items: DeliveryTaskItemInput[];
  references: TaskReferenceInput[];
}

export interface UpdateDeliveryTaskDraftInput {
  taskId: string;
  updatedByUserId: string;
  plannedDeliveryDate?: Date | null;
  destination?: DestinationSelectionInput;
  items?: DeliveryTaskItemInput[];
  references?: TaskReferenceInput[];
}

export interface ListDeliveryTasksFilter {
  status?: string;
  taskNumber?: string;
  plannedDeliveryDateFrom?: Date;
  plannedDeliveryDateTo?: Date;
  page: number;
  pageSize: number;
}

export interface ListDeliveryTasksResult {
  items: DeliveryTaskRecord[];
  total: number;
}

export type SubmitDeliveryTaskFailureReason =
  | "NOT_FOUND"
  | "NOT_DRAFT"
  | "SEARCH_EVIDENCE_INVALID"
  | "INCOMPLETE";

export interface SubmitDeliveryTaskResult {
  ok: boolean;
  task?: DeliveryTaskDetailRecord;
  failureReason?: SubmitDeliveryTaskFailureReason;
  validationErrors?: DeliveryTaskValidationError[];
}

/**
 * Delivery Task persistence boundary. The Prisma adapter is responsible for
 * atomicity: `createDraft` persists the Task + items + references in one
 * transaction; `submit` re-reads the Task, items, and Customer Master
 * search evidence inside a transaction, runs `validateSubmitSearchEvidence`
 * (ownership/expiry/chronology/MASTER-coverage, re-read at submit time —
 * not just at create/PATCH) followed by `validateDeliveryTaskSubmission`
 * against the re-read data, and only transitions status + appends a
 * TaskEvent when both pass — no partial mutation occurs on a failed
 * submission (BR-TASK-008).
 */
export interface DeliveryTaskRepository {
  createDraft(input: CreateDeliveryTaskInput, taskNumber: string): Promise<DeliveryTaskDetailRecord>;
  findById(id: string): Promise<DeliveryTaskDetailRecord | null>;
  list(filter: ListDeliveryTasksFilter): Promise<ListDeliveryTasksResult>;
  /** DRAFT-only. Rejects (returns null) if the Task is not currently DRAFT. */
  updateDraft(input: UpdateDeliveryTaskDraftInput): Promise<DeliveryTaskDetailRecord | null>;
  submit(input: { taskId: string; actorUserId: string }): Promise<SubmitDeliveryTaskResult>;
}

/** Generates the next collision-safe, human-readable Task number (technical detail — no format is mandated by Dispatch Knowledge). */
export interface TaskNumberGenerator {
  next(): Promise<string>;
}

// ── Pure business validation (framework-independent) ──────────────────────

export interface DeliveryTaskValidationError {
  code: string;
  message: string;
}

const MAX_REFERENCE_VALUE_LENGTH = 128;
const MAX_REFERENCE_TYPE_LENGTH = 64;

/**
 * VR-TASK-001a — gate fired `BEFORE_PREPARATION`, checked against data
 * re-read inside the submit transaction. Referenced rules: BR-TASK-003
 * (destination name/address/source mandatory), BR-TASK-004 (planned
 * delivery date), BR-TASK-008 (must not enter WAITING_PREPARATION with
 * incomplete core data), BR-TASK-009/BR-DATA-003 (snapshot minimum).
 */
export interface DeliveryTaskSubmissionSnapshot {
  status: string;
  plannedDeliveryDate: Date | null;
  destinationSource: string | null;
  destinationName: string | null;
  address: string | null;
  customerSearchId: string | null;
  freeTextFallbackReason: string | null;
  items: Array<{ plannedQuantity: string; unit: string; description: string }>;
}

export function validateDeliveryTaskSubmission(
  snapshot: DeliveryTaskSubmissionSnapshot,
): DeliveryTaskValidationError[] {
  const errors: DeliveryTaskValidationError[] = [];

  if (!snapshot.plannedDeliveryDate) {
    errors.push({ code: "PLANNED_DELIVERY_DATE_REQUIRED", message: "Planned delivery date is required." });
  }
  if (!snapshot.destinationSource) {
    errors.push({ code: "DESTINATION_SOURCE_REQUIRED", message: "Destination source (MASTER or FREE_TEXT) is required." });
  }
  if (!snapshot.destinationName || snapshot.destinationName.trim().length === 0) {
    errors.push({ code: "DESTINATION_NAME_REQUIRED", message: "Destination name is required." });
  }
  if (!snapshot.address || snapshot.address.trim().length === 0) {
    errors.push({ code: "DESTINATION_ADDRESS_REQUIRED", message: "Destination address is required." });
  }
  if (!snapshot.customerSearchId) {
    errors.push({
      code: "CUSTOMER_MASTER_SEARCH_REQUIRED",
      message: "A Customer Master search must be performed before submission.",
    });
  }
  if (snapshot.destinationSource === "FREE_TEXT" && !snapshot.freeTextFallbackReason) {
    errors.push({
      code: "FREE_TEXT_FALLBACK_REASON_REQUIRED",
      message: "A fallback reason is required when the destination source is FREE_TEXT.",
    });
  }
  if (snapshot.items.length === 0) {
    errors.push({ code: "AT_LEAST_ONE_ITEM_REQUIRED", message: "At least one planned goods line is required." });
  }
  snapshot.items.forEach((item, index) => {
    if (!(Number(item.plannedQuantity) > 0)) {
      errors.push({
        code: "ITEM_QUANTITY_MUST_BE_POSITIVE",
        message: `Planned quantity for item ${index + 1} must be greater than zero.`,
      });
    }
    if (!item.unit || item.unit.trim().length === 0) {
      errors.push({ code: "ITEM_UNIT_REQUIRED", message: `Unit is required for item ${index + 1}.` });
    }
    if (!item.description || item.description.trim().length === 0) {
      errors.push({ code: "ITEM_DESCRIPTION_REQUIRED", message: `Description is required for item ${index + 1}.` });
    }
  });

  return errors;
}

/**
 * Submit-time re-read of the Customer Master search evidence a Task's
 * destination selection depends on (`customerSearchId`) — a second copy of
 * the same shape as `CustomerMasterSearchRecord`, kept separate so this
 * module never has to import the full record shape just to validate it.
 */
export interface SubmitSearchEvidenceRecord {
  searchedByUserId: string;
  searchedAt: Date;
  expiresAt: Date;
  matchedCustomerDestinationIds: string[];
}

export interface SubmitSearchEvidenceSnapshot {
  now: Date;
  actorUserId: string;
  destinationSource: string | null;
  customerDestinationId: string | null;
  /** `null` when no `CustomerMasterSearch` row was found for the Task's `customerSearchId`. */
  search: SubmitSearchEvidenceRecord | null;
  /**
   * MASTER only — whether a fresh re-read of `customerDestinationId` still
   * resolves to an active Customer + Customer Destination. Never used to
   * overwrite the Task's already-stored Historical Destination Snapshot —
   * existence-only, so a Master edit after DRAFT creation can never
   * silently change a previously frozen snapshot (BR-TASK-009/BR-DATA-003).
   */
  activeMasterDestinationFound: boolean;
}

const SEARCH_EVIDENCE_INVALID_ERROR: DeliveryTaskValidationError = {
  code: "SEARCH_EVIDENCE_INVALID",
  message: "Customer Master search evidence is missing, expired, or invalid.",
};

/**
 * Blocking-review-finding fix (see docs/CTO_SUMMARY_MVP_02.md "Issues Found
 * and Fixed"): a DRAFT Task must not transition to WAITING_PREPARATION
 * unless the Customer Master search evidence behind its destination
 * selection is re-validated against data re-read at submission time, not
 * only at the original create/PATCH selection boundary (§4.3
 * search-first). Every failure path returns the identical generic error so
 * the response never discloses *why* the evidence was rejected (missing,
 * foreign, expired, or out-of-order) — the same anti-disclosure property
 * `TasksService.resolveDestinationSelection` already applies at create/PATCH
 * time.
 */
export function validateSubmitSearchEvidence(
  input: SubmitSearchEvidenceSnapshot,
): DeliveryTaskValidationError[] {
  const { search } = input;

  const evidenceInvalid =
    !search ||
    search.searchedByUserId !== input.actorUserId ||
    search.expiresAt <= input.now ||
    search.searchedAt > input.now;

  if (evidenceInvalid) {
    return [SEARCH_EVIDENCE_INVALID_ERROR];
  }

  if (input.destinationSource === "MASTER") {
    const covered =
      !!input.customerDestinationId &&
      search.matchedCustomerDestinationIds.includes(input.customerDestinationId) &&
      input.activeMasterDestinationFound;
    if (!covered) {
      return [SEARCH_EVIDENCE_INVALID_ERROR];
    }
  }

  return [];
}

/** Rejects a destination selection that mixes MASTER/FREE_TEXT fields inconsistently, independent of DB state. */
export function validateDestinationSelection(input: DestinationSelectionInput): DeliveryTaskValidationError[] {
  const errors: DeliveryTaskValidationError[] = [];

  if (input.destinationSource === "MASTER") {
    if (!input.customerId || !input.customerDestinationId) {
      errors.push({
        code: "MASTER_SELECTION_REQUIRED",
        message: "A Customer and Customer Destination must be selected when destinationSource is MASTER.",
      });
    }
    if (input.freeTextFallbackReason) {
      errors.push({
        code: "MASTER_MUST_NOT_HAVE_FALLBACK_REASON",
        message: "A fallback reason must not be set when destinationSource is MASTER.",
      });
    }
  } else if (input.destinationSource === "FREE_TEXT") {
    if (input.customerId || input.customerDestinationId) {
      errors.push({
        code: "FREE_TEXT_MUST_NOT_REFERENCE_MASTER",
        message: "Free-text destinations must never create or link a Customer Master record.",
      });
    }
    if (!input.freeTextFallbackReason) {
      errors.push({
        code: "FREE_TEXT_FALLBACK_REASON_REQUIRED",
        message: "A fallback reason is required when destinationSource is FREE_TEXT.",
      });
    }
    if (!input.destinationName || input.destinationName.trim().length === 0) {
      errors.push({ code: "DESTINATION_NAME_REQUIRED", message: "Destination name is required for FREE_TEXT." });
    }
    if (!input.address || input.address.trim().length === 0) {
      errors.push({ code: "DESTINATION_ADDRESS_REQUIRED", message: "Destination address is required for FREE_TEXT." });
    }
  } else {
    errors.push({ code: "DESTINATION_SOURCE_INVALID", message: "destinationSource must be MASTER or FREE_TEXT." });
  }

  return errors;
}

/** Format/positivity checks only — completeness (≥1 line) is gated at submission, not on every DRAFT edit. */
export function validateGoodsLineInput(item: DeliveryTaskItemInput): DeliveryTaskValidationError[] {
  const errors: DeliveryTaskValidationError[] = [];
  if (!(Number(item.plannedQuantity) > 0)) {
    errors.push({ code: "ITEM_QUANTITY_MUST_BE_POSITIVE", message: "Planned quantity must be greater than zero." });
  }
  if (!item.unit || item.unit.trim().length === 0) {
    errors.push({ code: "ITEM_UNIT_REQUIRED", message: "Unit is required." });
  }
  if (!item.description || item.description.trim().length === 0) {
    errors.push({ code: "ITEM_DESCRIPTION_REQUIRED", message: "Description is required." });
  }
  return errors;
}

/** BDR-TASK-001 stays open — this only rejects duplicate type/value pairs on the same Task, never a mandatory set. */
export function findDuplicateTaskReferences(references: TaskReferenceInput[]): TaskReferenceInput[] {
  const seen = new Set<string>();
  const duplicates: TaskReferenceInput[] = [];
  for (const reference of references) {
    const key = `${reference.referenceType}::${reference.referenceValue}`;
    if (seen.has(key)) {
      duplicates.push(reference);
    }
    seen.add(key);
  }
  return duplicates;
}

export function validateTaskReferenceInput(reference: TaskReferenceInput): DeliveryTaskValidationError[] {
  const errors: DeliveryTaskValidationError[] = [];
  const type = reference.referenceType.trim();
  const value = reference.referenceValue.trim();
  if (type.length === 0 || type.length > MAX_REFERENCE_TYPE_LENGTH) {
    errors.push({ code: "REFERENCE_TYPE_INVALID", message: "referenceType must be 1-64 characters." });
  }
  if (value.length === 0 || value.length > MAX_REFERENCE_VALUE_LENGTH) {
    errors.push({ code: "REFERENCE_VALUE_INVALID", message: "referenceValue must be 1-128 characters." });
  }
  return errors;
}

/** Formats a Postgres sequence value into the human-readable Task number — a technical detail, not a business rule. */
export function formatDeliveryTaskNumber(sequenceValue: bigint | number): string {
  const numeric = typeof sequenceValue === "bigint" ? sequenceValue : BigInt(Math.trunc(sequenceValue));
  if (numeric <= 0n) {
    throw new Error("formatDeliveryTaskNumber: sequence value must be positive");
  }
  return `DSP-${numeric.toString().padStart(8, "0")}`;
}
