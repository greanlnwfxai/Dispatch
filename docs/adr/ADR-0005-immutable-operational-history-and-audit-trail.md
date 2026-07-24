# ADR-0005: Immutable Operational History and Audit Trail

- **Status:** Accepted
- **Record Type:** Backfilled ADR
- **Date Recorded:** 2026-07-24
- **Effective Since:** MVP-02 remediation (2026-07-23 — TaskEvent `ON DELETE RESTRICT`) ต่อเนื่องถึง MVP-04 (Assignment history)
- **Decision Owners:** Architecture, Engineering; Security/Privacy Review (ขอบเขตการเข้าถึงประวัติ)
- **Related BDRs:** BDR-ASSIGN-003, BDR-ASSIGN-005 (ประวัติ reassignment ต้องคงอยู่ถาวร)
- **Related TDRs:** None
- **Related Milestones:** MVP-02 (+remediation), MVP-03, MVP-04
- **Supersedes:** None
- **Superseded By:** None

## Context

Dispatch Knowledge Topic 11 หมวด 2 หลักการข้อ 3 และข้อ 9 กำหนดว่า Timeline,
Audit Log, และประวัติปฏิบัติการอื่นต้องเป็น append-only — ห้าม hard delete
Task หรือ Audit history ไม่ว่ากรณีใด แม้แต่ Super Admin ก็ไม่มีสิทธิ์นี้
(BR-DATA-007, BR-AUDIT-003) ระบบต้องสามารถตอบคำถามย้อนหลังได้เสมอว่า "ใครทำ
อะไร เมื่อไร และทำไม" สำหรับทุกการเปลี่ยนแปลงที่มีนัยสำคัญทางธุรกิจ — ทั้งเพื่อ
การสืบสวนข้อพิพาทกับลูกค้า, ความรับผิดชอบเชิงปฏิบัติการ, และการตรวจสอบของ
Management/Auditor ขณะเดียวกันข้อมูลปัจจุบัน (current state) ยังต้องเปลี่ยนได้
ตามปกติของธุรกิจ (เช่น current assignment เปลี่ยนเมื่อ reassign) โดยไม่ทำลาย
ความหมายของประวัติเดิม

## Decision Drivers

- ต้องตรวจสอบย้อนหลังได้ (traceability) สำหรับข้อพิพาทลูกค้าและการตรวจสอบภายใน
- ความรับผิดชอบเชิงปฏิบัติการ (operational accountability) ต่อทุก action ที่
  เปลี่ยนสถานะหรือความรับผิดชอบของ Task
- ต้องรักษาความหมายของ record ประวัติแม้ current-state record จะเปลี่ยนไปแล้ว
- ห้ามมีการแก้ไข/ลบที่เงียบ (silent mutation) — ทุกการแก้ไขต้องทิ้งร่องรอย
- Failed command ต้องไม่สร้างหลักฐานที่ทำให้เข้าใจผิด (misleading audit
  evidence)
- การเข้าถึงประวัติที่ sensitive ต้องอยู่ภายใต้การควบคุมสิทธิ์เดียวกับข้อมูล
  ปัจจุบัน (ดู [ADR-0006](ADR-0006-rbac-and-server-side-record-scope.md))

## Considered Options

### Option A — เขียนทับเฉพาะค่าปัจจุบัน (overwrite current values only, ไม่มีตาราง
ประวัติแยก)

ข้อดี: schema ง่ายที่สุด, query เร็ว
ข้อเสีย: ไม่มีทางตอบคำถาม "ใครมอบหมายงานนี้ก่อนหน้านี้" ได้เลย ขัดกับ
BR-AUDIT-003 โดยตรง ไม่ตอบสนอง requirement การตรวจสอบย้อนหลังขั้นพื้นฐาน

### Option B — ประวัติที่แก้ไขได้ (mutable history records, เช่น audit log ที่
UPDATE ได้)

ข้อดี: แก้ไขข้อมูลผิดพลาดในประวัติได้โดยตรงหากพบภายหลัง
ข้อเสีย: ทำลายคุณค่าของ audit trail ทั้งหมด — ไม่มีทางพิสูจน์ว่า record ที่
เห็นอยู่ ณ เวลาตรวจสอบตรงกับสิ่งที่เกิดขึ้นจริง ณ เวลานั้นหรือถูกแก้ไขภายหลัง

