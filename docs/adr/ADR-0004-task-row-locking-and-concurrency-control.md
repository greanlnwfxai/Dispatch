# ADR-0004: Task Row Locking and Concurrency Control

- **Status:** Accepted
- **Record Type:** Backfilled ADR
- **Date Recorded:** 2026-07-24
- **Effective Since:** MVP-02 remediation (2026-07-23 — row lock บน `DeliveryTask` สำหรับ Draft edit/submit) ต่อเนื่องถึง MVP-04 (Assignment/Reassignment)
- **Decision Owners:** Architecture, Engineering
- **Related BDRs:** BDR-ASSIGN-004 (multiple active tasks per employee — ไม่บล็อกที่ระดับ lock), BDR-ASSIGN-005 (mandatory reassignment reason — ตรวจสอบภายใต้ lock เดียวกัน)
- **Related TDRs:** None
- **Related Milestones:** MVP-02 (remediation), MVP-03, MVP-04
- **Supersedes:** None
- **Superseded By:** None

## Context

Dispatch มี actor หลายคนที่อาจพยายามแก้ไข Task เดียวกันพร้อมกัน — เช่น
Dispatcher สอง session พยายาม assign Task เดียวกัน, หรือ Admin กด reassign
ซ้ำสองครั้งจากแท็บ browser ที่เปิดค้างไว้ (ข้อมูลเก่า) Dispatch Knowledge
Topic 11 หมวด 8.3 ระบุ concurrency risk เหล่านี้ไว้ตั้งแต่ระดับสถาปัตยกรรม
(double-assignment, double-closure) และหมวด 2 หลักการข้อ 8 กำหนดให้ action
ต้อง retry-safe/idempotent — ระบบต้องรับประกันว่า "หนึ่ง Task มี current
assignment เพียงหนึ่งเดียวเสมอ" (BR-ASSIGN-001) แม้ภายใต้ concurrent request
และต้องปฏิเสธการ reassign ที่อ้างอิงข้อมูลเก่า (stale write) อย่าง
deterministic แทนที่จะเขียนทับเงียบ ๆ

## Decision Drivers

- ป้องกัน double-assignment/double-transition บน Task เดียวกัน
- ป้องกัน current-record ซ้ำซ้อน (มากกว่าหนึ่ง current assignment ต่อ Task)
- ป้องกัน stale-write เมื่อ actor กระทำการโดยอ้างอิงสถานะที่ไม่ใช่ล่าสุดแล้ว
- ผลลัพธ์ของ conflict ต้อง deterministic (409 พร้อม error code ที่คาดเดาได้)
  ไม่ใช่ race ที่ไม่แน่นอน
- ทดสอบได้กับฐานข้อมูล PostgreSQL จริง ไม่ใช่ mock
- สอดคล้องกับความสามารถของ PostgreSQL/Prisma ที่มีอยู่แล้ว (interactive
  transaction, `FOR UPDATE`) โดยไม่เพิ่ม infrastructure ใหม่

## Considered Options

### Option A — Application-level check โดยไม่มี lock

ข้อดี: ง่ายที่สุด ไม่ต้องเข้าใจ transaction isolation
ข้อเสีย: มี race window ระหว่างการอ่านสถานะกับการเขียน — สอง request ที่อ่าน
สถานะ "ยังไม่ได้ assign" พร้อมกันจะเขียนทับกันได้ ขัดกับ BR-ASSIGN-001 โดยตรง

### Option B — Optimistic concurrency เพียงอย่างเดียว (version column)

ข้อดี: ไม่ต้อง lock แถวขณะอ่าน, throughput สูงกว่าในทางทฤษฎีเมื่อ contention
ต่ำ
ข้อเสีย: ต้องเพิ่ม version column และเขียน retry logic ในชั้น client/service
เมื่อชนกัน, ยังมี window ที่สอง transaction อ่าน version เดียวกันได้ก่อนที่
ฝ่ายใดฝ่ายหนึ่งจะ commit — ต้องพึ่ง unique constraint แยกต่างหากเพื่อปิด
ช่องว่างนี้จริง ๆ (ในทางปฏิบัติจึงมักใช้ร่วมกับ Option C มากกว่าใช้แทน)

### Option C — Pessimistic row lock (`SELECT ... FOR UPDATE`) ร่วมกับ database
constraint และ stale-write precondition ที่ชัดเจน (ตัวเลือกที่ยอมรับ)

