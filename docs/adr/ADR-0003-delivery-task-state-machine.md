# ADR-0003: Delivery Task State Machine

- **Status:** Accepted
- **Record Type:** Backfilled ADR
- **Date Recorded:** 2026-07-24
- **Effective Since:** MVP-02 (DRAFT -> WAITING_PREPARATION) ต่อเนื่องถึง MVP-04 (READY_FOR_DISPATCH -> ASSIGNED)
- **Decision Owners:** Architecture, Engineering (สถาปัตยกรรม state machine); Product Owner (ลำดับ/กติกาสถานะตาม Topic 04 — ไม่ใช่ ADR นี้)
- **Related BDRs:** BDR-ASSIGN-001 ถึง BDR-ASSIGN-005 (ไม่กระทบลำดับสถานะ เฉพาะ business rule ของ Assignment)
- **Related TDRs:** None
- **Related Milestones:** MVP-02, MVP-03, MVP-04
- **Supersedes:** None
- **Superseded By:** None

## Context

Main Task Status ของ Dispatch มี 10 ค่าที่อนุมัติแล้วใน Dispatch Knowledge
Topic 04 (`DRAFT`, `WAITING_PREPARATION`, `PREPARING`, `READY_FOR_DISPATCH`,
`ASSIGNED`, `IN_TRANSIT`, `AT_DESTINATION`, `WAITING_NEXT_ATTEMPT`,
`COMPLETED`, `CANCELLED`) — ระบบมีหลาย surface (Admin Web, Mobile/PWA, API)
ที่ต้องเห็นสถานะเดียวกันตรงกันเสมอ และมีหลาย Role ที่ได้รับอนุญาตให้กระทำ
action เฉพาะในบางสถานะเท่านั้น (Dispatch Knowledge Topic 11 หมวด 9, 10)
ผ่าน MVP-04 มีเพียง 5 สถานะแรกที่ถูก implement จริง: `DRAFT ->
WAITING_PREPARATION -> PREPARING -> READY_FOR_DISPATCH -> ASSIGNED` — สถานะ
ที่เหลือ (`IN_TRANSIT` เป็นต้นไป) ยังไม่มี command handler ใด ๆ ต้องมี
สถาปัตยกรรมที่ป้องกันไม่ให้ client (Admin Web/PWA) เป็นผู้กำหนดสถานะเอง และ
ป้องกันการข้ามสถานะ (invalid transition) แม้จะมี concurrent request

## Decision Drivers

- Workflow ต้องเป็นไปตามลำดับที่กำหนด (deterministic) — ห้าม skip สถานะ
- บังคับใช้ business rule ต่อ transition แต่ละครั้ง (evidence completeness,
  role permission, current-status guard)
- ต้องตรวจสอบย้อนหลังได้ว่าใครเปลี่ยนสถานะเมื่อไร (auditability — ดู
  [ADR-0005](ADR-0005-immutable-operational-history-and-audit-trail.md))
- ต้องปลอดภัยเมื่อมี concurrent request พยายามเปลี่ยนสถานะเดียวกันพร้อมกัน
  (ดู [ADR-0004](ADR-0004-task-row-locking-and-concurrency-control.md))
- แต่ละ Role มีสิทธิ์ทำ transition เฉพาะบางจุด (Stock ทำได้เฉพาะ
  `PREPARING -> READY_FOR_DISPATCH`, Dispatcher/Admin ทำ
  `READY_FOR_DISPATCH -> ASSIGNED`)
- โค้ดต้องดูแลรักษาง่ายข้าม Admin Web, Mobile/PWA, และ API โดยไม่ให้ตรรกะ
  สถานะกระจัดกระจาย

## Considered Options

### Option A — Field ที่แก้ไขได้อย่างอิสระ (freely editable status field)

ข้อดี: ง่ายที่สุดในการ implement — client ส่งค่าสถานะใหม่มาตรง ๆ
ข้อเสีย: ไม่มีจุดบังคับ business rule ที่รวมศูนย์, เสี่ยงต่อ invalid
transition ที่ client ส่งมาโดยตรง, ไม่สามารถ trace ว่าทำไมสถานะถึงเปลี่ยน,
ขัดกับหลักการ "Business rules are authoritative" ของ Topic 11 หมวด 2

