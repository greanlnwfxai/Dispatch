# ADR-0006: RBAC and Server-Side Record Scope

- **Status:** Accepted
- **Record Type:** Backfilled ADR
- **Date Recorded:** 2026-07-24
- **Effective Since:** AUTH-001 (RolesGuard/JwtAuthenticationGuard foundation) ต่อเนื่องถึง MVP-04 (record-scope 404 บน `/assigned-tasks`)
- **Decision Owners:** Architecture, Engineering; Security/Privacy Review
- **Related BDRs:** BDR-PRIVACY-001 Option B (ไม่มี Role ใหม่สำหรับ Security/Privacy Review)
- **Related TDRs:** TDR-AUTH-001
- **Related Milestones:** AUTH-001, MVP-02, MVP-03, MVP-04
- **Supersedes:** None
- **Superseded By:** None

## Context

Dispatch มี 6 Role ที่มีบัญชีผู้ใช้งาน (Super Admin, Admin, Dispatcher,
Stock, Internal Delivery Employee, Management/Auditor — Dispatch Knowledge
Topic 03) แต่ละ Role มีสิทธิ์ต่างกันทั้งในระดับ "ทำ action นี้ได้หรือไม่"
(role permission) และ "เห็น record นี้ได้หรือไม่" (record scope) — ตัวอย่าง
ที่ชัดเจนที่สุดคือ Internal Delivery Employee ที่ควรเห็นเฉพาะ Task ที่ตนเป็น
primary assignee เท่านั้น ไม่ใช่ Task ทั้งหมดในระบบ แม้ Employee คนนั้นจะถูก
บันทึกเป็น supporting employee ของ Task อื่นก็ตาม (BDR-ASSIGN-002 — supporting
employee เป็นข้อมูลประกอบเท่านั้น ไม่ได้รับสิทธิ์เข้าถึง Task) การซ่อนปุ่มใน
UI ไม่ใช่กลไกความปลอดภัยที่แท้จริง เพราะ client สามารถเรียก API ตรงได้เสมอ —
ต้องมีการบังคับสิทธิ์ทั้งสองมิติที่ server เท่านั้น

## Decision Drivers

- Least privilege — แต่ละ Role เข้าถึงเฉพาะสิ่งที่จำเป็นต่อหน้าที่
- ป้องกัน IDOR (Insecure Direct Object Reference) — การเดา/ระบุ Task ID
  ตรง ๆ ต้องไม่เปิดเผยข้อมูลที่ผู้ใช้ไม่มีสิทธิ์เห็น
- รองรับ multi-role operation และ separation of duties (เช่น Stock รายงาน
  แต่ Admin ยืนยัน)
- ความเป็นส่วนตัวของข้อมูล (privacy) — response ต้องไม่รั่วไหล field ที่ไม่
  จำเป็นต่อ use case
- ความสม่ำเสมอระหว่าง Admin Web และ Mobile/PWA — กฎเดียวกันไม่ว่าจะเรียกจาก
  surface ไหน
- การป้องกัน direct URL/API access ต้องเทียบเท่ากับการป้องกันผ่าน UI

## Considered Options

### Option A — ตรวจสอบสิทธิ์เฉพาะฝั่ง frontend (frontend-only role check)

ข้อดี: UX ตอบสนองเร็ว ซ่อน/แสดงองค์ประกอบ UI ได้ทันที
ข้อเสีย: ไม่ใช่การควบคุมความปลอดภัยจริง — request ตรงไปยัง API (ผ่าน
DevTools, curl, หรือ script) จะข้ามการตรวจสอบนี้ได้เสมอ

### Option B — Route-level RBAC เท่านั้น (role permission แต่ไม่มี record
scope)

ข้อดี: ป้องกันได้ว่า Role ใดทำ action ประเภทใดได้บ้าง implement ง่ายกว่า
ข้อเสีย: ไม่ป้องกัน IDOR — Internal Delivery Employee ที่มีสิทธิ์เรียก
`GET /assigned-tasks/:id` ตาม role จะเห็น Task ของพนักงานคนอื่นได้หากระบบไม่
กรองด้วยตัวตนของผู้เรียกเพิ่มเติม

