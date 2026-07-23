-- MVP-02 remediation — TaskEvent audit history must not cascade-delete.
--
-- The original 20260722135828_customer_and_task_creation migration is
-- already applied locally and must remain immutable. This additive
-- migration changes only the TaskEvent -> DeliveryTask foreign key delete
-- behavior from CASCADE to RESTRICT. No data, table, column, enum, index,
-- or unrelated constraint is removed.

ALTER TABLE "task_events" DROP CONSTRAINT "task_events_task_id_fkey";

ALTER TABLE "task_events"
ADD CONSTRAINT "task_events_task_id_fkey"
FOREIGN KEY ("task_id")
REFERENCES "delivery_tasks"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