### Option B — UI ควบคุม transition (UI-controlled workflow)

ข้อดี: UX ควบคุมได้ง่าย ซ่อนปุ่มที่ไม่ควรกดในแต่ละสถานะ
ข้อเสีย: การซ่อนปุ่มไม่ใช่การควบคุมความปลอดภัย (เทียบ
[ADR-0006](ADR-0006-rbac-and-server-side-record-scope.md)) — client สามารถ
เรียก API ตรงข้าม UI ได้เสมอ ไม่มีจุดบังคับกฎที่แท้จริงอยู่ที่ server

### Option C — Command/Service แบบรวมศูนย์ภายใต้ transaction control (ตัวเลือกที่ยอมรับ)

ข้อดี: ทุก transition ผ่าน service ที่กำหนดไว้ล่วงหน้าเท่านั้น
(`TasksService`, `PreparationService`, `AssignmentService`) แต่ละ service
อ่านสถานะปัจจุบันใหม่ภายใต้ row lock ก่อนตัดสินใจ, ตรวจสอบ guard ที่จำเป็น,
เขียน status ใหม่พร้อม audit event ในทรานแซคชันเดียว
ข้อเสีย: เพิ่ม boilerplate ต่อทุก transition (ต้องมี service method,
validation function ใน `packages/domain`, และ integration test แยกกัน) —
ไม่สามารถเพิ่ม transition ใหม่แบบรวดเร็วโดยข้ามขั้นตอนออกแบบ

## Decision

Main Task Status เก็บเป็น enum เดียวที่มี 10 ค่าครบตามที่ Topic 04 อนุมัติ
(`packages/shared-types` `DELIVERY_TASK_STATUS_CODES` และ Prisma enum
`DeliveryTaskStatus`) แต่ **มีเพียง 5 สถานะแรกเท่านั้นที่มี command handler ที่
implement จริงผ่าน MVP-04** — สถานะที่เหลือมีอยู่ใน enum เพื่อความสอดคล้องของ
taxonomy แต่ไม่มี transition ใดในโค้ดที่นำไปสู่สถานะเหล่านั้นได้ Client (Admin
Web, Mobile/PWA) ไม่เคยเขียนค่าสถานะลงในฐานข้อมูลโดยตรง — ทุก transition
ต้องผ่าน command service ที่กำหนดไว้ล่วงหน้า:

- `DRAFT -> WAITING_PREPARATION`: `TasksService.submit`
  (`apps/api/src/tasks/tasks.service.ts`)
- `WAITING_PREPARATION -> PREPARING`: `PreparationService` เมธอด start
  preparation (`apps/api/src/preparation/preparation.service.ts`)
- `PREPARING -> READY_FOR_DISPATCH`: `PreparationService` เมธอด confirm ready
- `READY_FOR_DISPATCH -> ASSIGNED`: `AssignmentService.assign`
  (`apps/api/src/assignment/assignment.service.ts`)

แต่ละ service อ่านสถานะปัจจุบันใหม่ **ภายใต้ row lock ของ transaction เดียวกัน**
ก่อนตรวจสอบ guard และเขียนสถานะใหม่ — ไม่มี transition ใดที่ตัดสินใจจากค่า
สถานะที่อ่านมาก่อนหน้า transaction (ดูรายละเอียดกลไก lock ใน
[ADR-0004](ADR-0004-task-row-locking-and-concurrency-control.md))

## Consequences

### Positive

- ไม่มีช่องทางที่ client จะข้ามสถานะหรือกำหนดสถานะเองได้ — ทุก transition
  บังคับผ่าน guard เดียวกันไม่ว่าจะเรียกจาก Admin Web, PWA, หรือ direct API
  call
