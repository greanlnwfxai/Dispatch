-- MVP-04 — Delivery Task Assignment.
-- Additive only: no table/column drops, no data deletion, no enum rewrites.

CREATE TYPE "assignment_type" AS ENUM ('INITIAL', 'REASSIGNMENT');

CREATE TABLE "task_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "task_id" UUID NOT NULL,
  "assignment_type" "assignment_type" NOT NULL,
  "previous_assignment_id" UUID,
  "primary_assignee_user_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "note" VARCHAR(1000),
  "reason" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_assignments_type_consistency_check"
    CHECK (
      ("assignment_type" = 'INITIAL' AND "previous_assignment_id" IS NULL AND "reason" IS NULL)
      OR
      ("assignment_type" = 'REASSIGNMENT' AND "previous_assignment_id" IS NOT NULL
        AND "reason" IS NOT NULL AND length(btrim("reason")) > 0)
    )
);

CREATE TABLE "task_assignment_supports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" UUID NOT NULL,
  "support_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_assignment_supports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_current_assignments" (
  "task_id" UUID NOT NULL,
  "current_assignment_id" UUID NOT NULL,
  "primary_assignee_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "task_current_assignments_pkey" PRIMARY KEY ("task_id")
);

CREATE UNIQUE INDEX "task_assignments_previous_assignment_id_key" ON "task_assignments"("previous_assignment_id");
CREATE INDEX "task_assignments_task_id_idx" ON "task_assignments"("task_id");
CREATE INDEX "task_assignments_primary_assignee_user_id_idx" ON "task_assignments"("primary_assignee_user_id");
CREATE INDEX "task_assignments_actor_user_id_idx" ON "task_assignments"("actor_user_id");

CREATE UNIQUE INDEX "task_assignment_supports_assignment_id_support_user_id_key" ON "task_assignment_supports"("assignment_id", "support_user_id");
CREATE INDEX "task_assignment_supports_assignment_id_idx" ON "task_assignment_supports"("assignment_id");
CREATE INDEX "task_assignment_supports_support_user_id_idx" ON "task_assignment_supports"("support_user_id");

CREATE UNIQUE INDEX "task_current_assignments_current_assignment_id_key" ON "task_current_assignments"("current_assignment_id");
CREATE INDEX "task_current_assignments_primary_assignee_user_id_idx" ON "task_current_assignments"("primary_assignee_user_id");

ALTER TABLE "task_assignments"
  ADD CONSTRAINT "task_assignments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "delivery_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_assignments_previous_assignment_id_fkey"
  FOREIGN KEY ("previous_assignment_id") REFERENCES "task_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_assignments_primary_assignee_user_id_fkey"
  FOREIGN KEY ("primary_assignee_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_assignments_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_assignment_supports"
  ADD CONSTRAINT "task_assignment_supports_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "task_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_assignment_supports_support_user_id_fkey"
  FOREIGN KEY ("support_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_current_assignments"
  ADD CONSTRAINT "task_current_assignments_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "delivery_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_current_assignments_current_assignment_id_fkey"
  FOREIGN KEY ("current_assignment_id") REFERENCES "task_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "task_current_assignments_primary_assignee_user_id_fkey"
  FOREIGN KEY ("primary_assignee_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
