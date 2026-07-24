# ADR-0002: PostgreSQL, Prisma, and Forward-Only Migrations

- **Status:** Accepted
- **Record Type:** Backfilled ADR
- **Date Recorded:** 2026-07-24
- **Effective Since:** DEV-FOUNDATION-002 (Identity/Role schema และ migration แรก) ต่อเนื่องถึง MVP-04
- **Decision Owners:** Product Owner (เลือกฐานข้อมูล/ORM), Architecture, Engineering (นโยบาย migration)
- **Related BDRs:** None (เป็นการตัดสินใจทางเทคนิคล้วน ไม่แตะ business policy)
- **Related TDRs:** TDR-DATABASE-001, TDR-ORM-001
- **Related Milestones:** DEV-FOUNDATION-002, MVP-02 (+remediation), MVP-03, MVP-04
- **Supersedes:** None
- **Superseded By:** None

## Context

Dispatch ต้องการฐานข้อมูลเชิงสัมพันธ์ที่รองรับ transaction integrity,
constraint บังคับใช้ระดับ database, และ row-level locking เพื่อรองรับ
Append-only operational history และ concurrency control ที่ Dispatch
Knowledge Topic 11 หมวด 2 (Architecture Principles) กำหนดไว้ (append-only
history, ห้าม hard delete, idempotent action) เนื่องจากทุก Task/Assignment/
Preparation record ต้องรักษาประวัติที่ตรวจสอบย้อนหลังได้ตลอดอายุของระบบ
ทางเลือกที่ใช้ schema-less หรือ eventual-consistency store จะเพิ่มภาระในการ
บังคับ constraint เหล่านี้ในชั้น application เพียงอย่างเดียว ซึ่งขัดกับหลักการ
"database constraints เป็นด่านสุดท้าย" ที่ทีมต้องการ

## Decision Drivers

- Transactional integrity ข้าม record ที่เกี่ยวข้องกันในคำสั่งเดียว (เช่น
  DeliveryTask + TaskEvent, TaskAssignment + TaskCurrentAssignment)
- Relational constraint (FK, CHECK, partial unique index) เป็นด่านสุดท้าย
  ของความถูกต้องของข้อมูล ไม่ใช่ application validation เพียงอย่างเดียว
- Row-level locking (`SELECT ... FOR UPDATE`) รองรับ concurrency guard ตาม
  ADR-0004
- Migration traceability — ทุกการเปลี่ยนแปลง schema ต้องตรวจสอบย้อนหลังได้
  เป็นไฟล์แยกต่อรอบ ไม่ใช่ diff schema ที่ generate ใหม่ทุกครั้ง
- ความปลอดภัยในการ deploy — ห้ามใช้ workflow ที่ต้อง reset/drop database ใน
  การพัฒนาปกติ
- Type-sharing กับ TypeScript stack ทั้งหมด (Prisma Client generated types)
- CI reproducibility — migration ต้อง apply ซ้ำได้แน่นอนในทุก environment

## Considered Options

### Option A — Schema synchronization / reset-based development (`prisma db push`, `prisma migrate reset`)

ข้อดี: รวดเร็วสำหรับ prototyping, ไม่ต้องเขียนไฟล์ migration เอง
ข้อเสีย: ไม่มีประวัติของการเปลี่ยนแปลง schema, เสี่ยงต่อการ drop ข้อมูลจริงใน
production, ขัดกับหลักการ append-only history เพราะ `migrate reset` ลบข้อมูล
ทั้งหมดรวมถึง Audit/Timeline

### Option B — แก้ไข migration ที่ apply ไปแล้วโดยตรง (edit-in-place)

ข้อดี: ไฟล์ migration ดูสะอาด ไม่มี migration แก้ไขซ้อนกันหลายไฟล์
ข้อเสีย: migration ที่ถูก apply ไปแล้วใน environment อื่นจะไม่ sync กับไฟล์ที่
ถูกแก้ในภายหลัง (checksum mismatch), ทำลาย audit trail ของการเปลี่ยนแปลง
schema เอง, เสี่ยงสูงต่อ production ที่ apply migration เดิมไปแล้ว