### Option C — Server-side RBAC ร่วมกับ record-scope filtering และ privacy
rule (ตัวเลือกที่ยอมรับ)

ข้อดี: ปิดทั้งสองช่องโหว่พร้อมกัน — role permission ปฏิเสธที่ระดับ route,
record scope กรองที่ระดับ query, privacy rule จำกัด field ที่ response คืน
กลับ
ข้อเสีย: เพิ่มความซับซ้อนของ query — record-scope filter ต้องอยู่ใน query
เดียวกับการดึงข้อมูล (fetch-then-check เสี่ยงต่อ time-of-check-to-time-of-use
gap) ทำให้ต้องออกแบบ query อย่างระมัดระวังกว่า route-level check ล้วน ๆ

## Decision

Authorization ของ Dispatch แบ่งเป็นสองชั้นที่ตรวจสอบแยกกันเสมอ ทั้งคู่บังคับ
ที่ server เท่านั้น ไม่เคยพึ่งพา client:

1. **Role permission** — `JwtAuthenticationGuard` (ลงทะเบียนแบบ global ผ่าน
   `APP_GUARD` ใน `apps/api/src/auth/auth.module.ts`) ยืนยันตัวตนและ resolve
   role code ของผู้ใช้ **จาก PostgreSQL ในทุกคำขอ** ไม่ใช่จาก JWT claim —
   ตามด้วย `RolesGuard` (`@UseGuards(RolesGuard)` + `@Roles(...)` ต่อ route)
   ที่ปฏิเสธคำขอด้วย 403 หาก role ของผู้ใช้ไม่อยู่ในรายการที่ route กำหนด
   Route เดียวที่ยกเว้น (`@Public()`) มีเฉพาะ health endpoint และ
   `/auth/login`, `/auth/refresh`, `/auth/logout` (จำเป็นก่อนมี session)
2. **Record scope** — ตรวจสอบแยกต่างหากจาก role permission ที่ query ระดับ
   service เช่น `AssignmentService.getMyAssignedTaskDetail` กรองด้วย
   `WHERE taskId = ... AND primaryAssigneeUserId = principalUserId` **ใน
   query เดียวกัน** ไม่ใช่ fetch-then-check — พนักงานที่เป็นเพียง supporting
   employee หรือไม่เกี่ยวข้องกับ Task เลยได้รับ **HTTP 404 เดียวกันกับ Task
   ที่ไม่มีอยู่จริง** ไม่ใช่ 403 (ป้องกัน record-existence leakage —
   BR-SECURITY-004)

Response DTO คืนเฉพาะ field ที่จำเป็นต่อ use case เท่านั้น — เช่น
`AssignmentCandidateDto` คืนเฉพาะ `userId`, `displayName`, `activeTaskCount`
ไม่มี credential, token, หรือ session ใด ๆ ปะปนมา Role permission และ record
scope เป็นการตรวจสอบคนละชั้นที่ทำงานร่วมกันเสมอ ไม่ใช่แทนที่กัน

## Consequences

### Positive

- Direct URL/API access ถูกป้องกันเท่ากับการเข้าผ่าน UI ปกติ — ไม่มีทางลัด
  ผ่านการยิง request ตรง
- Record-scope 404 ป้องกันไม่ให้ผู้โจมตี distinguish ระหว่าง "Task ไม่มีอยู่"
  กับ "Task มีอยู่แต่ไม่มีสิทธิ์" — ลดพื้นผิวการโจมตีแบบ enumeration
- Role resolution จาก PostgreSQL ทุกคำขอทำให้การ revoke สิทธิ์ (เช่น ปิด
  บัญชี, เปลี่ยน role) มีผลทันทีในคำขอถัดไป โดยไม่ต้องรอ JWT หมดอายุ

### Negative