ข้อดี: ปิด race window ได้แน่นอนเพราะ transaction ที่สองต้องรอจน transaction
แรก commit/rollback ก่อนจึงจะอ่านสถานะต่อได้, ใช้ความสามารถของ
PostgreSQL/Prisma ที่มีอยู่แล้วโดยตรง, ทดสอบง่ายด้วย `Promise.all` กับ
ฐานข้อมูลจริงเพราะพฤติกรรมเป็น deterministic
ข้อเสีย: transaction ที่สองต้องรอ (blocking) จนกว่า transaction แรกจะจบ —
ลด throughput ในสถานการณ์ contention สูงบน Task เดียวกัน (ไม่ใช่ปัญหาจริงใน
scale ปัจจุบันของ Dispatch ที่ Dispatcher มักไม่แก้ Task เดียวกันพร้อมกัน)

## Decision

ทุก command ที่เปลี่ยนสถานะหรือ current-record ของ `DeliveryTask`
(`TasksService.submit`, `PreparationService` transitions,
`AssignmentService.assign`/`reassign`) ล็อกแถว `delivery_tasks` ด้วย
`SELECT "id" FROM "delivery_tasks" WHERE "id" = ... FOR UPDATE` ภายใน Prisma
interactive transaction (`prisma.$transaction`) **ก่อน**อ่านสถานะปัจจุบันหรือ
current-assignment pointer เสมอ — ทุก transaction ที่พยายามแก้ Task เดียวกัน
พร้อมกันจึง serialize ต่อกันโดยอัตโนมัติที่ระดับฐานข้อมูล

Database constraint เป็นด่านสำรองที่เป็นอิสระจาก row lock:
`task_current_assignments` มี primary key บน `taskId` เพียงคอลัมน์เดียว —
การพยายามสร้าง current-assignment pointer ที่สองสำหรับ Task เดียวกันจะชน
`P2002` unique-constraint violation ที่ service ดักจับแล้วแปลงเป็น HTTP 409
`TASK_ALREADY_ASSIGNED` เสมอ ไม่เคยรั่วไหลเป็น raw database error

สำหรับ reassignment ซึ่งเป็นปฏิบัติการที่ actor กระทำโดยอ้างอิง
current-assignment ที่ตนเห็นล่าสุด `AssignmentService.reassign` รับ
`expectedCurrentAssignmentId` จาก client แล้วเปรียบเทียบกับค่า
`currentAssignmentId` จริงที่อ่านได้ **ภายใต้ row lock เดียวกัน** — หากไม่ตรง
กันจะคืนผลลัพธ์ `STALE` ทันทีโดยไม่เขียนอะไรเลย แล้ว controller แปลงเป็น
HTTP 409 พร้อม `code: "STALE_ASSIGNMENT"` — precondition นี้เป็นกลไกแบบ
optimistic ที่ **เสริม** row lock ไม่ใช่แทนที่: row lock ปิด race window ของ
การเขียนพร้อมกัน ส่วน precondition ปฏิเสธการเขียนที่ actor เห็นข้อมูลเก่า
(เช่น แท็บ browser ที่ค้างอยู่) แม้ว่าจะไม่มี concurrent request ในขณะนั้นเลย
ก็ตาม

## Consequences

### Positive

- ไม่มี double-assignment เกิดขึ้นได้จริงในทางปฏิบัติ — พิสูจน์ได้ด้วย
  integration test ที่ยิง request คู่ขนานจริงกับฐานข้อมูล PostgreSQL
- Conflict ทุกกรณีคืนผลลัพธ์ deterministic (409 พร้อม error code ที่ชัดเจน:
  `TASK_ALREADY_ASSIGNED` หรือ `STALE_ASSIGNMENT`) — client เขียน retry/refresh
  logic ได้ง่ายและคาดเดาผลได้
- Failed command ไม่ทิ้ง partial history — เพราะทุกอย่าง (สถานะ, assignment
  record, current pointer, TaskEvent) เขียนในทรานแซคชันเดียวกัน หาก guard
  ล้มเหลวจะ return ก่อนเขียนใด ๆ

### Negative