- Enum ที่มี 10 ค่าครบทำให้ codebase สอดคล้องกับ Topic 04 ตั้งแต่ต้น
  ไม่ต้อง migrate schema ใหม่เมื่อ MVP-05 เป็นต้นไปเพิ่ม transition สู่
  `IN_TRANSIT` เป็นต้น
- Guard ที่ centralised ใน `packages/domain` (เช่น
  `validateInitialAssignmentStatus`, `validatePreparationStart`) ทำให้เขียน
  test สำหรับทุกแถวใน transition matrix ได้ตรงจุด

### Negative

- Enum มี 5 ค่าที่ยังไม่มี transition ใดนำไปถึงได้ (`IN_TRANSIT` เป็นต้นไป) —
  ผู้ที่อ่าน schema เพียงอย่างเดียวโดยไม่เห็น service layer อาจเข้าใจผิดว่า
  transition เหล่านั้น implement แล้ว ต้องอ้างอิง Implementation Roadmap
  (Topic 11 หมวด 21) ควบคู่เสมอ
- การเพิ่ม transition ใหม่แต่ละครั้งต้องแก้ทั้ง `packages/domain` (guard),
  service (`apps/api/src/**`), และ integration test พร้อมกัน — ไม่มี
  configuration แบบ table-driven ที่รวมทุก transition ไว้จุดเดียว
  เพิ่มโอกาสที่ guard ในสอง module จะไม่ sync กันหากทีมไม่ระวัง

### Operational Consequences

- การ deploy migration ใหม่ที่เพิ่ม transition (เช่น MVP-05 `StartDeliveryAttempt`)
  ไม่กระทบ enum เดิม เพราะ enum values ทั้ง 10 มีอยู่แล้ว — กระทบเฉพาะการเพิ่ม
  service/guard ใหม่

### Security and Privacy Consequences