- Query ที่ต้อง filter ด้วย record scope ซับซ้อนกว่าการ fetch แล้วเช็คสิทธิ์
  ภายหลัง — นักพัฒนาต้องระวังไม่ให้เขียน query ที่ดึงข้อมูลมาก่อนแล้วค่อยกรอง
  (fetch-then-check) เพราะเปิดช่องให้เกิด time-of-check-to-time-of-use gap
  ได้ในทางทฤษฎี
- Role resolution จากฐานข้อมูลทุกคำขอเพิ่ม query ต่อ request หนึ่งครั้ง
  เทียบกับการอ่านจาก JWT claim โดยตรง (ยอมรับ trade-off นี้เพื่อแลกกับการ
  revoke ทันที)
- การทดสอบต้องครอบคลุมทั้งสองมิติแยกกัน (role 401/403 และ record-scope 404)
  ต่อทุก endpoint — เพิ่มจำนวน test case เทียบกับระบบที่ตรวจสอบเพียงมิติเดียว

### Operational Consequences

- ทุก route ใหม่ต้องพิจารณาทั้งสองมิติตั้งแต่ออกแบบ — ไม่มี default ที่
  "อนุญาตทุกอย่าง" หากลืมใส่ guard (ทุก route อยู่ภายใต้
  `JwtAuthenticationGuard` แบบ global อยู่แล้ว ยกเว้นระบุ `@Public()` อย่าง
  จงใจ)

### Security and Privacy Consequences

- ไม่มี Role ใหม่ถูกสร้างสำหรับ "Security/Privacy Review" ตาม BDR-PRIVACY-001
  Option B — governance function ดำเนินการผ่าน Admin/Super Admin ภายใต้
  policy ที่มีอยู่ ไม่ใช่บัญชีผู้ใช้งานประเภทใหม่ (ยังไม่ implement ในขอบเขต
  MVP-04)
- Password hash, token, session record ไม่เคยปรากฏใน response DTO ใด ๆ —
  ตรวจสอบแล้วใน `AssignmentCandidateDto` และ DTO อื่นที่เกี่ยวข้องกับผู้ใช้
- Error message ของ role-permission failure เป็นข้อความทั่วไป
  ("Insufficient role for this operation.") ไม่เปิดเผยว่า route ต้องการ role
  ใดบ้าง

### Testing Consequences

- ต้องมี test แยกสำหรับ 401 (ไม่ authenticate), 403 (role ไม่พอ), และ 404
  (record scope ไม่ตรง) ต่อทุก endpoint ที่มี record scope — ไม่ใช่แค่ 200 vs
  error เดียว
- Guard test (`roles.guard.spec.ts`, `jwt-authentication.guard.spec.ts`)
  ต้องแยกจาก integration test ที่ยืนยันพฤติกรรม record-scope จริงกับ
  ฐานข้อมูล

## Implementation Constraints

- ทุก route ที่ไม่ใช่ health endpoint ต้องอยู่ภายใต้ `JwtAuthenticationGuard`
  (global) — การยกเว้นด้วย `@Public()` ต้องพิจารณาเป็นกรณีพิเศษเท่านั้น
  (pre-authentication endpoint)
- Role ต้อง resolve จากฐานข้อมูลทุกคำขอ ห้ามอ่านจาก JWT claim โดยตรง
- Record-scope filter ต้องอยู่ใน query เดียวกับการดึงข้อมูล ไม่ใช่
  fetch-then-check แยกขั้นตอน
- Endpoint ที่ record ไม่พบ**หรือ**ผู้ใช้ไม่มีสิทธิ์เข้าถึง ต้องตอบกลับด้วย
  code เดียวกัน (404) เมื่อการเปิดเผยความแตกต่างจะรั่วไหลข้อมูลการมีอยู่ของ
  record
- Response DTO ต้องคืนเฉพาะ field ที่จำเป็นต่อ use case — ห้ามคืน
  passwordHash, token, session, หรือ Prisma internal object ตรง ๆ
- ห้ามสร้าง Role ใหม่สำหรับ "Security/Privacy Review" (BDR-PRIVACY-001
  Option B)

## Repository Evidence