- Transaction ที่สองต้องรอจน transaction แรก commit/rollback — เป็นการ
  blocking ไม่ใช่ non-blocking concurrency ลด throughput เมื่อมีหลาย request
  พยายามแก้ Task เดียวกันพร้อมกันในปริมาณสูง (ไม่ใช่ profile การใช้งานปัจจุบัน
  ของ Dispatch แต่เป็นข้อจำกัดที่ต้องพิจารณาหาก scale เปลี่ยน)
- ทุก transition ต้องเขียน pattern เดิมซ้ำ (`lockTask` helper) ในหลาย service
  แยกกัน (`assignment.service.ts`, `preparation.service.ts`,
  repository ของ `tasks`) — ไม่มี abstraction กลางที่บังคับ pattern นี้ระดับ
  framework จึงต้องพึ่งวินัยของทีมและ code review

### Operational Consequences

- Long-running transaction ที่ถือ row lock ไว้นานผิดปกติ (เช่น เพราะ external
  call ภายใน transaction) จะ block operation อื่นบน Task เดียวกันได้ —
  ปัจจุบัน transaction เหล่านี้ทำเฉพาะ database operation ภายใน ไม่มี external
  call ระหว่างถือ lock

### Security and Privacy Consequences

- Error response ของ conflict (409) ไม่เปิดเผยข้อมูลของ assignment
  ที่ actor ไม่มีสิทธิ์เห็น — ส่งเฉพาะ code และข้อความทั่วไป

### Testing Consequences

- ต้องมี concurrency test ที่ยิง `Promise.all` กับฐานข้อมูล PostgreSQL จริง
  ไม่ใช่ mock เพื่อพิสูจน์พฤติกรรมของ row lock จริง — เพิ่มความซับซ้อนและเวลา
  รันของชุดทดสอบเทียบกับ unit test ทั่วไป
- ผลลัพธ์ที่ยืนยันความถูกต้อง (winner/loser, ไม่มี residue) ต้องพิสูจน์ผ่าน
  ผลลัพธ์ deterministic ของ transaction เอง ไม่ใช่การเดาจากระยะเวลาที่รอคงที่
  — test ที่ต้องการบังคับลำดับการแข่งขัน (เช่น
  `apps/api/test/assignment.integration-spec.ts` ฟังก์ชัน
  `waitForBlockedTaskLocks`) poll สถานะ lock จริงจาก `pg_stat_activity`
  ภายใต้ deadline ที่จำกัด (5 วินาที) แทนการ sleep คงที่แล้วสมมติว่า race
  เกิดขึ้นแล้ว — เป็นการรอสัญญาณที่ตรวจสอบได้จริงจากฐานข้อมูล ไม่ใช่การเดา
  เวลา

## Implementation Constraints

- ทุก command ที่เปลี่ยนสถานะหรือ current-record ของ `DeliveryTask` ต้องล็อก
  แถว `delivery_tasks` ด้วย `SELECT ... FOR UPDATE` ก่อนอ่านสถานะที่ใช้
  ตัดสินใจ ไม่มีข้อยกเว้น
- Invariant ที่สำคัญ (เช่น one-current-assignment) ต้องมี database constraint
  เป็นด่านสำรองที่เป็นอิสระจาก row lock เสมอ (ดู
  [ADR-0002](ADR-0002-postgresql-prisma-and-forward-only-migrations.md))
- Operation ที่ actor อ้างอิง current-record ที่ตนเห็นล่าสุด (เช่น
  reassignment) ต้องมี stale-write precondition ที่ตรวจสอบภายใต้ lock
  เดียวกันกับที่เขียน
- ห้ามใช้ sleep คงที่ (fixed sleep) เป็นกลไกยืนยัน correctness — การรอ
  สถานการณ์แข่งขันในเทสต์ต้อง poll สัญญาณที่ตรวจสอบได้จริง (เช่น
  `pg_stat_activity`) ภายใต้ deadline ที่จำกัดเสมอ ไม่ใช่ประมาณเวลาคงที่
- Error response ของ conflict ต้องเป็น HTTP 409 พร้อม error code ที่ระบุ
  ชัดเจน ไม่ใช่ raw database error message

## Repository Evidence