### Option C — Append-only history พร้อม current-record projection/reference
แยกต่างหาก (ตัวเลือกที่ยอมรับ)

ข้อดี: ประวัติไม่ถูกแตะต้องหลังสร้าง, current-state query ยังทำได้เร็วผ่าน
projection table แยก, การแก้ไข "ข้อมูลปัจจุบัน" (เช่น reassignment) ไม่ทำลาย
ความหมายของ record ประวัติเดิม
ข้อเสีย: มีสอง source ของความจริงที่ต้อง sync กันเสมอในทรานแซคชันเดียวกัน
(ประวัติ + projection) — เพิ่มความซับซ้อนของ schema และความเสี่ยงที่ทั้งสอง
จะ out-of-sync หากนักพัฒนาลืมเขียนคู่กัน

## Decision

ทุกการเปลี่ยนแปลงเชิงปฏิบัติการที่มีนัยสำคัญสร้าง record ประวัติแบบ
append-only เสมอ — ไม่มี `UPDATE`/`DELETE` บน record ประวัติหลังสร้างแล้ว:

- **`TaskEvent`** — บันทึกทุก status transition ของ Task
  (`apps/api/prisma/schema.prisma` model `TaskEvent`, comment ในไฟล์ระบุ
  ชัดเจนว่า "a row is never updated or deleted, only created") FK ไปยัง
  `DeliveryTask` ใช้ `onDelete: Restrict` (เปลี่ยนจาก `Cascade` เดิมด้วย
  migration `20260723093000_task_event_delete_restrict` เพื่อป้องกันไม่ให้
  ประวัติหายไปพร้อมกับ Task ในอนาคตหากมี delete path เกิดขึ้น)
- **`TaskAssignment`** — event log แบบ append-only ของทุก initial assignment/
  reassignment แต่ละแถวไม่เคยถูก `update()` — `TaskAssignmentSupport` เป็น
  child ที่สร้างพร้อมกับ parent event เดียวเท่านั้นและไม่ถูกแก้ไขอีก
- **`TaskCurrentAssignment`** — เป็น record เดียวในกลุ่มนี้ที่ **mutable
  โดยตั้งใจ**: เป็น one-row-per-task pointer ที่ชี้ไปยัง `TaskAssignment`
  ล่าสุดเท่านั้น การ reassign เปลี่ยนเฉพาะ pointer นี้ ไม่แตะประวัติ
  `TaskAssignment` เดิม
- **`PreparationCorrectionRecord`** — การแก้ไขข้อมูล preparation หลัง lock
  สร้าง record ใหม่ที่เก็บทั้ง `originalPreparationSnapshot` และ
  `correctedOrExceptionSnapshot` เป็น JSON snapshot คู่กัน แทนที่จะเขียนทับ
  ค่าดั้งเดิมใน `PreparationRecord`

ไม่มี `@Delete()` controller route ใดในระบบสำหรับ `TaskEvent`,
`TaskAssignment`/`TaskAssignmentSupport`, หรือ `PreparationCorrectionRecord`
— ตรวจสอบแล้วว่า `apps/api/src/tasks/tasks.controller.ts`,
`apps/api/src/preparation/preparation.controller.ts`, และ
`apps/api/src/assignment/assignment.controller.ts` ไม่มี HTTP DELETE
endpoint ใด ๆ

## Consequences

### Positive

- ทุกการเปลี่ยนแปลงที่มีนัยสำคัญตรวจสอบย้อนหลังได้แบบสมบูรณ์ — สามารถ
  reconstruct ห่วงโซ่การมอบหมายทั้งหมดของ Task หนึ่งได้จาก
  `TaskAssignment.previousAssignmentId`
- `ON DELETE RESTRICT` ทำให้ PostgreSQL เองปฏิเสธการลบ `User`/`DeliveryTask`
  ที่ยังมีประวัติอ้างอิงอยู่ — เป็นด่านป้องกันที่ไม่ขึ้นกับวินัยของ
  application code
- Failed command ไม่ทิ้งร่องรอยที่ทำให้เข้าใจผิด เพราะการเขียนประวัติอยู่ใน
  transaction เดียวกับการเปลี่ยนสถานะ (ดู
  [ADR-0004](ADR-0004-task-row-locking-and-concurrency-control.md)) — หาก
  guard ล้มเหลว จะไม่มีทั้ง status change และ history event ถูกเขียน

### Negative

