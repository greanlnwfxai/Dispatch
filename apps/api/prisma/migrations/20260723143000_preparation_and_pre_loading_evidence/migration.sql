-- MVP-03 — Preparation and Pre-loading Evidence.
-- Additive only: no table/column drops, no data deletion, no enum rewrites.

CREATE TYPE "preparation_issue_status" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "preparation_evidence_category" AS ENUM ('PRE_LOADING_PHOTO');
CREATE TYPE "preparation_correction_materiality" AS ENUM ('NORMAL', 'MATERIAL');
CREATE TYPE "preparation_correction_review_status" AS ENUM ('PENDING_REVIEW', 'REVIEWED');

CREATE TABLE "preparation_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "task_id" UUID NOT NULL,
  "started_by_user_id" UUID NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ready_confirmed_by_user_id" UUID,
  "ready_confirmed_at" TIMESTAMPTZ(6),
  "notes" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "preparation_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "preparation_records_ready_consistency_check"
    CHECK (("ready_confirmed_by_user_id" IS NULL AND "ready_confirmed_at" IS NULL)
       OR ("ready_confirmed_by_user_id" IS NOT NULL AND "ready_confirmed_at" IS NOT NULL))
);

CREATE TABLE "preparation_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "preparation_id" UUID NOT NULL,
  "task_item_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "description_snapshot" VARCHAR(500) NOT NULL,
  "planned_quantity_snapshot" DECIMAL(18,3) NOT NULL,
  "prepared_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "unit_snapshot" VARCHAR(32) NOT NULL,
  "notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "preparation_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "preparation_items_quantity_check"
    CHECK ("planned_quantity_snapshot" > 0 AND "prepared_quantity" >= 0),
  CONSTRAINT "preparation_items_snapshot_text_check"
    CHECK (length(btrim("description_snapshot")) > 0 AND length(btrim("unit_snapshot")) > 0),
  CONSTRAINT "preparation_items_line_number_check" CHECK ("line_number" > 0)
);

CREATE TABLE "preparation_issues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "preparation_id" UUID NOT NULL,
  "preparation_item_id" UUID,
  "description" VARCHAR(1000) NOT NULL,
  "status" "preparation_issue_status" NOT NULL DEFAULT 'OPEN',
  "reported_by_user_id" UUID NOT NULL,
  "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolution_note" VARCHAR(1000),
  "resolved_by_user_id" UUID,
  "resolved_at" TIMESTAMPTZ(6),
  CONSTRAINT "preparation_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "preparation_issues_description_check" CHECK (length(btrim("description")) > 0),
  CONSTRAINT "preparation_issues_resolution_consistency_check"
    CHECK (
      ("status" = 'OPEN' AND "resolution_note" IS NULL AND "resolved_by_user_id" IS NULL AND "resolved_at" IS NULL)
      OR
      ("status" = 'RESOLVED' AND length(btrim(coalesce("resolution_note", ''))) > 0 AND "resolved_by_user_id" IS NOT NULL AND "resolved_at" IS NOT NULL)
    )
);

CREATE TABLE "preparation_evidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "preparation_id" UUID NOT NULL,
  "category" "preparation_evidence_category" NOT NULL,
  "object_key" VARCHAR(160) NOT NULL,
  "original_filename" VARCHAR(255) NOT NULL,
  "media_type" VARCHAR(64) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "uploaded_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "preparation_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "preparation_evidence_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 5242880),
  CONSTRAINT "preparation_evidence_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "preparation_evidence_object_key_check"
    CHECK ("object_key" ~ '^preparation/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|png|webp)$'),
  CONSTRAINT "preparation_evidence_filename_check" CHECK (length(btrim("original_filename")) > 0),
  CONSTRAINT "preparation_evidence_media_type_check"
    CHECK ("media_type" IN ('image/jpeg', 'image/png', 'image/webp'))
);

CREATE TABLE "preparation_discrepancy_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "task_id" UUID NOT NULL,
  "preparation_id" UUID NOT NULL,
  "reported_by_user_id" UUID NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "linked_correction_id" UUID,
  CONSTRAINT "preparation_discrepancy_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "preparation_discrepancy_reports_description_check" CHECK (length(btrim("description")) > 0)
);

CREATE TABLE "preparation_correction_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "task_id" UUID NOT NULL,
  "preparation_id" UUID NOT NULL,
  "discrepancy_report_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "materiality" "preparation_correction_materiality" NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "change_summary" VARCHAR(1000) NOT NULL,
  "original_preparation_snapshot" JSONB NOT NULL,
  "corrected_or_exception_snapshot" JSONB NOT NULL,
  "review_status" "preparation_correction_review_status" NOT NULL DEFAULT 'PENDING_REVIEW',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMPTZ(6),
  "review_note" VARCHAR(1000),
  CONSTRAINT "preparation_correction_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "preparation_correction_records_reason_check" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "preparation_correction_records_change_summary_check" CHECK (length(btrim("change_summary")) > 0),
  CONSTRAINT "preparation_correction_records_review_consistency_check"
    CHECK (
      ("review_status" = 'PENDING_REVIEW' AND "reviewed_by_user_id" IS NULL AND "reviewed_at" IS NULL AND "review_note" IS NULL)
      OR
      ("review_status" = 'REVIEWED' AND "reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL AND length(btrim(coalesce("review_note", ''))) > 0)
    )
);