### Option C — Additive, forward-only migrations พร้อม corrective follow-up migration (ตัวเลือกที่ยอมรับ)

ข้อดี: migration ที่ apply แล้วไม่ถูกแตะต้องอีก, ทุกการแก้ไขคือไฟล์ใหม่ที่
ตรวจสอบย้อนหลังได้, ปลอดภัยต่อ production data, สอดคล้องกับ CI ที่ apply
migration ตามลำดับเสมอ
ข้อเสีย: จำนวนไฟล์ migration เพิ่มขึ้นเรื่อย ๆ ตามเวลา, การแก้ไขเล็กน้อย (เช่น
แก้ regex ผิดใน CHECK constraint) ต้องเขียน migration ใหม่แทนที่จะแก้ไฟล์เดิม
ตรง ๆ ซึ่งดูซ้ำซ้อนกว่าในสายตาแรก

## Decision

Dispatch ใช้ **PostgreSQL 16** เป็นฐานข้อมูลเชิงสัมพันธ์หลัก และ **Prisma**
เป็น ORM/migration tool ผ่าน Repository pattern ที่คั่นระหว่าง
`packages/domain` (ไม่รู้จัก Prisma) กับ Prisma Client จริงใน
`apps/api/src/infrastructure/database` migration ทั้งหมดเป็น **additive และ
forward-only เท่านั้น** — migration ที่ถูก apply แล้วต้องไม่ถูกแก้ไขอีก
การแก้ไขปัญหาที่พบภายหลัง (เช่น CHECK constraint ผิด) ต้องสร้าง migration
ใหม่ที่ `DROP CONSTRAINT` แล้ว `ADD CONSTRAINT` ใหม่ ไม่ใช่แก้ไฟล์เดิม

Database constraint (FK, CHECK, partial unique index) เป็นด่านป้องกันสุดท้าย
เสมอ ควบคู่กับ application-level validation ใน `packages/domain` —
application validation ไม่เคยถูกใช้แทน database constraint โดยเฉพาะกรณีที่มี
concurrent write

## Consequences

### Positive

- ทุกการเปลี่ยนแปลง schema มีไฟล์ SQL ที่ตรวจสอบย้อนหลังได้ พร้อม comment
  อธิบายเหตุผลในตัวไฟล์เอง (เช่น
  `apps/api/prisma/migrations/20260723093000_task_event_delete_restrict/migration.sql`
  ระบุชัดเจนว่าเป็น "MVP-02 remediation" และ "additive migration")
- ไม่มีความเสี่ยงที่ migration ที่ apply แล้วใน environment หนึ่งจะ
  out-of-sync กับไฟล์ที่ถูกแก้ในภายหลัง
- Database constraint ป้องกัน invariant ที่สำคัญได้แม้ application layer มีบั๊ก
  เช่น `task_current_assignments_pkey` บน `task_id` เป็นด่านสุดท้ายของ "หนึ่ง
  Task มี current assignment เดียว" โดยไม่ขึ้นกับ row lock ในชั้น service

### Negative

- จำนวนไฟล์ migration เติบโตต่อเนื่อง — การแก้ไขเล็กน้อยกลายเป็น migration
  แยกต่างหาก (เช่น
  `20260723152000_fix_preparation_evidence_object_key_check` แก้เพียง regex
  เดียวใน CHECK constraint แต่ต้องเป็นไฟล์ migration ใหม่ทั้งไฟล์)
- Forward-only ต้องใช้วินัยของทีมสูง — ไม่มีเครื่องมือบังคับในระดับ tooling ว่า
  ห้ามแก้ไฟล์เดิม เป็นเพียง convention ที่ repository นี้ยึดถือ
- ไม่ใช่ทุก migration ที่ reversible จริง — migration ที่ลบ/แก้ CHECK
  constraint บางตัวไม่มี `down` migration ที่ Prisma สร้างให้อัตโนมัติ ต้อง
  เขียน forward migration ใหม่หากต้องการย้อนพฤติกรรม ไม่ใช่ rollback อัตโนมัติ

