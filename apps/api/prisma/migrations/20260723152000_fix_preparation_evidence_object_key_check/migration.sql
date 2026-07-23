-- Correct MVP-03 evidence object-key CHECK regex.
-- Narrow constraint replacement only; no table/column/row deletion.

ALTER TABLE "preparation_evidence"
  DROP CONSTRAINT "preparation_evidence_object_key_check";

ALTER TABLE "preparation_evidence"
  ADD CONSTRAINT "preparation_evidence_object_key_check"
  CHECK ("object_key" ~ '^preparation/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