- Storage เติบโตต่อเนื่องแบบไม่มีการลบ — ยังไม่มี retention/archiving policy
  ที่ implement ในระบบปัจจุบัน
- Query ที่ต้องการ "สถานะปัจจุบัน" ต้อง join หรืออ่านจาก projection
  table/pointer แยกต่างหาก (`TaskCurrentAssignment`) แทนที่จะอ่านจากตาราง
  ประวัติโดยตรง — เพิ่มความซับซ้อนของ query และความเสี่ยงที่นักพัฒนาลืมเขียน
  ทั้งสองคู่กันหากไม่ระวัง (ลดความเสี่ยงนี้ด้วยการเขียนทั้งคู่ในทรานแซคชัน
  เดียวกันเสมอ — ดู ADR-0004)
- "Immutable" ในเอกสารนี้หมายถึงการป้องกันระดับ application และ relational
  schema (ไม่มี UPDATE/DELETE endpoint, `ON DELETE RESTRICT`) เท่านั้น
  **ไม่ใช่** การรับประกันเชิง cryptographic (ไม่มี hash chain, ไม่มี WORM
  storage) — ผู้ที่มีสิทธิ์เข้าถึงฐานข้อมูลโดยตรง (เช่น operator ที่รัน SQL
  เอง) ยังสามารถแก้ไขได้ในทางเทคนิค การป้องกันนี้อยู่นอกขอบเขตของ ADR นี้

### Operational Consequences

- ไม่มี retention/archiving job ใด ๆ implement อยู่ในปัจจุบัน — ตารางประวัติ
  จะโตตามการใช้งานโดยไม่มี pruning
- Migration ที่แก้ FK behavior (เช่น CASCADE -> RESTRICT) ต้องเป็น migration
  ใหม่แบบ additive เสมอ (ดู
  [ADR-0002](ADR-0002-postgresql-prisma-and-forward-only-migrations.md))

### Security and Privacy Consequences

- การเข้าถึงประวัติ sensitive (เช่น รายละเอียด reassignment reason) ยังคง
  อยู่ภายใต้ RBAC/record-scope เดียวกับข้อมูลปัจจุบัน — ADR นี้ไม่เปิด
  ประวัติให้เข้าถึงกว้างกว่าข้อมูลปัจจุบัน
