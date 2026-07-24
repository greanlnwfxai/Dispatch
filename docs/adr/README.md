# Architecture Decision Records (ADR) — Dispatch

เอกสารนี้กำหนดนโยบายของ Architecture Decision Record (ADR) สำหรับโปรเจกต์
Dispatch — วิธีสร้าง วิธีอ่าน สถานะที่อนุญาต และขอบเขตอำนาจของ ADR เทียบกับ
เอกสารประเภทอื่นในระบบ

## 1. วัตถุประสงค์ของ ADR และความสัมพันธ์กับเอกสารประเภทอื่น

Dispatch มีเอกสารกำกับดูแลหลายประเภทที่ตอบคำถามต่างกัน อย่าใช้ประเภทหนึ่ง
แทนอีกประเภทหนึ่ง:

| ประเภทเอกสาร | ตอบคำถาม | อยู่ที่ | อำนาจ |
| --- | --- | --- | --- |
| **BDR** (Business Decision Register) | ธุรกิจตัดสินใจอะไร (นโยบาย, กฎการทำงาน, ขอบเขต MVP) | `Dispatch Knowledge/07 - ขอบเขต MVP และทะเบียนการตัดสินใจทางธุรกิจ.md` | Product Owner / User เท่านั้น |
| **TDR** (Technical Decision Register) | ตัวเลือกทางเทคนิคที่ยังไม่ตกผลึกเป็นสถาปัตยกรรม (framework, storage provider ฯลฯ) ระหว่างที่ยังเปิดอยู่ | `Dispatch Knowledge/11 - Technical Architecture และแผนพัฒนา MVP.md` หมวด 22 | Product Owner (อนุมัติ) / Technical Architecture (วิเคราะห์) |
| **ADR** (Architecture Decision Record — เอกสารนี้) | ทำไมสถาปัตยกรรมทางเทคนิคจึงถูกเลือกแบบนี้ และอะไรคือสิ่งที่ implementation ในอนาคตต้องรักษาไว้ | `docs/adr/` | Architecture / Engineering ภายใต้ขอบเขตธุรกิจที่ BDR อนุมัติแล้ว |
| **CTO Summary** | สิ่งที่ถูก implement จริงในแต่ละ milestone และผลการ verify | `docs/CTO_SUMMARY_<TASK_ID>.md` | Engineering (บันทึกการส่งมอบ ไม่ใช่การอนุมัติ) |
| **Runbook** | ขั้นตอนปฏิบัติการ (operational procedure) เช่นการ deploy, restore | future `docs/runbooks/` | Engineering / Operations |

กล่าวโดยสรุป: **BDR ตัดสินใจว่า "ระบบต้องทำอะไร" ส่วน ADR บันทึกว่า "ทำไมจึง
สร้างด้วยสถาปัตยกรรมนี้" — ADR ไม่เคยเป็นผู้ตัดสินใจ BDR แทน**

## 2. ค่าสถานะ (Status) ที่อนุญาต

ADR แต่ละฉบับมีสถานะเป็นหนึ่งในสี่ค่านี้เท่านั้น:

- **Proposed** — ร่างที่ยังไม่ถูกยอมรับเป็นสถาปัตยกรรมที่ใช้งานจริง
- **Accepted** — สถาปัตยกรรมที่ได้รับการยอมรับและมีผลบังคับใช้
- **Deprecated** — ไม่แนะนำให้ใช้ต่อ แต่ยังไม่มี ADR ใหม่มาแทนที่โดยตรง
- **Superseded** — ถูกแทนที่ด้วย ADR ฉบับใหม่ที่ระบุไว้ชัดเจนใน field `Superseded By`

## 3. ADR ที่ backfill (Backfilled ADR)

ADR-0001 ถึง ADR-0007 ในชุดแรกนี้ถูกสร้าง **หลังจาก** สถาปัตยกรรมถูก
implement ไปแล้วผ่าน milestone DEV-FOUNDATION-001 ถึง MVP-04 — ไม่ใช่เอกสาร
ที่มีอยู่ก่อนการ implement เอกสารเหล่านี้ต้องระบุอย่างตรงไปตรงมาว่าเป็นการ
บันทึกย้อนหลัง โดยใช้:

- `Record Type: Backfilled ADR`
- `Date Recorded: 2026-07-24` (วันที่จัดทำเอกสารฉบับนี้จริง)
- `Effective Since: <milestone>` — milestone แรกที่หลักฐานใน repository ยืนยัน
  ว่าการตัดสินใจนี้มีผลบังคับใช้จริง (ไม่ใช่วันที่เขียน ADR)

ห้ามเขียนหรือบอกเป็นนัยว่า ADR ฉบับ backfill มีอยู่ก่อนการ implement จริง

## 4. ความไม่เปลี่ยนแปลงของ ADR (ADR Immutability)

- เมื่อ ADR มีสถานะ `Accepted` แล้ว **ห้ามแก้ไขเนื้อหาเพื่อซ่อนการเปลี่ยนแปลง
  สถาปัตยกรรมในภายหลัง**
- อนุญาตเฉพาะการแก้ไขเล็กน้อย: typo, การจัดรูปแบบ (formatting), ลิงก์ที่เสีย
- การเปลี่ยนแปลงสถาปัตยกรรมที่มีนัยสำคัญ (material change) ต้องสร้าง **ADR
  ฉบับใหม่** ที่:
  - ระบุ `Supersedes: ADR-NNNN` (ฉบับเดิม)
  - ฉบับเดิมถูกแก้ไข **เฉพาะ** ให้เปลี่ยนสถานะเป็น `Superseded` และเพิ่ม
    `Superseded By: ADR-MMMM` — ไม่ลบหรือเขียนทับเนื้อหาการวิเคราะห์เดิม