### Operational Consequences

- `scripts/db-verify.sh` เป็นเกตบังคับก่อนถือว่างานผ่าน — รัน
  `prisma migrate deploy` ภายใน container `api` เท่านั้น (ไม่เคยผ่าน exposed
  port เพราะ PostgreSQL ไม่มี host port mapping ตาม `docker-compose.yml`),
  ตามด้วย idempotent seed และชุด integration test — สคริปต์นี้ไม่เคย drop,
  reset, หรือ truncate ฐานข้อมูล (มี `FORBIDDEN_PATTERN` guard ในตัวสคริปต์เอง
  ที่ปฏิเสธการรันหากพบคำสั่งเช่น `prisma migrate reset` หรือ
  `docker compose down` อยู่ในซอร์สของตัวเอง)
- Migration ต้อง apply ตามลำดับเสมอผ่าน `prisma migrate deploy` — ไม่ใช้
  `prisma migrate dev` หรือ `db push` ใน CI/production path

### Security and Privacy Consequences

- PostgreSQL ไม่มี host port mapping ในทุก environment ที่ approve แล้ว (local
  Docker Compose) — เข้าถึงได้เฉพาะผ่าน internal Docker network เท่านั้น
- Migration SQL ถูกตรวจสอบด้วยตาก่อน commit เสมอ (ไม่ auto-generate แล้ว apply
  ทันทีโดยไม่ทบทวน) เพื่อป้องกัน constraint ที่รั่วไหลข้อมูล sensitive หรือ
  destructive column drop โดยไม่ตั้งใจ

### Testing Consequences

- Database integration test (`apps/api/test/*.integration-spec.ts`) รันกับ
  PostgreSQL จริงผ่าน `scripts/db-verify.sh` ไม่ใช่ mock — เพิ่มเวลาการรัน
  test แต่ยืนยันพฤติกรรมของ constraint/lock จริง (เช่น
  `apps/api/test/assignment.integration-spec.ts` ทดสอบ concurrent assignment
  กับฐานข้อมูลจริง)
- ทุก migration ใหม่ต้องมี integration test คู่กันเพื่อยืนยันว่า constraint
  ทำงานตามที่ตั้งใจ ไม่ใช่พึ่งพา schema review อย่างเดียว

## Implementation Constraints

- ห้ามแก้ไฟล์ในโฟลเดอร์ `apps/api/prisma/migrations/<applied-migration>/`
  ที่ apply ไปแล้ว — การแก้ไขปัญหาต้องเป็น migration ใหม่เสมอ
- ห้ามใช้ `prisma migrate dev`, `prisma migrate reset`, หรือ `prisma db push`
  ใน CI, container startup, หรือ script อัตโนมัติใด ๆ — อนุญาตเฉพาะ
  `prisma migrate deploy` และ `prisma generate`/`prisma validate` (schema-only,
  ไม่ต้องเชื่อมต่อฐานข้อมูล)
- Invariant ที่สำคัญต่อความถูกต้องของข้อมูล (เช่น one-current-assignment,
  destination-source consistency) ต้องมี database constraint คู่กับ
  application validation เสมอ ไม่ใช่ application validation เพียงอย่างเดียว
- `packages/domain` ต้องไม่ import Prisma Client โดยตรง — การเข้าถึงฐานข้อมูล
  ผ่าน Repository adapter ใน `apps/api/src/infrastructure/database` เท่านั้น

## Repository Evidence

**Decision evidence**
- Dispatch Knowledge Topic 11 หมวด 5.5, 5.6 (การวิเคราะห์ทางเลือก) และหมวด 22
  แถว `TDR-DATABASE-001`/`TDR-ORM-001` (สถานะ `APPROVED`, Product Owner,
  DEV-FOUNDATION-001/002)

**Implementation evidence**
- `apps/api/prisma/schema.prisma` — schema หลักทั้งหมดผ่าน MVP-04 (models
  `User`, `Role`, `DeliveryTask`, `TaskEvent`, `PreparationRecord`,
  `TaskAssignment`, `TaskCurrentAssignment` ฯลฯ)