**Decision evidence**
- Dispatch Knowledge Topic 11 หมวด 8.3 (Concurrency Risks), หมวด 8.4
  (Idempotency Requirements) — หมายเหตุ: หมวด 8.3 เสนอแนวคิด "optimistic
  locking บน DeliveryTask version" ในระดับสถาปัตยกรรมเชิงแนวคิด แต่สิ่งที่
  implement จริงคือ pessimistic row lock ร่วมกับ stale-write precondition
  แบบ explicit-id (ไม่มี version column ใน schema จริง) — ADR นี้บันทึกสิ่งที่
  ถูก implement จริง ไม่ใช่ข้อเสนอเดิมใน Topic 11

**Implementation evidence**
- `apps/api/src/assignment/assignment.service.ts` — ฟังก์ชัน `lockTask`
  (`SELECT "id" FROM "delivery_tasks" ... FOR UPDATE`), เมธอด `assign` และ
  `reassign` (การอ่าน `TaskCurrentAssignment` ภายใต้ lock, การเปรียบเทียบ
  `expectedCurrentAssignmentId`), ฟังก์ชัน `translateUniqueConstraintConflict`
  (แปลง Prisma `P2002` เป็น `ConflictException`)
- `apps/api/src/preparation/preparation.service.ts` — pattern เดียวกัน
  (`$queryRaw` ... `FOR UPDATE` บน `delivery_tasks` และ
  `preparation_correction_records`)
- `apps/api/src/infrastructure/database/repositories/prisma-delivery-task.repository.ts`
  — เมธอด `lockTaskRow` ที่ใช้ pattern เดียวกันสำหรับ `updateDraft`/`submit`
  (MVP-02 remediation)
- `apps/api/prisma/migrations/20260723160000_delivery_task_assignment/migration.sql`
  — `task_current_assignments_pkey` บน `task_id` (database-level backstop)

**Test evidence**
- `apps/api/test/assignment.integration-spec.ts` — test suite
  "MVP-04 assignment — database integration and concurrency" มีเคส "allows
  exactly one of two concurrent initial assignments to succeed, with no
  duplicate current assignment or event" และ "rejects a concurrent stale
  reassignment racing against a winning reassignment, with no residue from
  the loser" ทั้งสองใช้ `Promise.all` ยิง request คู่ขนานกับฐานข้อมูลจริง

**Governance evidence**
- `README.md` หัวข้อ "Delivery Task Assignment (MVP-04)" — อธิบาย
  `SELECT ... FOR UPDATE` และ `TaskCurrentAssignment` primary key ตรงกับ
  โค้ดจริง
- Dispatch Knowledge `11 - Technical Architecture...md` หมายเหตุ
  synchronization pass 5 (MVP-02 remediation, 2026-07-23) — ยืนยันวันที่
  row lock บน `DeliveryTask` เริ่มมีผลจริง

## Open Follow-ups

- BDR-ASSIGN-004 (multiple active tasks per employee) ไม่ต้องการ hard block
  ที่ระดับ concurrency — workload count เป็นเพียงคำเตือน ADR นี้ไม่เพิ่ม lock
  ใด ๆ ที่ขัดกับการตัดสินใจทางธุรกิจนี้
- Concurrency guard ของ transition ในอนาคต (Delivery Attempt, Return,
  Reopen, Override — MVP-05 ขึ้นไป) ยังไม่ implement — คาดว่าจะใช้ pattern
  เดียวกัน แต่ยังไม่มีหลักฐานในโค้ดปัจจุบัน

## Review Triggers

- ต้องรองรับ distributed write ข้ามฐานข้อมูล/บริการมากกว่าหนึ่งตัว
- เปลี่ยนไปใช้ asynchronous command processing (message queue)
- Contention บน Task เดียวกันสูงถึงระดับที่ pessimistic lock กลายเป็น
  bottleneck ที่วัดผลได้จริง
- ย้ายออกจาก PostgreSQL
- นำ event sourcing เข้ามาแทนที่ current-state row
- Transaction latency สูงถึงระดับที่กระทบ operational acceptability

## References

- Dispatch Knowledge `11 - Technical Architecture และแผนพัฒนา MVP.md` หมวด
  8.3, 8.4
- `docs/CTO_SUMMARY_MVP_02.md` (remediation), `docs/CTO_SUMMARY_MVP_04.md`
- [ADR-0002](ADR-0002-postgresql-prisma-and-forward-only-migrations.md)
- [ADR-0003](ADR-0003-delivery-task-state-machine.md)