## 5. เมื่อใดต้องสร้าง ADR

สร้าง ADR เมื่อการตัดสินใจ:

- ส่งผลกระทบข้าม module หรือข้าม application มากกว่าหนึ่งจุด
- ย้อนกลับยาก (expensive/risky to reverse)
- กระทบ data integrity, migration, security, privacy, audit, concurrency,
  storage, หรือ workflow
- มีทางเลือกทางสถาปัตยกรรมที่สมเหตุสมผลมากกว่าหนึ่งทาง
- ผู้ดูแลระบบในอนาคตมีแนวโน้มจะถามว่า "ทำไมระบบถึงทำงานแบบนี้"

## 6. เมื่อใดไม่ต้องสร้าง ADR

- การเปลี่ยนถ้อยคำ (copy changes)
- การเปลี่ยน CSS/layout
- การแก้บั๊กเฉพาะจุด (isolated bug fix) ที่ไม่เปลี่ยนสถาปัตยกรรม
- การตั้งชื่อ route ที่ไม่มีผลกระทบเชิงสถาปัตยกรรม
- รายละเอียด implementation ภายในที่ reversible ในระดับ local
- กฎธุรกิจที่ถูกบันทึกครบถ้วนอยู่แล้วใน BDR (ไม่ต้องซ้ำใน ADR)
- การอัปเกรด dependency ตามปกติที่ไม่เปลี่ยนสถาปัตยกรรม

## 7. ขอบเขตอำนาจ (Approval Boundary)

- Engineering สามารถร่าง ADR โดยอิงจากสถาปัตยกรรมที่ได้รับอนุมัติแล้วเท่านั้น
- ADR **ต้องไม่**อนุมัติหรือแก้ไข Business Decision ใด ๆ
- Open BDR และ Open TDR ต้องคงสถานะเปิดอยู่ต่อไป เว้นแต่จะได้รับการอนุมัติผ่าน
  กระบวนการของตนเองในที่อื่น (Topic 07 สำหรับ BDR, Topic 11 หมวด 22 สำหรับ
  TDR)
- นโยบายและการตัดสินใจทางธุรกิจยังคงมีอำนาจสูงสุดอยู่ที่ BDR register เสมอ —
  ADR ไม่ใช่ช่องทางสำรองในการปิด Open Business Decision

## 8. ดัชนี ADR (ADR Index)

| ADR ID | Title | Status | Record Type | Effective Milestones | Related BDR/TDR | Supersedes | Superseded By |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [ADR-0001](ADR-0001-application-architecture-and-workspace-boundaries.md) | Application Architecture and Workspace Boundaries | Accepted | Backfilled ADR | DEV-FOUNDATION-001 – MVP-04 | TDR-REPO-001, TDR-WEB-001, TDR-MOBILE-001, TDR-API-001 | — | — |
| [ADR-0002](ADR-0002-postgresql-prisma-and-forward-only-migrations.md) | PostgreSQL, Prisma, and Forward-Only Migrations | Accepted | Backfilled ADR | DEV-FOUNDATION-002 – MVP-04 | TDR-DATABASE-001, TDR-ORM-001 | — | — |
| [ADR-0003](ADR-0003-delivery-task-state-machine.md) | Delivery Task State Machine | Accepted | Backfilled ADR | MVP-02 – MVP-04 | Topic 04 (Main Task Status), BDR-ASSIGN-001–005 | — | — |
| [ADR-0004](ADR-0004-task-row-locking-and-concurrency-control.md) | Task Row Locking and Concurrency Control | Accepted | Backfilled ADR | MVP-02 remediation – MVP-04 | BDR-ASSIGN-004, BDR-ASSIGN-005 | — | — |
| [ADR-0005](ADR-0005-immutable-operational-history-and-audit-trail.md) | Immutable Operational History and Audit Trail | Accepted | Backfilled ADR | MVP-02 remediation – MVP-04 | BDR-ASSIGN-003, BDR-ASSIGN-005, BR-AUDIT-001–007 | — | — |
| [ADR-0006](ADR-0006-rbac-and-server-side-record-scope.md) | RBAC and Server-Side Record Scope | Accepted | Backfilled ADR | AUTH-001 – MVP-04 | BDR-PRIVACY-001, BR-SECURITY-004 | — | — |
| [ADR-0007](ADR-0007-private-evidence-storage-abstraction.md) | Private Evidence Storage Abstraction | Accepted | Backfilled ADR | MVP-03 – MVP-04 | TDR-STORAGE-001 | — | — |

## 9. วิธีสร้าง ADR ฉบับใหม่

1. คัดลอก [`ADR-TEMPLATE.md`](ADR-TEMPLATE.md) ไปเป็น
   `ADR-NNNN-<kebab-case-title>.md` โดย `NNNN` เป็นเลขถัดไปที่ยังไม่ถูกใช้
2. กรอกทุก field ใน metadata block และทุก section ตามคำอธิบายในเทมเพลต
3. เพิ่มแถวใหม่ในตารางดัชนีหมวด 8 ของเอกสารนี้
4. หากเป็นการ supersede ADR เดิม ให้แก้ไข ADR เดิมเฉพาะ `Status` และ
   `Superseded By` เท่านั้น (ดูหมวด 4)
5. งานเอกสารล้วน (documentation-only) ยังคงอยู่ภายใต้นโยบาย Git แบบ manual
   ของ `CLAUDE.md` §9 — Claude Code / Codex ไม่ `git add`/`commit`/`push` ให้