- `apps/api/prisma/migrations/20260722135828_customer_and_task_creation/migration.sql`
  — CHECK constraint ต้นฉบับ `delivery_tasks_destination_source_consistency_check`
  และ `ON DELETE RESTRICT` ของ FK สำคัญ
- `apps/api/prisma/migrations/20260723093000_task_event_delete_restrict/migration.sql`
  — ตัวอย่าง corrective forward-only migration ที่เปลี่ยน FK จาก CASCADE เป็น
  RESTRICT โดยไม่แก้ migration เดิม
- `apps/api/prisma/migrations/20260723152000_fix_preparation_evidence_object_key_check/migration.sql`
  — ตัวอย่าง corrective migration ที่แก้ regex ของ CHECK constraint
- `apps/api/prisma/migrations/20260723160000_delivery_task_assignment/migration.sql`
  — `task_assignments_type_consistency_check` CHECK constraint และ
  `task_current_assignments_pkey` บน `task_id`
- `apps/api/prisma/seed.ts` — idempotent system-role seed ผ่าน `upsert`,
  ไม่มี default User
- `docker-compose.yml` — service `db` ไม่มี `ports:` mapping สู่ host

**Test evidence**
- `scripts/db-verify.sh` — ขั้นตอน `prisma migrate deploy` ภายใน container,
  ตามด้วย `npm run test:integration && npm run test:e2e`, และ
  `FORBIDDEN_PATTERN` guard ที่ปฏิเสธการรันหากพบคำสั่ง destructive ในซอร์ส
  ของตัวเอง
- `apps/api/test/delivery-task.integration-spec.ts`,
  `apps/api/test/assignment.integration-spec.ts` — ทดสอบ constraint/lock
  กับฐานข้อมูล PostgreSQL จริง

**Governance evidence**
- `CLAUDE.md` §10, §11 — คำสั่ง verification ที่บังคับ และกฎ Docker safety
- `docs/CTO_SUMMARY_MVP_04.md`, `docs/CTO_SUMMARY_DEV_FOUNDATION_002.md` —
  บันทึกการส่งมอบ schema/migration ต่อ milestone

## Open Follow-ups

- TDR-DEPLOY-001 (production) ยังไม่อนุมัติ — production PostgreSQL topology,
  backup, และ restore-verification cadence ยังเป็น
  `TECHNICAL_DECISION_REQUIRED` (Dispatch Knowledge Topic 11 หมวด 22)
- ยังไม่มี business aggregate schema สำหรับ milestone MVP-05 ขึ้นไป (Delivery
  Attempt, Returned Goods, Override) — ADR นี้ไม่ขยายผลไปยัง schema ที่ยังไม่
  implement

## Review Triggers

- เปลี่ยนไปใช้ฐานข้อมูลอื่นนอกจาก PostgreSQL
- เปลี่ยนไปใช้ ORM/migration tool อื่นนอกจาก Prisma
- ต้องรองรับหลายฐานข้อมูล (multi-database architecture)
- ต้องการ zero-downtime migration ที่เกินกว่าแนวทาง `migrate deploy` ปัจจุบัน
  รองรับ
- ต้องการ tenant-specific schema หรือ schema-per-customer
- นำ online migration tooling (เช่น pt-online-schema-change เทียบเท่าสำหรับ
  Postgres) เข้ามาใช้

## References

- Dispatch Knowledge `11 - Technical Architecture และแผนพัฒนา MVP.md` หมวด
  5.5, 5.6, 20, 22
- `docs/CTO_SUMMARY_DEV_FOUNDATION_002.md`
- `docs/CTO_SUMMARY_MVP_02.md` (remediation — row lock + TaskEvent restrict)
- `docs/CTO_SUMMARY_MVP_04.md`
- [ADR-0004](ADR-0004-task-row-locking-and-concurrency-control.md) — การใช้
  row lock บน constraint เหล่านี้
- [ADR-0005](ADR-0005-immutable-operational-history-and-audit-trail.md) —
  การใช้ `ON DELETE RESTRICT` เพื่อรักษาประวัติ