CREATE UNIQUE INDEX "preparation_records_task_id_key" ON "preparation_records"("task_id");
CREATE INDEX "preparation_records_started_by_user_id_idx" ON "preparation_records"("started_by_user_id");
CREATE INDEX "preparation_records_ready_confirmed_by_user_id_idx" ON "preparation_records"("ready_confirmed_by_user_id");

CREATE UNIQUE INDEX "preparation_items_preparation_id_task_item_id_key" ON "preparation_items"("preparation_id", "task_item_id");
CREATE UNIQUE INDEX "preparation_items_preparation_id_line_number_key" ON "preparation_items"("preparation_id", "line_number");
CREATE INDEX "preparation_items_task_item_id_idx" ON "preparation_items"("task_item_id");

CREATE INDEX "preparation_issues_preparation_id_status_idx" ON "preparation_issues"("preparation_id", "status");
CREATE INDEX "preparation_issues_preparation_item_id_idx" ON "preparation_issues"("preparation_item_id");
CREATE INDEX "preparation_issues_reported_by_user_id_idx" ON "preparation_issues"("reported_by_user_id");
CREATE INDEX "preparation_issues_resolved_by_user_id_idx" ON "preparation_issues"("resolved_by_user_id");

CREATE UNIQUE INDEX "preparation_evidence_object_key_key" ON "preparation_evidence"("object_key");
CREATE INDEX "preparation_evidence_preparation_id_category_idx" ON "preparation_evidence"("preparation_id", "category");
CREATE INDEX "preparation_evidence_uploaded_by_user_id_idx" ON "preparation_evidence"("uploaded_by_user_id");

CREATE UNIQUE INDEX "preparation_discrepancy_reports_linked_correction_id_key" ON "preparation_discrepancy_reports"("linked_correction_id");
CREATE INDEX "preparation_discrepancy_reports_task_id_idx" ON "preparation_discrepancy_reports"("task_id");
CREATE INDEX "preparation_discrepancy_reports_preparation_id_idx" ON "preparation_discrepancy_reports"("preparation_id");
CREATE INDEX "preparation_discrepancy_reports_reported_by_user_id_idx" ON "preparation_discrepancy_reports"("reported_by_user_id");

CREATE INDEX "preparation_correction_records_task_id_idx" ON "preparation_correction_records"("task_id");
CREATE INDEX "preparation_correction_records_preparation_id_idx" ON "preparation_correction_records"("preparation_id");
CREATE INDEX "preparation_correction_records_discrepancy_report_id_idx" ON "preparation_correction_records"("discrepancy_report_id");
CREATE INDEX "preparation_correction_records_review_status_materiality_created_at_idx"
  ON "preparation_correction_records"("review_status", "materiality", "created_at");
CREATE INDEX "preparation_correction_records_created_by_user_id_idx" ON "preparation_correction_records"("created_by_user_id");
CREATE INDEX "preparation_correction_records_reviewed_by_user_id_idx" ON "preparation_correction_records"("reviewed_by_user_id");

ALTER TABLE "preparation_records"
  ADD CONSTRAINT "preparation_records_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "delivery_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_records_started_by_user_id_fkey"
  FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_records_ready_confirmed_by_user_id_fkey"
  FOREIGN KEY ("ready_confirmed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preparation_items"
  ADD CONSTRAINT "preparation_items_preparation_id_fkey"
  FOREIGN KEY ("preparation_id") REFERENCES "preparation_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_items_task_item_id_fkey"
  FOREIGN KEY ("task_item_id") REFERENCES "delivery_task_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preparation_issues"
  ADD CONSTRAINT "preparation_issues_preparation_id_fkey"
  FOREIGN KEY ("preparation_id") REFERENCES "preparation_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_issues_preparation_item_id_fkey"
  FOREIGN KEY ("preparation_item_id") REFERENCES "preparation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_issues_reported_by_user_id_fkey"
  FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_issues_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preparation_evidence"
  ADD CONSTRAINT "preparation_evidence_preparation_id_fkey"
  FOREIGN KEY ("preparation_id") REFERENCES "preparation_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_evidence_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preparation_discrepancy_reports"
  ADD CONSTRAINT "preparation_discrepancy_reports_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "delivery_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_discrepancy_reports_preparation_id_fkey"
  FOREIGN KEY ("preparation_id") REFERENCES "preparation_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_discrepancy_reports_reported_by_user_id_fkey"
  FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preparation_correction_records"
  ADD CONSTRAINT "preparation_correction_records_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "delivery_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_correction_records_preparation_id_fkey"
  FOREIGN KEY ("preparation_id") REFERENCES "preparation_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_correction_records_discrepancy_report_id_fkey"
  FOREIGN KEY ("discrepancy_report_id") REFERENCES "preparation_discrepancy_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_correction_records_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "preparation_correction_records_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "preparation_discrepancy_reports"
  ADD CONSTRAINT "preparation_discrepancy_reports_linked_correction_id_fkey"
  FOREIGN KEY ("linked_correction_id") REFERENCES "preparation_correction_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