- Metadata ใน `TaskEvent.metadata` (JSON) ถูกจำกัดให้เป็นข้อมูลที่ไม่ sensitive
  เท่านั้น (comment ใน schema: "Safe, non-sensitive metadata only — never a
  password/token/hash or Prisma internals")

### Testing Consequences

- ต้องมี test ที่ยืนยันว่าไม่มี code path ใดสามารถลบ/แก้ไขประวัติที่มีอยู่แล้ว
  ได้ (เช่น ไม่มี `@Delete()` route, FK constraint ปฏิเสธการลบ parent ที่มี
  ประวัติอ้างอิง)
- Concurrency test ต้องยืนยันว่า transaction ที่แพ้ (loser) ในสถานการณ์แข่งขัน
  ไม่ทิ้ง residue ในตารางประวัติ (ดู
  `apps/api/test/assignment.integration-spec.ts`)

## Implementation Constraints

- ห้ามเพิ่ม `@Delete()` endpoint สำหรับ record ประวัติใด ๆ (`TaskEvent`,
  `TaskAssignment`, `TaskAssignmentSupport`, `PreparationCorrectionRecord`
  และ record ประวัติในอนาคต)
- FK จาก record ประวัติไปยัง parent (Task, User) ต้องใช้ `onDelete: Restrict`
  เสมอ ไม่ใช่ `Cascade` — ป้องกันการลบ parent ที่ทำให้ประวัติหายไปโดยอ้อม
- การแก้ไขข้อมูลที่เคย lock แล้ว (เช่น preparation หลัง `IN_TRANSIT`) ต้องสร้าง
  correction record ใหม่ที่เก็บทั้งค่าเดิมและค่าใหม่ ไม่เขียนทับค่าดั้งเดิม
- Record ที่ตั้งใจให้ mutable (เช่น current-assignment pointer) ต้องแยกตาราง
  ออกจาก record ประวัติอย่างชัดเจนในระดับ schema พร้อม comment อธิบายเหตุผล
- Actor, timestamp เป็น field บังคับ (non-nullable) บนทุก record ประวัติ

## Repository Evidence

**Decision evidence**
- Dispatch Knowledge Topic 11 หมวด 2 หลักการข้อ 3, 9; หมวด 8.1 (ตาราง
  Append-only/Correction-only/Immutable); หมวด 13 (Audit Log and Timeline
  Architecture)

**Implementation evidence**
- `apps/api/prisma/schema.prisma` model `TaskEvent` — comment "a row is
  never updated or deleted, only created"
- `apps/api/prisma/migrations/20260723093000_task_event_delete_restrict/migration.sql`
  — เปลี่ยน FK จาก CASCADE เป็น RESTRICT โดยไม่แก้ migration เดิม
- `apps/api/prisma/schema.prisma` models `TaskAssignment`,
  `TaskAssignmentSupport`, `TaskCurrentAssignment` — comment block ก่อนหน้า
  `enum AssignmentType` อธิบาย append-only vs mutable pointer อย่างชัดเจน
- `apps/api/prisma/schema.prisma` model `PreparationCorrectionRecord` —
  field `originalPreparationSnapshot`/`correctedOrExceptionSnapshot` (JSON
  snapshot คู่)
- `apps/api/src/assignment/assignment.service.ts` เมธอด `assign`/`reassign`
  — เขียน `TaskAssignment`/`TaskAssignmentSupport`/`TaskCurrentAssignment`/
  `TaskEvent` ในทรานแซคชันเดียวกัน
- ไม่มี `@Delete(` ใน `apps/api/src/tasks/tasks.controller.ts`,
  `apps/api/src/preparation/preparation.controller.ts`,
  `apps/api/src/assignment/assignment.controller.ts` (ตรวจสอบด้วย grep)

**Test evidence**
- `apps/api/test/assignment.integration-spec.ts` — เคสยืนยันว่า transaction
  ที่แพ้ในสถานการณ์แข่งขันไม่ทิ้ง residue ("with no duplicate current
  assignment or event", "with no residue from the loser")

**Governance evidence**
- `CLAUDE.md` §5 ("Append-only history, least privilege... must not be
  altered by any engineering task"), §16 (Security FAIL conditions)
- `README.md` หัวข้อ "Delivery Task Assignment (MVP-04)" — "No assignment or
  history `DELETE` endpoint exists"

## Open Follow-ups

- Retention/archiving policy สำหรับตารางประวัติที่โตต่อเนื่อง ยังไม่ถูก
  ตัดสินใจ (ไม่มี BDR ที่อนุมัติเรื่องนี้ในขอบเขตปัจจุบัน)
- Timeline/Audit Log แบบ user-facing เทียบกับ governance-layer (Topic 11
  หมวด 13.1 แยกสองชั้น) ยังไม่ implement แยกกันอย่างชัดเจนใน MVP-04 —
  `TaskEvent` ทำหน้าที่ผสมทั้งสองบทบาทในขอบเขตปัจจุบัน
- MVP-17 ถึง MVP-19 (Reporting, Audit, Privacy Governance) จะขยายขอบเขตนี้
  ต่อในอนาคต — ยังไม่มีหลักฐาน implementation ให้บันทึกใน ADR นี้

## Review Triggers

- ข้อกำหนดทางกฎหมายเรื่อง retention ที่บังคับให้ต้องลบ/archive ข้อมูลหลังพ้น
  ระยะเวลาหนึ่ง
- ความต้องการ cryptographic integrity (hash chain, digital signature) ของ
  ประวัติ
- ต้อง export เข้าระบบ SIEM ภายนอก
- ข้อกำหนด data-subject erasure (เช่น GDPR right to erasure) ที่ขัดกับ
  append-only โดยตรง
- ต้อง partition/archive ตารางประวัติเนื่องจากขนาดข้อมูล
- นำ event sourcing เข้ามาแทนที่ current-state projection table
- หน่วยงานกำกับดูแลกำหนดให้ต้องใช้ WORM storage

## References

- Dispatch Knowledge `11 - Technical Architecture และแผนพัฒนา MVP.md` หมวด
  2, 8, 13
- `docs/CTO_SUMMARY_MVP_02.md` (remediation), `docs/CTO_SUMMARY_MVP_04.md`
- [ADR-0002](ADR-0002-postgresql-prisma-and-forward-only-migrations.md)
- [ADR-0004](ADR-0004-task-row-locking-and-concurrency-control.md)
- [ADR-0006](ADR-0006-rbac-and-server-side-record-scope.md)