- Error message ที่ client เห็นเมื่อ transition ไม่ถูกต้องเป็นข้อความทั่วไป
  (เช่น `ConflictException` "Task cannot be reassigned in its current
  state.") ไม่เปิดเผยรายละเอียดสถานะภายในของ Task ที่ผู้ใช้ไม่มีสิทธิ์เห็น —
  สอดคล้องกับ Error Model ใน Topic 11 หมวด 18

### Testing Consequences

- ทุก transition ต้องมี unit test ระดับ `packages/domain` (guard function) และ
  integration test ระดับ service เพื่อยืนยันว่าการอ่านสถานะภายใต้ lock ทำงาน
  ถูกต้อง — เพิ่มจำนวนชุดทดสอบต่อ transition มากกว่าระบบที่ปล่อยให้ client
  ส่งสถานะได้อิสระ

## Implementation Constraints

- ห้ามเพิ่ม endpoint หรือ field ใดที่อนุญาตให้ client เขียนค่า `status` ของ
  `DeliveryTask` ลงตรง ๆ (ต้องผ่าน command service ที่มี guard เท่านั้น)
- Service ที่ทำ transition ต้องอ่านสถานะปัจจุบันใหม่ภายใต้ row lock ก่อนเขียน
  เสมอ ห้ามตัดสินใจจากค่าที่ query มาก่อนเปิด transaction
- ทุก transition ที่สำเร็จต้องสร้าง `TaskEvent` ในทรานแซคชันเดียวกัน (ดู
  [ADR-0005](ADR-0005-immutable-operational-history-and-audit-trail.md))
- ห้ามสร้างสถานะใหม่นอกเหนือ 10 ค่าที่อนุมัติแล้วใน Topic 04 โดยไม่ผ่าน
  Product Owner (Topic 11 หมวด 2 หลักการข้อ 5, หมวด 25)
- ห้าม implement transition ที่ยังไม่อยู่ใน Implementation Roadmap (Topic 11
  หมวด 21) ล่วงหน้าเพียงเพราะ enum มีค่านั้นอยู่แล้ว

## Repository Evidence

**Decision evidence**
- Dispatch Knowledge Topic 11 หมวด 9.1 (state diagram), หมวด 10.1 (Guard 6
  ชั้น), หมวด 21 (Implementation Roadmap — ยืนยันขอบเขตที่ implement จริงถึง
  MVP-04 เท่านั้น)

**Implementation evidence**
- `packages/shared-types/src/index.ts` — `DELIVERY_TASK_STATUS_CODES` (10
  ค่า) พร้อม comment ระบุชัดเจนว่ามีเพียงบางค่าที่ implement ผ่าน API จริง
- `apps/api/prisma/schema.prisma` — enum `DeliveryTaskStatus` (mirror กับ
  `packages/shared-types`)
- `apps/api/src/tasks/tasks.service.ts` เมธอด `create`, `update`, `submit` —
  `DRAFT -> WAITING_PREPARATION`
- `apps/api/src/preparation/preparation.service.ts` — `WAITING_PREPARATION
  -> PREPARING -> READY_FOR_DISPATCH`
- `apps/api/src/assignment/assignment.service.ts` เมธอด `assign` —
  `READY_FOR_DISPATCH -> ASSIGNED`
- `packages/domain/src/index.ts` — guard function รวมศูนย์ เช่น
  `validateInitialAssignmentStatus`, `validatePreparationStart`,
  `validatePreparationReady`

**Test evidence**
- `packages/domain/src/index.test.ts` — ทดสอบ guard function ทุกตัวต่อสถานะที่
  ถูกต้อง/ไม่ถูกต้อง (เช่น `validateInitialAssignmentStatus("WAITING_PREPARATION")`
  ต้อง reject ด้วย error code เฉพาะ)
- `apps/api/test/delivery-task.integration-spec.ts`,
  `apps/api/test/assignment.integration-spec.ts` — ทดสอบ transition ผ่าน HTTP
  layer จริงกับฐานข้อมูล

**Governance evidence**
- `README.md` หัวข้อ "Delivery Task Assignment (MVP-04)" และ "Current
  milestone" — ยืนยันขอบเขตที่ implement จริงตรงกับที่ ADR นี้บันทึก
- `CLAUDE.md` §1, §6 — ยืนยันว่า MVP-05 ขึ้นไปยังไม่ implement

## Open Follow-ups

- MVP-05 ถึง MVP-09 (Internal Delivery Workflow: Start, GPS Check-in,
  Handover, Quantity/Outcome, Normal Closure) ยังไม่ implement — ต้องมี ADR
  ใหม่หรือส่วนขยายเมื่อ transition สู่ `IN_TRANSIT` เป็นต้นไปถูกสร้างจริง
  หากมีการตัดสินใจสถาปัตยกรรมใหม่ที่ material
- BDR-RETURN-007 (ยืนยันคืนสินค้าก่อนมอบหมาย Attempt ถัดไปหรือไม่) ยังเปิดอยู่
  — ไม่กระทบ 5 สถานะที่ ADR นี้ครอบคลุม แต่จะกระทบ transition ในอนาคตที่ยัง
  ไม่ implement

## Review Triggers

- เพิ่ม parallel workflow branch (เช่น partial delivery ที่มีหลาย attempt
  พร้อมกัน)
- เพิ่ม multi-attempt delivery logic
- External-courier มี state แยกจาก internal delivery
- Reopen/Cancellation ถูก implement จริง (Main Task Status ย้อนกลับจาก
  `COMPLETED`/`CANCELLED`)
- เปลี่ยนไปใช้ event-sourced state reconstruction แทนการเก็บ current status
  field โดยตรง

## References

- Dispatch Knowledge `11 - Technical Architecture และแผนพัฒนา MVP.md` หมวด 9,
  10, 21
- Dispatch Knowledge `04 - สถานะของงานและกติกาการเปลี่ยนสถานะ.md`
- `docs/CTO_SUMMARY_MVP_02.md`, `docs/CTO_SUMMARY_MVP_03.md`,
  `docs/CTO_SUMMARY_MVP_04.md`
- [ADR-0004](ADR-0004-task-row-locking-and-concurrency-control.md)
- [ADR-0005](ADR-0005-immutable-operational-history-and-audit-trail.md)