**Decision evidence**
- Dispatch Knowledge Topic 11 หมวด 10.1 (Guard 6 ชั้น), หมวด 10.3 (Role ×
  Guard table), หมวด 14 (Privacy Architecture)

**Implementation evidence**
- `apps/api/src/auth/auth.module.ts` — `{ provide: APP_GUARD, useClass:
  JwtAuthenticationGuard }`
- `apps/api/src/auth/guards/jwt-authentication.guard.ts` — resolve
  `roleCodes` ผ่าน `roleAssignmentRepository.listRoleCodesForUser(user.id)`
  ทุกคำขอ, `@Public()` decorator สำหรับ pre-auth route
- `apps/api/src/auth/guards/roles.guard.ts` — doc-comment "Authorizes
  against the principal JwtAuthenticationGuard already resolved from
  PostgreSQL — never against client-supplied or JWT-claimed role data"
- `apps/api/src/auth/auth.controller.ts`,
  `apps/api/src/health/health.controller.ts` — ตำแหน่งเดียวที่ใช้
  `@Public()`
- `apps/api/src/assignment/assignment.controller.ts` — `@UseGuards(RolesGuard)`
  + `@Roles(...ASSIGNMENT_READ_ROLES/WRITE_ROLES/ASSIGNED_EMPLOYEE_ROLES)`
  ทุก route
- `apps/api/src/assignment/assignment.service.ts` เมธอด
  `getMyAssignedTaskDetail` — doc-comment "a supporting-only or unrelated
  employee gets exactly the same 404 as a nonexistent Task id — record scope
  is enforced at the query, not by fetch-then-check", query filter
  `where: { taskId, primaryAssigneeUserId: principalUserId }`
- `apps/api/src/assignment/assignment.service.ts` type `AssignmentCandidateDto`
  ที่ map เฉพาะ `userId`, `displayName`, `activeTaskCount`

**Test evidence**
- `apps/api/src/auth/guards/roles.guard.spec.ts`,
  `apps/api/src/auth/guards/jwt-authentication.guard.spec.ts`
- `apps/api/test/assignment.integration-spec.ts` — ทดสอบ RBAC 401/403/404
  รวม record-scope 404 สำหรับ supporting-only/unrelated employee

**Governance evidence**
- `CLAUDE.md` §12 ("RolesGuard + @Roles(...) resolve authorization from
  PostgreSQL per-request, never from JWT/client-supplied role claims")
- `README.md` หัวข้อ "Delivery Task Assignment (MVP-04)" — ยืนยัน record-scope
  404 behavior ตรงกับโค้ดจริง

## Open Follow-ups

- Formal Investigation Access (unmasked access ภายใต้ Case Reference,
  BDR-PRIVACY-001) ยังไม่ implement — MVP-19 ตาม Implementation Roadmap
- Field-level masking (เช่น การซ่อนเบอร์โทรผู้รับสินค้าบางส่วน) ยังไม่มี
  หลักฐาน implementation ในขอบเขต MVP-04
- User/Role-management UI ยังไม่ implement (CLAUDE.md §7)

## Review Triggers

- ต้องรองรับ tenant isolation ข้ามลูกค้าองค์กร
- นำ attribute-based access control (ABAC) เข้ามาแทน/เสริม RBAC ปัจจุบัน
- เปิดให้ External Courier หรือ Customer มี authenticated identity ของตนเอง
- ต้องรองรับ delegated authority (มอบอำนาจชั่วคราวข้าม Role)
- ขยาย field-level authorization ให้ซับซ้อนกว่าการเลือก field ใน DTO
- นำ centralized policy engine เข้ามาแทนที่ guard แบบกระจายในแต่ละ controller

## References

- Dispatch Knowledge `11 - Technical Architecture และแผนพัฒนา MVP.md` หมวด
  10, 14
- `docs/CTO_SUMMARY_AUTH_001.md`, `docs/CTO_SUMMARY_MVP_04.md`
- `docs/SECURITY_HARNESS.md`
- [ADR-0001](ADR-0001-application-architecture-and-workspace-boundaries.md)
- [ADR-0005](ADR-0005-immutable-operational-history-and-audit-trail.md)
