---
title: ชุดตัดสินใจ P1 ก่อนยอมรับ MVP
project: Dispatch
company: STEP-SOLUTIONS
topic: P1 Business Decision Analysis Pack
document_type: Knowledge
status: Approved
version: 1.0
created: 2026-07-21
updated: 2026-07-21
scope: Business decision analysis
decision_count: 4
decision_status: approved / synchronized
aliases:
  - 10 - P1 Business Decision Analysis Pack
  - 10 - ชุดตัดสินใจ P1 สำหรับ Dispatch MVP
  - 10 - การตัดสินใจก่อนยอมรับ MVP
tags:
  - dispatch
  - step-solutions
  - business-decision-register
  - p1-decision-pack
  - governance
  - decision-analysis
---

# ชุดตัดสินใจ P1 ก่อนยอมรับ MVP

> [!summary]
> เอกสารฉบับนี้เริ่มต้นเป็น **P1 Business Decision Analysis Pack** สำหรับประเด็น Priority P1 จำนวน 4 รายการที่มี Decision Timing = MUST_DECIDE_BEFORE_MVP ได้แก่ BDR-RETURN-002, BDR-OVERRIDE-003, BDR-OVERRIDE-006 และ BDR-PRIVACY-001 ตามทะเบียนใน [[07 - ขอบเขต MVP และทะเบียนการตัดสินใจทางธุรกิจ]] และได้รับการอนุมัติจาก Product Owner / User เมื่อ 2026-07-21 แล้ว เอกสารนี้คง option analysis และ comparison tables ไว้เป็น historical context โดยผลที่อนุมัติจริงคือ BDR-RETURN-002 Option C, BDR-OVERRIDE-003 Option C, BDR-OVERRIDE-006 Option B และ BDR-PRIVACY-001 Option B เอกสารนี้ไม่เปิด P0 Decisions ที่อนุมัติแล้วใน [[08 - ชุดตัดสินใจ P0 ก่อนเริ่ม MVP]] กลับมาพิจารณาใหม่ และไม่เลือก technical implementation ใด

## 1. Document purpose

เอกสารนี้จัดทำขึ้นเพื่อเก็บบันทึกการวิเคราะห์และผลอนุมัติของประเด็น P1 ที่ต้องปิดก่อนการยอมรับ Feature Group ที่เกี่ยวข้อง โดยมีขอบเขตเฉพาะ 4 Decision ID ต่อไปนี้

| Decision ID | Feature Group | Timing | สถานะในเอกสารนี้ |
| --- | --- | --- | --- |
| BDR-RETURN-002 | MVP-12 | APPROVED | Option C |
| BDR-OVERRIDE-003 | MVP-15 | APPROVED | Option C |
| BDR-OVERRIDE-006 | MVP-15 | APPROVED | Option B |
| BDR-PRIVACY-001 | MVP-18, MVP-19 | APPROVED | Option B |

หลักการของเอกสารนี้คือ

* P0 Decisions ทั้งหมดได้รับการอนุมัติแล้ว และห้ามใช้เอกสารนี้เปิดประเด็น P0 กลับมาพิจารณาใหม่
* ทั้ง 4 รายการเป็น Priority P1 จึงไม่บล็อกการเริ่ม Technical Architecture ของ MVP ทั้งระบบ
* ทั้ง 4 รายการได้รับคำตอบแล้วก่อนยอมรับ Feature Group ที่เกี่ยวข้อง
* Options และ Non-binding Recommendations ในเอกสารนี้เป็น advisory ก่อนการอนุมัติเท่านั้น
* Product Owner / User เป็นผู้ตัดสินใจขั้นสุดท้ายและเป็นผู้อนุมัติทั้ง 4 Decision
* รายละเอียดทางเทคนิคยังอยู่นอกขอบเขตของเอกสารนี้

## 2. Scope and non-scope

เอกสารนี้ครอบคลุม

* การวิเคราะห์ทางเลือกเชิงนโยบายธุรกิจของ 4 Decision ID เท่านั้น
* ผลกระทบต่อ Workflow, Permission, Evidence, Timeline, Audit Log, Privacy และ Governance ในระดับธุรกิจ
* ความสัมพันธ์ระหว่างประเด็นที่ต้องตัดสินใจก่อนยอมรับ Feature Group
* User Decision Record ที่บันทึกผลอนุมัติแล้ว
* Knowledge Synchronization Plan และสถานะ synchronization หลัง Product Owner / User อนุมัติ

เอกสารนี้ไม่กำหนด

* database schema
* API endpoints
* DTOs
* UI layout หรือ page layout
* storage technology
* framework หรือ library choices
* deployment design
* exact source-code implementation
* integration กับ stock system, courier API หรือระบบภายนอกอื่น

## 3. Source-of-truth hierarchy

| ลำดับ | Source | ใช้เป็นอำนาจสำหรับ |
| --- | --- | --- |
| 1 | [[07 - ขอบเขต MVP และทะเบียนการตัดสินใจทางธุรกิจ]] | Decision ID, คำถาม, สถานะ, Priority, Owner, Approval Checkpoint, Feature Group และ Related BR/VR |
| 2 | [[06 - กฎธุรกิจและกฎการตรวจสอบความถูกต้องของระบบ Dispatch]] | Business Rules และ Validation Rules ที่อนุมัติแล้ว |
| 3 | [[08 - ชุดตัดสินใจ P0 ก่อนเริ่ม MVP]] | รูปแบบการวิเคราะห์ทางเลือก, Comparison Table, Non-binding Recommendation และ User Decision Record |
| 4 | [[09 - Workflow กรณีนำสินค้ากลับบริษัท]] | Returned-Goods Workflow, approved BDR-RETURN-002 Option C synchronization และ Open Decision Boundary สำหรับ BDR-RETURN-007/BDR-RETURN-009 |
| 5 | [[01 - เป้าหมายของระบบ Dispatch]], [[02 - Workflow การทำงานของระบบ Dispatch]], [[03 - บทบาทและสิทธิ์ผู้ใช้งาน]], [[04 - สถานะของงานและกติกาการเปลี่ยนสถานะ]], [[05 - ข้อมูล หลักฐาน และรายละเอียดที่ต้องจัดเก็บในแต่ละงาน]] | บริบท Workflow, Role, Status, Data, Evidence, Timeline และ Audit Log |

หากเอกสารนี้ขัดกับ Topic 7 หรือ Topic 6 ให้ถือ Topic 7 หรือ Topic 6 เป็นแหล่งอำนาจตามลำดับข้างต้น

## 4. Current milestone context

ณ วันที่ 2026-07-21 สถานะการตัดสินใจของ MVP เป็นดังนี้

* P0 Decisions จำนวน 9 รายการได้รับการอนุมัติแล้วใน Topic 7 และ Topic 8
* Technical Architecture ของ MVP โดยรวมสามารถเดินหน้าต่อได้
* รายการ MUST_DECIDE_BEFORE_MVP ที่เป็น Priority P1 จำนวน 4 รายการได้รับการอนุมัติแล้วเมื่อ 2026-07-21
* รายการ P1 ทั้ง 4 นี้ไม่ควรถูกตีความว่าเป็น Architecture Blocker ของทั้ง MVP
* แต่ละรายการต้องถูกปิดก่อน Feature Group ของตนผ่าน Acceptance
* ห้ามรวมหลาย Decision ID เป็นการอนุมัติครั้งเดียว เพราะแต่ละ Decision ต้องมี Selected Option และ Approval Record ของตนเอง

## 5. Summary of the four unresolved P1 decisions

| Decision ID | Exact decision question from Topic 7 | Status | Priority | Owner | Acceptance checkpoint | Related BR/VR |
| --- | --- | --- | --- | --- | --- | --- |
| BDR-RETURN-002 | ข้อกำหนดหลักฐานที่บังคับสำหรับการคืนสินค้า | MUST_DECIDE_BEFORE_MVP | P1 | Product Owner / User (ร่วม Admin Operations) | ก่อนยอมรับ MVP-12 | BR-RETURN-006 |
| BDR-OVERRIDE-003 | ผลที่ตามมาเมื่อ Super Admin ปฏิเสธ (Reject) การใช้ Emergency Override คืออะไร | MUST_DECIDE_BEFORE_MVP | P1 | Product Owner / User (ร่วม Super Admin Governance) | ก่อนยอมรับ MVP-15 | BR-REVIEW-004, BR-OVERRIDE-010 |
| BDR-OVERRIDE-006 | หนึ่งบุคคลสามารถทั้งริเริ่มและทบทวน Override เดียวกันได้หรือไม่ (นอกเหนือจากที่กำหนดไว้แล้วว่า Admin ริเริ่มและ Super Admin ทบทวนเสมอ) | MUST_DECIDE_BEFORE_MVP | P1 | Super Admin Governance (ร่วม Security/Privacy Review) | ก่อนยอมรับ MVP-15 | BR-REVIEW-006 |
| BDR-PRIVACY-001 | กระบวนการเปิดเผยข้อมูลแบบไม่ปิดบังระหว่างการสืบสวนอย่างเป็นทางการ | MUST_DECIDE_BEFORE_MVP | P1 | Security/Privacy Review (ร่วม Product Owner) | ก่อนยอมรับ MVP-18/MVP-19 | BR-SECURITY-009 |

## 6. Decision-analysis method

การวิเคราะห์ในเอกสารนี้ใช้หลักการเดียวกับ Topic 8 แต่ลดขนาดให้เหมาะกับ P1

* แยก Approved Constraints ออกจาก Open Questions
* เสนอทางเลือกที่ Product Owner อ่านแล้วตัดสินใจได้
* ทางเลือกต้องเป็น mutually exclusive
* ห้ามเสนอทางเลือกที่ลด auditability, ลบ history หรือเขียนทับหลักฐานเดิมแบบเงียบ
* ห้ามเพิ่มบทบาทใหม่หรือสถานะ Main Task Status ใหม่
* ห้ามใช้ Recommendation เป็น Approval
* ทุก Decision ต้องจบด้วย User Decision Record ที่บันทึกผลอนุมัติจริงและ synchronization status

## 7. BDR-RETURN-002 analysis

### A. Decision identity

| Field | Value |
| --- | --- |
| Decision ID | BDR-RETURN-002 |
| Exact decision question | ข้อกำหนดหลักฐานที่บังคับสำหรับการคืนสินค้า |
| Current status | APPROVED |
| Priority | P1 |
| Decision timing | ก่อนยอมรับ MVP-12 |
| Decision owner | Product Owner / User (ร่วม Admin Operations) |
| Affected MVP Feature Group | MVP-12 |
| Related Topic sections | Topic 5 §39 กลุ่ม H; Topic 7 กลุ่ม H; Topic 9 §17, §18, §24, §27 |
| Related BR/VR IDs | BR-RETURN-006, VR-OPEN-001 |

### B. Existing approved constraints

* Admin เป็นผู้ยืนยัน RETURN_CONFIRMED อย่างเป็นทางการตาม BR-RETURN-003
* Stock อาจตรวจนับ ตรวจสภาพ จัดเก็บ หรือรายงาน discrepancy แต่ไม่ใช่ผู้ยืนยันขั้นสุดท้ายตาม BR-RETURN-004
* RETURN_CONFIRMED ไม่ Reopen Task อัตโนมัติตาม BR-RETURN-005
* จำนวนที่คาดว่าจะคืนและจำนวนที่คืนจริงต้องตรวจสอบย้อนกลับได้เมื่อเกี่ยวข้องตาม BR-RETURN-006
* จำนวนที่คืนต้องแยกจากจำนวนที่ส่งมอบสำเร็จตาม BR-QTY-010
* จำนวนเสียหายหรือขาดหายต้องไม่ถูกปกปิดตาม BR-QTY-011
* Returned-Goods Status มีเฉพาะ NOT_REQUIRED, PENDING_RETURN และ RETURN_CONFIRMED
* BDR-RETURN-007 และ BDR-RETURN-009 ยังไม่ถูกตัดสินโดย Decision นี้

### C. Problem statement

MVP-12 ต้องมีเกณฑ์ชัดเจนว่า Admin ต้องเห็นหรือบันทึกหลักฐานใดก่อนยืนยัน RETURN_CONFIRMED หากไม่มีคำตอบนี้ การยืนยันรับคืนอาจไม่สม่ำเสมอระหว่างเคส และ Validation อาจใช้ operational guidance แทนข้อกำหนดที่ได้รับอนุมัติ ซึ่งขัดกับ VR-OPEN-001

### D. Options

| Option | Business-policy choice |
| --- | --- |
| Option A | Minimal traceability set เฉพาะข้อมูลจำนวนและสภาพที่จำเป็น |
| Option B | Standard mandatory evidence set สำหรับทุกการคืน |
| Option C | Conditional evidence set ตาม discrepancy และความเสี่ยง |
| Option D | Admin confirmation with documented exception เมื่อหลักฐานบางรายการขาด |

### E. Option details

| Option | Details |
| --- | --- |
| Option A | **Business behavior**: บังคับเฉพาะข้อมูลตรวจสอบย้อนกลับพื้นฐาน เช่น Task เดิม, Attempt ที่เกี่ยวข้อง, quantity expected, quantity actual, returned condition และ Admin confirmation time. **Normal flow**: Admin ตรวจสินค้าและยืนยันเมื่อข้อมูลขั้นต่ำครบ. **Exception flow**: หาก quantity mismatch หรือ damage ต้องบันทึก discrepancy แต่ไม่บังคับรูปถ่ายทุกเคส. **Required actor**: Admin; Stock ช่วยรายงานได้. **Governance impact**: ง่ายแต่หลักฐานเชิงภาพต่ำ. **Evidence/data impact**: เน้นข้อมูลมากกว่าหลักฐานภาพ. **Audit/Timeline impact**: Timeline/Audit ต้องบันทึก confirmation และ discrepancy. **Operational benefit**: ใช้งานเร็ว. **Operational risk**: ข้อพิพาทอาจพิสูจน์ยาก. **Abuse/fraud risk**: ปานกลาง. **MVP acceptance**: Accept ได้หาก Product Owner ยอมรับระดับหลักฐานต่ำ. **Extensibility**: เพิ่มรูปถ่ายภายหลังได้ |
| Option B | **Business behavior**: กำหนดชุดหลักฐานมาตรฐานที่ต้องมีทุกครั้ง เช่น quantity, condition, receiving person, confirming Admin, return timestamp และภาพสินค้า/บรรจุภัณฑ์. **Normal flow**: Admin ยืนยันได้เมื่อทุกหลักฐานครบ. **Exception flow**: หากหลักฐานขาดต้องค้าง PENDING_RETURN หรือใช้ controlled exception ที่อนุมัติ. **Required actor**: Admin. **Governance impact**: สม่ำเสมอสูง. **Evidence/data impact**: เพิ่มภาระเก็บหลักฐาน. **Audit/Timeline impact**: Audit เข้มแข็ง. **Operational benefit**: ลดข้อพิพาท. **Operational risk**: ทำงานช้าในเคสง่าย. **Abuse/fraud risk**: ต่ำ. **MVP acceptance**: ชัดเจนที่สุดสำหรับ Validation. **Extensibility**: ปรับเป็น conditional ภายหลังได้แต่ต้องแก้ policy |
| Option C | **Business behavior**: บังคับหลักฐานตามเงื่อนไข เช่น เคสปกติใช้ข้อมูลขั้นต่ำ, เคสเสียหาย/ขาดหาย/เปิดกล่องต้องมีรูปถ่ายและ discrepancy report. **Normal flow**: Admin ใช้ checklist ตาม condition. **Exception flow**: หาก condition ทำให้หลักฐานเพิ่มแต่หลักฐานไม่ครบ ให้ค้าง PENDING_RETURN หรือ escalate. **Required actor**: Admin; Stock รายงาน discrepancy ได้. **Governance impact**: สมดุลระหว่างภาระงานกับความเสี่ยง. **Evidence/data impact**: ต้องระบุ trigger ของหลักฐานแต่ละชนิด. **Audit/Timeline impact**: ต้องบันทึกเหตุผลว่าทำไมใช้ชุดใด. **Operational benefit**: ไม่กดภาระทุกเคส. **Operational risk**: ต้องฝึกผู้ใช้ให้ตีความ condition ตรงกัน. **Abuse/fraud risk**: ต่ำถึงปานกลาง. **MVP acceptance**: เหมาะกับ MVP หากเงื่อนไขชัด. **Extensibility**: เพิ่ม condition ได้ง่าย |
| Option D | **Business behavior**: กำหนดชุดหลักฐานหลัก แต่ให้ Admin ยืนยันได้เมื่อหลักฐานบางรายการขาดโดยต้องระบุเหตุผลและสิ่งที่ขาด. **Normal flow**: เหมือนชุดมาตรฐาน. **Exception flow**: Admin บันทึก missing evidence reason และ confirmation ยังเกิดได้หากข้อมูลขั้นต่ำตาม BR-RETURN-006 ยัง traceable. **Required actor**: Admin. **Governance impact**: ยืดหยุ่นแต่ต้องคุม abuse. **Evidence/data impact**: ต้องบันทึกหลักฐานที่ขาดอย่างเปิดเผย. **Audit/Timeline impact**: Timeline/Audit ต้องเห็น exception ชัดเจน. **Operational benefit**: ลดงานค้างเพราะหลักฐานขาดบางส่วน. **Operational risk**: อาจกลายเป็นทางลัด. **Abuse/fraud risk**: ปานกลางถึงสูงหากไม่มี review. **MVP acceptance**: Accept ได้เมื่อมี safeguard ชัด. **Extensibility**: เชื่อมกับ governance review ภายหลังได้ |

### F. Comparison table

| Criteria | Option A | Option B | Option C | Option D |
| --- | --- | --- | --- | --- |
| Operational simplicity | High | Medium | Medium | High |
| User clarity | Medium | High | Medium | Medium |
| Consistency | Medium | High | High if triggers clear | Medium |
| Fraud or abuse resistance | Medium | High | High | Medium |
| Auditability | Medium | High | High | Medium to High |
| Segregation of duties | Preserved | Preserved | Preserved | Preserved |
| Exception handling | Weak | Strict | Structured | Flexible |
| Privacy impact | Low | Medium if photos include sensitive data | Conditional | Conditional |
| Implementation complexity | Low | Medium | Medium | Medium |
| Future extensibility | High | Medium | High | High |

### G. Non-binding recommendation

**Recommended option**: Option C — Conditional evidence set ตาม discrepancy และความเสี่ยง

เหตุผล: Option C รักษา Admin confirmation, quantity traceability และ discrepancy visibility โดยไม่ทำให้ทุกเคสต้องใช้หลักฐานชุดใหญ่เท่ากัน เหมาะกับ Topic 9 ที่แยกข้อมูลที่อนุมัติแล้วออกจาก exact mandatory evidence set ที่ยังเปิดอยู่

Known trade-offs: ต้องนิยาม trigger ให้ชัด เช่น damage, missing quantity, opened package หรือ dispute risk ไม่เช่นนั้นจะเกิดการตีความไม่สม่ำเสมอ

Required safeguards: ห้าม Stock เป็น confirmation actor, ห้ามซ่อน damaged/missing quantity, ห้ามใช้ Decision นี้ตัดสิน BDR-RETURN-007 หรือ BDR-RETURN-009, และต้องบันทึก Timeline/Audit ทุกครั้ง

คำแนะนำนี้เป็น historical advisory ก่อนการอนุมัติเท่านั้น ผลที่มีอำนาจคือ Product Owner / User อนุมัติ Option C เมื่อ 2026-07-21

### H. User Decision Record

| Field | Value |
| --- | --- |
| Selected option | Option C |
| Product Owner rationale | Require a consistent Core Return Record while scaling additional evidence according to actual risk |
| Approved by | Product Owner / User |
| Approval date | 2026-07-21 |
| Conditions or exceptions | BDR-RETURN-007 and BDR-RETURN-009 remain unresolved |
| Documents requiring synchronization | Topics 5, 6, 7, 9 |
| Synchronization status | COMPLETED |

## 8. BDR-OVERRIDE-003 analysis

### A. Decision identity

| Field | Value |
| --- | --- |
| Decision ID | BDR-OVERRIDE-003 |
| Exact decision question | ผลที่ตามมาเมื่อ Super Admin ปฏิเสธ (Reject) การใช้ Emergency Override คืออะไร |
| Current status | APPROVED |
| Priority | P1 |
| Decision timing | ก่อนยอมรับ MVP-15 |
| Decision owner | Product Owner / User (ร่วม Super Admin Governance) |
| Affected MVP Feature Group | MVP-15 |
| Related Topic sections | Topic 3 §27; Topic 4 §32; Topic 7 กลุ่ม J; Topic 8 §19 |
| Related BR/VR IDs | BR-REVIEW-004, BR-OVERRIDE-010, VR-OPEN-001 |

### B. Existing approved constraints

* เฉพาะ Admin ใช้ Emergency Override สำหรับงานภายในตาม BR-OVERRIDE-001
* Emergency Override อาจข้ามเงื่อนไขปิดงานได้เมื่อจำเป็นตาม BR-OVERRIDE-002
* เหตุผลของ Override เป็นข้อบังคับตาม BR-OVERRIDE-003
* เงื่อนไขที่ถูกข้ามต้องถูกบันทึกตาม BR-OVERRIDE-004
* Override ต้องแสดงผลแตกต่างจาก normal closure ตาม BR-OVERRIDE-005
* Override Review Status ต้องเป็น PENDING_REVIEW ตาม BR-OVERRIDE-006
* ทุก Override ต้องถูกทบทวนย้อนหลังโดย Super Admin ตาม BR-REVIEW-001 และ BR-REVIEW-006
* Review ต้องรักษาบันทึก Override เดิมไว้ครบถ้วนตาม BR-REVIEW-003
* Review ต้องสร้าง Timeline และ Audit Log แยกต่างหากตาม BR-REVIEW-007

### C. Problem statement

BR-REVIEW-004 มีผลการทบทวนหลายแบบ แต่ Topic 7 ระบุว่ายังไม่มีนิยามชัดเจนสำหรับกรณี Super Admin ปฏิเสธการใช้ Emergency Override หากไม่ตัดสินใจ Super Admin จะไม่รู้ว่าการ reject คือเพียง governance finding, ต้องเกิด corrective action, หรือมีผลต่อ Main Task Status อย่างไร

### D. Options

| Option | Business-policy choice |
| --- | --- |
| Option A | Reject = CORRECTION_REQUIRED เท่านั้น |
| Option B | Reject = ESCALATED governance case |
| Option C | Reject = structured outcome chosen from existing review actions |
| Option D | Reject = severe finding that may require separate corrective action but never rewrites history |

### E. Option details

| Option | Details |
| --- | --- |
| Option A | **Business behavior**: เมื่อ Super Admin ไม่ยอมรับ Override ให้บันทึกผลเป็น CORRECTION_REQUIRED. **Normal flow**: Super Admin ระบุสิ่งที่ต้องแก้และผู้รับผิดชอบ. **Exception flow**: หากมีความเสี่ยงร้ายแรงให้ใช้ escalation ที่มีอยู่แยกต่างหาก. **Required actor**: Super Admin. **Governance impact**: ชัดและง่าย. **Evidence/data impact**: ต้องระบุ correction ที่ต้องทำ. **Audit/Timeline impact**: เพิ่ม Review event โดยไม่ลบ Override เดิม. **Operational benefit**: ใช้ผลลัพธ์ที่มีอยู่. **Operational risk**: อาจเบาเกินสำหรับ misconduct. **Abuse/fraud risk**: ปานกลาง. **MVP acceptance**: ง่ายต่อ MVP-15. **Extensibility**: เพิ่ม severity ภายหลังได้ |
| Option B | **Business behavior**: Reject ทุกครั้งกลายเป็น ESCALATED governance case. **Normal flow**: Super Admin บันทึกเหตุผลและเปิดเส้นทางสืบสวน. **Exception flow**: เคสเล็กก็ยัง escalate. **Required actor**: Super Admin. **Governance impact**: เข้มงวดสูง. **Evidence/data impact**: ต้องเก็บเหตุผลและ case linkage. **Audit/Timeline impact**: Audit เข้มมาก. **Operational benefit**: ป้องกันการใช้ Override ผิด. **Operational risk**: ภาระ governance สูงเกิน. **Abuse/fraud risk**: ต่ำ. **MVP acceptance**: ต้องมีขั้นตอน escalation ชัด. **Extensibility**: รองรับ investigation policy |
| Option C | **Business behavior**: Super Admin เลือกผลลัพธ์ที่เหมาะจากค่าที่มีอยู่ เช่น correction, evidence correction, result correction, reopen เมื่อจำเป็น หรือ escalated. **Normal flow**: Reject เป็นเหตุผล review ไม่ใช่ status เดี่ยว. **Exception flow**: หากต้อง Reopen ต้องผ่านกฎ Reopen แยกต่างหาก. **Required actor**: Super Admin. **Governance impact**: ยืดหยุ่นและไม่ผูก reject กับผลลัพธ์เดียว. **Evidence/data impact**: ต้องบันทึก rationale. **Audit/Timeline impact**: เพิ่ม Review event แยก. **Operational benefit**: ตรงกับความหลากหลายของเคสจริง. **Operational risk**: ต้องกำหนดเกณฑ์เลือกผลลัพธ์. **Abuse/fraud risk**: ต่ำถึงปานกลาง. **MVP acceptance**: เหมาะเมื่อมี checklist. **Extensibility**: สูง |
| Option D | **Business behavior**: Reject เป็น severe finding โดยไม่เปลี่ยน Main Task Status อัตโนมัติ แต่บังคับแผน corrective/governance follow-up แยก. **Normal flow**: Super Admin บันทึก reject, severity และ follow-up. **Exception flow**: การ Reopen, Cancel หรือ result correction ต้องใช้ controlled action ที่มีอยู่. **Required actor**: Super Admin. **Governance impact**: แยก finding ออกจาก action ชัดที่สุด. **Evidence/data impact**: ต้องมี follow-up owner และ rationale. **Audit/Timeline impact**: แข็งแรงแต่เพิ่มภาระ. **Operational benefit**: เหมาะกับข้อพิพาทจริง. **Operational risk**: ซับซ้อน. **Abuse/fraud risk**: ต่ำ. **MVP acceptance**: ต้องนิยาม follow-up ขั้นต่ำ. **Extensibility**: สูง |

### F. Comparison table

| Criteria | Option A | Option B | Option C | Option D |
| --- | --- | --- | --- | --- |
| Operational simplicity | High | Medium | Medium | Low |
| User clarity | High | High | Medium | Medium |
| Consistency | High | High | Medium | High |
| Fraud or abuse resistance | Medium | High | High | High |
| Auditability | High | High | High | High |
| Segregation of duties | Preserved | Preserved | Preserved | Preserved |
| Exception handling | Medium | Strict | High | High |
| Privacy impact | Low | Medium | Conditional | Medium |
| Implementation complexity | Low | Medium | Medium | High |
| Future extensibility | Medium | Medium | High | High |

### G. Non-binding recommendation

**Recommended option**: Option C — structured outcome chosen from existing review actions

เหตุผล: Option C รักษา Review Outcome ที่มีอยู่ ไม่เพิ่มสถานะใหม่โดยไม่จำเป็น และแยกการ reject ออกจาก Main Task Status, corrective action และ governance follow-up อย่างเหมาะสม

Known trade-offs: Super Admin ต้องมีเกณฑ์เลือกผลลัพธ์ที่สม่ำเสมอ และต้องไม่ใช้คำว่า reject แบบกำกวม

Required safeguards: ห้ามลบหรือแก้ Override เดิม, ต้องมี Timeline/Audit Log ของ review, และการ Reopen หรือ result correction ต้องเป็น action แยกตามกฎที่อนุมัติแล้ว

คำแนะนำนี้เป็น historical advisory ก่อนการอนุมัติเท่านั้น ผลที่มีอำนาจคือ Product Owner / User อนุมัติ Option C เมื่อ 2026-07-21 และ Reject ยังไม่ทำให้ Main Task Status เปลี่ยนอัตโนมัติ

### H. User Decision Record

| Field | Value |
| --- | --- |
| Selected option | Option C |
| Product Owner rationale | Keep Reject separate from Main Task Status and select a controlled follow-up action based on facts and severity |
| Approved by | Product Owner / User |
| Approval date | 2026-07-21 |
| Conditions or exceptions | Original Override history must remain unchanged; Reopen, correction, and escalation are separate actions |
| Documents requiring synchronization | Topics 3, 4, 6, 7 |
| Synchronization status | COMPLETED |

## 9. BDR-OVERRIDE-006 analysis

### A. Decision identity

| Field | Value |
| --- | --- |
| Decision ID | BDR-OVERRIDE-006 |
| Exact decision question | หนึ่งบุคคลสามารถทั้งริเริ่มและทบทวน Override เดียวกันได้หรือไม่ (นอกเหนือจากที่กำหนดไว้แล้วว่า Admin ริเริ่มและ Super Admin ทบทวนเสมอ) |
| Current status | APPROVED |
| Priority | P1 |
| Decision timing | ก่อนยอมรับ MVP-15 |
| Decision owner | Super Admin Governance (ร่วม Security/Privacy Review) |
| Affected MVP Feature Group | MVP-15 |
| Related Topic sections | Topic 6 §40 กลุ่ม J; Topic 7 กลุ่ม J; Topic 8 §19 |
| Related BR/VR IDs | BR-REVIEW-006, VR-OPEN-001 |

### B. Existing approved constraints

* Admin เป็นผู้ริเริ่ม Emergency Override สำหรับงานภายในตาม BR-OVERRIDE-001
* Super Admin เป็นผู้ทบทวนอย่างเป็นทางการตาม BR-REVIEW-006
* ทุก Override ต้องมี review ย้อนหลังตาม BR-REVIEW-001
* Review ไม่ลบหรือแทนที่ Override เดิมตาม BR-REVIEW-003
* Review ต้องสร้าง Timeline/Audit Log แยกตาม BR-REVIEW-007
* ยังไม่มีบทบาทใหม่ใน Phase 1 และ Decision นี้ห้ามสร้างบทบาทใหม่

### C. Problem statement

กฎปัจจุบันแยกบทบาท Admin และ Super Admin แล้ว แต่ยังไม่ตอบว่าหากบุคคลเดียวถือทั้งสองบทบาทในทีมขนาดเล็ก บุคคลนั้นสามารถ initiate และ review Override เดียวกันได้หรือไม่ ประเด็นนี้ต้องปิดก่อนยอมรับ MVP-15 เพราะเกี่ยวกับ Segregation of Duties และ conflict of interest โดยตรง

### D. Options

| Option | Business-policy choice |
| --- | --- |
| Option A | Strict separation: คนเดียวกันห้าม initiate และ review Override เดียวกัน |
| Option B | Same person allowed only under emergency continuity with compensating controls |
| Option C | Same person allowed for low-risk Override, prohibited for high-risk Override |
| Option D | Same person allowed, but every same-person review is automatically escalated for later governance sampling |

### E. Option details

| Option | Details |
| --- | --- |
| Option A | **Business behavior**: ต้องเป็นคนละบุคคลเสมอ. **Normal flow**: Admin initiate, Super Admin คนอื่น review. **Exception flow**: หากไม่มี Super Admin คนอื่น งานค้าง review. **Required actor**: Admin และ Super Admin คนละคน. **Governance impact**: SoD สูงสุด. **Evidence/data impact**: ต้องเก็บ actor identity ทั้งสอง. **Audit/Timeline impact**: ชัดที่สุด. **Operational benefit**: ลด conflict. **Operational risk**: ทีมเล็กอาจค้างงาน. **Abuse/fraud risk**: ต่ำ. **MVP acceptance**: ชัดเจน. **Extensibility**: เพิ่ม emergency exception ภายหลังได้ |
| Option B | **Business behavior**: โดยปกติห้าม แต่อนุญาตเมื่อมี emergency continuity และต้องบันทึกเหตุผล. **Normal flow**: คนละคน. **Exception flow**: คนเดียวกันทำได้เมื่อไม่มี reviewer อื่นและต้องมี compensating controls. **Required actor**: Authorized Admin/Super Admin เดิม ไม่เพิ่มบทบาท. **Governance impact**: สมดุล SoD กับความต่อเนื่อง. **Evidence/data impact**: ต้องมี reason, unavailability note และ follow-up marker. **Audit/Timeline impact**: ต้องเห็น same-person review ชัด. **Operational benefit**: ไม่หยุดงานในทีมเล็ก. **Operational risk**: ต้องคุมการใช้ข้อยกเว้น. **Abuse/fraud risk**: ปานกลาง. **MVP acceptance**: เหมาะถ้ากำหนด safeguard. **Extensibility**: สูง |
| Option C | **Business behavior**: ใช้ risk tier; low-risk อนุญาต, high-risk ห้าม. **Normal flow**: ประเมิน risk ก่อน review. **Exception flow**: high-risk ต้องรอ Super Admin คนอื่น. **Required actor**: Super Admin. **Governance impact**: ละเอียด. **Evidence/data impact**: ต้องมี risk classification. **Audit/Timeline impact**: ต้อง audit risk tier. **Operational benefit**: ยืดหยุ่น. **Operational risk**: ต้องนิยาม risk tier ซึ่งยังไม่มี. **Abuse/fraud risk**: ปานกลาง. **MVP acceptance**: ซับซ้อนสำหรับ MVP-15. **Extensibility**: สูงแต่ต้องดูแล policy |
| Option D | **Business behavior**: อนุญาตคนเดียวกัน แต่ติด marker สำหรับ governance sampling ภายหลัง. **Normal flow**: Review เสร็จโดย actor เดิมได้. **Exception flow**: เคสผิดปกติถูกสุ่มหรือยกระดับภายหลัง. **Required actor**: Super Admin. **Governance impact**: อ่อนกว่า SoD แบบจริง. **Evidence/data impact**: ต้องเก็บ marker. **Audit/Timeline impact**: traceable แต่ไม่ป้องกันก่อนเกิดเหตุ. **Operational benefit**: เร็วที่สุด. **Operational risk**: conflict เกิดก่อน review รอบสอง. **Abuse/fraud risk**: สูงกว่า Option A/B. **MVP acceptance**: อาจยอมรับยากด้าน governance. **Extensibility**: เชื่อมกับ analytics ภายหลังได้ |

### F. Comparison table

| Criteria | Option A | Option B | Option C | Option D |
| --- | --- | --- | --- | --- |
| Operational simplicity | Medium | Medium | Low | High |
| User clarity | High | Medium | Low | Medium |
| Consistency | High | Medium | Medium | Medium |
| Fraud or abuse resistance | High | Medium | Medium | Low |
| Auditability | High | High | High | High |
| Segregation of duties | Strongest | Strong with exception | Risk-based | Weak |
| Exception handling | Weak | Strong | Strong but complex | Medium |
| Privacy impact | Low | Low | Low | Low |
| Implementation complexity | Low | Medium | High | Medium |
| Future extensibility | Medium | High | High | Medium |

### G. Non-binding recommendation

**Recommended option**: Option B — Same person allowed only under emergency continuity with compensating controls

เหตุผล: Option B รักษา Segregation of Duties เป็นค่าเริ่มต้น แต่ไม่ทำให้ทีมขนาดเล็กหรือเหตุฉุกเฉินหยุดชะงัก โดยไม่เพิ่มบทบาทใหม่และไม่ยกเลิก mandatory retrospective review

Known trade-offs: ต้องกำหนดว่าอะไรนับเป็น emergency continuity และ compensating controls ขั้นต่ำคืออะไร

Required safeguards: ต้องมี reason, actor identity, timestamp, Timeline/Audit Log, same-person marker และห้ามใช้เพื่อหลีกเลี่ยง Super Admin review ตาม BR-REVIEW-006

คำแนะนำนี้เป็น historical advisory ก่อนการอนุมัติเท่านั้น ผลที่มีอำนาจคือ Product Owner / User อนุมัติ Option B เมื่อ 2026-07-21

### H. User Decision Record

| Field | Value |
| --- | --- |
| Selected option | Option B |
| Product Owner rationale | Preserve segregation of duties as the default while allowing controlled Emergency Continuity for a small team |
| Approved by | Product Owner / User |
| Approval date | 2026-07-21 |
| Conditions or exceptions | Same-person review only under the approved Emergency Continuity safeguards |
| Documents requiring synchronization | Topics 3, 6, 7 |
| Synchronization status | COMPLETED |

## 10. BDR-PRIVACY-001 analysis

### A. Decision identity

| Field | Value |
| --- | --- |
| Decision ID | BDR-PRIVACY-001 |
| Exact decision question | กระบวนการเปิดเผยข้อมูลแบบไม่ปิดบังระหว่างการสืบสวนอย่างเป็นทางการ |
| Current status | APPROVED |
| Priority | P1 |
| Decision timing | ก่อนยอมรับ MVP-18/MVP-19 |
| Decision owner | Security/Privacy Review (ร่วม Product Owner) |
| Affected MVP Feature Group | MVP-18, MVP-19 |
| Related Topic sections | Topic 3 §27; Topic 5 §39 กลุ่ม E; Topic 7 กลุ่ม K; Topic 8 §19 |
| Related BR/VR IDs | BR-SECURITY-009, BR-SECURITY-001, BR-SECURITY-003, BR-SECURITY-007, BR-SECURITY-008, VR-SECURITY-001a, VR-SECURITY-002a, VR-OPEN-001 |

### B. Existing approved constraints

* เบอร์โทรผู้รับสินค้า, ลายเซ็นลูกค้า, ประวัติการจัดส่งของลูกค้า และค่าจัดส่งภายนอกถูกจำกัดตาม BR-SECURITY-001
* Management/Auditor ได้ข้อมูลแบบ masked หรือ summary เป็นค่าเริ่มต้นตาม BR-SECURITY-003
* การส่งออกข้อมูลอ่อนไหวต้องมีอำนาจที่อนุมัติตาม BR-SECURITY-007
* Least Privilege และ Data Minimization มีผลกับทุกบทบาทตาม BR-SECURITY-008
* BR-SECURITY-009 ระบุว่าการเปิดเผยข้อมูลอ่อนไหวแบบไม่ปิดบังระหว่างการสืบสวนอย่างเป็นทางการยังไม่ได้ข้อสรุป
* Decision นี้ต้องไม่เลือก encryption, storage, masking library, authentication technology หรือ database implementation

### C. Problem statement

MVP-18 และ MVP-19 ต้องรองรับการกำกับดูแลและการเข้าถึงข้อมูลอย่างปลอดภัย แต่ยังไม่มีนโยบายธุรกิจว่ากรณีสืบสวนทางการจะเปิดข้อมูลแบบไม่ปิดบังให้ใคร ด้วยเหตุผลอะไร เป็นเวลานานเท่าใด และต้อง audit อย่างไร หากไม่ตัดสินใจ อาจเกิด either overblocking ใน investigation จริง หรือ overexposure โดยไม่มีอำนาจที่ชัดเจน

### D. Options

| Option | Business-policy choice |
| --- | --- |
| Option A | Super Admin only, case-bound unmasked access |
| Option B | Security/Privacy Review approval before any unmasked access |
| Option C | Dual authorization: Super Admin plus Product Owner / User, with Security/Privacy Review safeguard input |
| Option D | No unmasked disclosure in MVP; investigate using masked data only until policy review |

### E. Option details

| Option | Details |
| --- | --- |
| Option A | **Business behavior**: Super Admin เปิดดูข้อมูลไม่ปิดบังได้เฉพาะ case investigation ที่มีเหตุผล. **Normal flow**: บันทึก case, reason, scope, duration. **Exception flow**: หากต้อง export ต้องผ่าน BR-SECURITY-007. **Required actor**: Super Admin. **Governance impact**: เร็วแต่พึ่งบทบาทเดียว. **Evidence/data impact**: ต้องเก็บ reason, fields viewed, case linkage. **Audit/Timeline impact**: Audit Log บังคับ. **Operational benefit**: ใช้ได้ทันทีเมื่อมีข้อพิพาท. **Operational risk**: อำนาจรวมศูนย์. **Abuse/fraud risk**: ปานกลาง. **MVP acceptance**: ง่ายที่สุด. **Extensibility**: เพิ่ม approval ชั้นสองภายหลังได้ |
| Option B | **Business behavior**: ต้องมี Security/Privacy Review อนุมัติก่อนเปิดข้อมูลไม่ปิดบัง. **Normal flow**: ผู้ขอระบุ case, reason, scope และ duration; review อนุมัติหรือปฏิเสธ. **Exception flow**: กรณีเร่งด่วนต้องมี temporary access และ retrospective review หาก Product Owner อนุมัติ policy นี้. **Required actor**: Security/Privacy Review. **Governance impact**: เหมาะกับข้อมูลอ่อนไหว. **Evidence/data impact**: ต้องเก็บ approval record. **Audit/Timeline impact**: ชัดเจน. **Operational benefit**: ลดการเปิดเผยเกินจำเป็น. **Operational risk**: ช้ากว่า Option A. **Abuse/fraud risk**: ต่ำ. **MVP acceptance**: ต้องมีกระบวนการอนุมัติชัด. **Extensibility**: สูง |
| Option C | **Business behavior**: ต้องมี dual authorization สำหรับ unmasked access โดยใช้ existing actors เท่านั้น. **Normal flow**: Super Admin เสนอ, Product Owner / User อนุมัติร่วม, และ Security/Privacy Review ให้ความเห็นหรือตรวจ safeguard ในฐานะ governance review function ไม่ใช่ Dispatch application Role ใหม่. **Exception flow**: ถ้าผู้อนุมัติไม่พร้อม การเปิดข้อมูลค้างไว้. **Required actor**: Super Admin plus Product Owner / User. **Governance impact**: เข้มที่สุด. **Evidence/data impact**: Approval record สองฝ่ายและ safeguard-review note เมื่อเกี่ยวข้อง. **Audit/Timeline impact**: แข็งแรงที่สุด. **Operational benefit**: ลด conflict. **Operational risk**: ช้าและหนักสำหรับ MVP. **Abuse/fraud risk**: ต่ำมาก. **MVP acceptance**: อาจซับซ้อน. **Extensibility**: ดีสำหรับองค์กรโตขึ้น |
| Option D | **Business behavior**: MVP ไม่เปิดข้อมูลไม่ปิดบังในการสืบสวน ใช้ masked/summary เท่านั้นจนกว่านโยบายจะพร้อม. **Normal flow**: Management/Auditor ดูข้อมูล masked. **Exception flow**: กรณีที่ต้องใช้ unmasked data ต้องออกนอก scope MVP และเข้ากระบวนนโยบายองค์กร. **Required actor**: ไม่มี actor สำหรับ unmasked access ใน MVP. **Governance impact**: ปลอดภัยด้าน privacy แต่จำกัด investigation. **Evidence/data impact**: ไม่มี unmasked access record ภายใน MVP. **Audit/Timeline impact**: Audit เฉพาะการปฏิเสธหรือ masked view. **Operational benefit**: ลดความเสี่ยง privacy. **Operational risk**: สืบสวนข้อพิพาทร้ายแรงอาจไม่พอ. **Abuse/fraud risk**: ต่ำ. **MVP acceptance**: อาจไม่ผ่านถ้า MVP-18/MVP-19 ต้องรองรับ investigation. **Extensibility**: เปิด policy ภายหลังได้ |

### F. Comparison table

| Criteria | Option A | Option B | Option C | Option D |
| --- | --- | --- | --- | --- |
| Operational simplicity | High | Medium | Low | High |
| User clarity | Medium | High | High | High |
| Consistency | Medium | High | High | High |
| Fraud or abuse resistance | Medium | High | High | High |
| Auditability | High | High | High | Medium |
| Segregation of duties | Medium | High | Highest | Not applicable |
| Exception handling | Medium | Medium | Low | Weak |
| Privacy impact | Medium | Low | Lowest | Lowest |
| Implementation complexity | Low | Medium | High | Low |
| Future extensibility | Medium | High | High | Medium |

### G. Non-binding recommendation

**Recommended option**: Option B — Security/Privacy Review approval before any unmasked access

เหตุผล: Option B แยก normal operational access ออกจาก formal investigation access ได้ชัด รักษา Least Privilege และ Data Minimization และยังให้เส้นทางที่ถูกต้องเมื่อจำเป็นต้องตรวจสอบข้อมูลไม่ปิดบัง

Known trade-offs: ต้องกำหนด approval workflow ระดับธุรกิจ เช่น authorization level, reason requirement, case linkage, access duration, scope limitation และ export restriction โดยไม่เลือกเทคโนโลยี

Required safeguards: ต้องมี reason, case linkage, scope, duration, Audit Log, export restriction ตาม BR-SECURITY-007 และห้าม unmasked access แบบไม่จำกัดหรือไม่มีเอกสารกำกับ

คำแนะนำนี้เป็น historical advisory ก่อนการอนุมัติเท่านั้น ผลที่มีอำนาจคือ Product Owner / User อนุมัติ Option B เมื่อ 2026-07-21 โดย Security/Privacy Review เป็น governance review function ที่อนุมัติหรือปฏิเสธ unmasked access แบบ case-by-case ภายใต้นโยบายที่อนุมัติแล้ว

### H. User Decision Record

| Field | Value |
| --- | --- |
| Selected option | Option B |
| Product Owner rationale | Permit necessary Formal Investigation access while preserving Least Privilege, Data Minimization, and case-by-case governance review |
| Approved by | Product Owner / User |
| Approval date | 2026-07-21 |
| Conditions or exceptions | No indefinite or out-of-scope access; emergency access requires complete logging and retrospective review |
| Documents requiring synchronization | Topics 3, 5, 6, 7, 9 where relevant |
| Synchronization status | COMPLETED |

## 11. Cross-decision dependency analysis

| Dependency | Analysis | Approval handling |
| --- | --- | --- |
| BDR-OVERRIDE-003 and BDR-OVERRIDE-006 | ทั้งสองเกี่ยวกับ Governance ของ Emergency Override แต่คนละคำถาม: BDR-OVERRIDE-003 ตัดสินผลเมื่อ review ไม่ยอมรับ Override; BDR-OVERRIDE-006 ตัดสินว่า actor เดียวกัน initiate และ review ได้หรือไม่ | ต้องมี Selected Option แยกกัน |
| BDR-RETURN-002 and privacy | หลักฐานคืนสินค้าอาจมีภาพสินค้า, บรรจุภัณฑ์, เอกสาร หรือข้อมูลที่เชื่อมกับลูกค้า จึงต้องเคารพ BR-SECURITY-008 และไม่เปิดข้อมูลเกินจำเป็น | อนุมัติชุด evidence ไม่ได้อนุมัติ unmasked access |
| Emergency Override investigation and privacy | หาก rejected Override ถูก escalate เป็น investigation อาจต้องเข้าถึงข้อมูลอ่อนไหวแบบไม่ปิดบัง จึงเกี่ยวกับ BDR-PRIVACY-001 | ต้องใช้ policy ของ BDR-PRIVACY-001 หากมี unmasked access |
| Decision order | BDR-OVERRIDE-006 ควรตัดสินก่อนหรือพร้อม BDR-OVERRIDE-003 เพราะ reviewer identity มีผลต่อความน่าเชื่อถือของ reject/review outcome | ไม่รวมการอนุมัติ |
| Returned goods timing | BDR-RETURN-002 ไม่ตัดสิน BDR-RETURN-007 หรือ BDR-RETURN-009 | ต้องคงสถานะ Open ของ Decision ที่เกี่ยวข้อง |

## 12. Recommended decision sequence

ลำดับที่แนะนำเป็นคำแนะนำเชิงปฏิบัติการ ไม่ใช่การอนุมัติ

| Sequence | Decision ID | Reason |
| --- | --- | --- |
| 1 | BDR-OVERRIDE-006 | กำหนดความน่าเชื่อถือของ reviewer ก่อนตัดสินผล reject |
| 2 | BDR-OVERRIDE-003 | ใช้หลังทราบหลัก Segregation of Duties ของ review |
| 3 | BDR-PRIVACY-001 | กำหนดกรอบ investigation access ก่อนข้อมูลอ่อนไหวถูกใช้ใน governance case |
| 4 | BDR-RETURN-002 | ปิดชุดหลักฐานคืนสินค้าก่อนยอมรับ MVP-12 โดยคำนึงถึง privacy constraints |

Product Owner / User สามารถเลือกตัดสินในลำดับอื่นได้ หากยังแยก Approval Record ของแต่ละ Decision ID ชัดเจน

## 13. Consolidated comparison and risk matrix

| Decision ID | Recommended option | Main benefit | Main risk | Acceptance risk if unresolved | Documents likely needing sync |
| --- | --- | --- | --- | --- | --- |
| BDR-RETURN-002 | Option C | หลักฐานสัมพันธ์กับความเสี่ยงจริง | Trigger ต้องชัด | MVP-12 ไม่มีเกณฑ์ confirmation evidence | Topic 5, Topic 6, Topic 7, Topic 9 |
| BDR-OVERRIDE-003 | Option C | ใช้ review outcomes ที่มีอยู่และไม่ rewrite history | ต้องกำหนดเกณฑ์เลือก outcome | MVP-15 reject path ไม่ชัด | Topic 3, Topic 4, Topic 6, Topic 7 |
| BDR-OVERRIDE-006 | Option B | รักษา SoD พร้อมรองรับทีมเล็ก | ต้องคุม emergency exception | MVP-15 reviewer conflict ไม่ชัด | Topic 3, Topic 6, Topic 7 |
| BDR-PRIVACY-001 | Option B | แยก investigation access จาก normal access | ต้องมี approval process | MVP-18/MVP-19 ไม่มีเส้นทาง unmasked access ที่ถูกต้อง | Topic 3, Topic 5, Topic 6, Topic 7 |

## 14. Product Owner decision checklist

ก่อนอนุมัติแต่ละ Decision ให้ตรวจว่า

* คำถามตรงกับ Topic 7
* Selected Option ไม่เปิด P0 Decision ที่ปิดแล้ว
* Selected Option ไม่เพิ่มบทบาทใหม่
* Selected Option ไม่เพิ่ม Main Task Status ใหม่
* Selected Option ไม่ลด mandatory auditability
* Selected Option ไม่อนุญาตให้ลบหรือ overwrite Task, Attempt, Evidence, Timeline หรือ Audit Log
* Open Decisions อื่นยังคง Open หากไม่ได้อนุมัติแยก
* เอกสารที่ต้อง synchronize ถูกระบุครบ

## 15. User Decision Record summary

| Decision ID | Selected option | Product Owner rationale | Approved by | Approval date | Sync status |
| --- | --- | --- | --- | --- | --- |
| BDR-RETURN-002 | Option C | Core Return Record plus risk-triggered evidence | Product Owner / User | 2026-07-21 | COMPLETED |
| BDR-OVERRIDE-003 | Option C | Reject as Review Finding with controlled follow-up | Product Owner / User | 2026-07-21 | COMPLETED |
| BDR-OVERRIDE-006 | Option B | Default segregation of duties with Emergency Continuity exception | Product Owner / User | 2026-07-21 | COMPLETED |
| BDR-PRIVACY-001 | Option B | Formal Investigation access under case-by-case governance review | Product Owner / User | 2026-07-21 | COMPLETED |

## 16. Knowledge synchronization plan after approval

| Decision ID | Primary synchronization targets | Synchronization notes |
| --- | --- | --- |
| BDR-RETURN-002 | Topic 5, Topic 6, Topic 7, Topic 9 | Synchronized 2026-07-21: Core Return Record plus Risk Trigger evidence; BDR-RETURN-007 และ BDR-RETURN-009 ยังเปิด |
| BDR-OVERRIDE-003 | Topic 3, Topic 4, Topic 6, Topic 7 | Synchronized 2026-07-21: Reject is a Review Finding with separate Controlled Action follow-up |
| BDR-OVERRIDE-006 | Topic 3, Topic 6, Topic 7 | Synchronized 2026-07-21: different-person review by default; Emergency Continuity exception only |
| BDR-PRIVACY-001 | Topic 3, Topic 5, Topic 6, Topic 7, Topic 9 where relevant | Synchronized 2026-07-21: Formal Investigation unmasked access under approved policy |

## 17. Acceptance criteria for this decision pack

* วิเคราะห์ core P1 Decision exactly 4 รายการ
* ทั้ง 4 รายการได้รับการอนุมัติแล้ว
* ทุก Decision มี mutually exclusive options
* ทุก Decision มี comparison table
* ทุก Decision มี non-binding recommendation
* ทุก Decision มี approved User Decision Record
* P0 Decisions ไม่ถูกเปิดใหม่
* Existing roles ถูกคงไว้
* Existing Main Task Status values ถูกคงไว้
* Audit history เป็น append-only
* ไม่มี technical implementation ถูกเลือก
* ไม่มี unknown BR, VR หรือ BDR IDs ถูกเพิ่ม
* ระบุ post-approval synchronization targets แล้ว

## 18. Explicit approved-status statement

Product Owner / User อนุมัติ Decision ทั้ง 4 รายการนี้แล้วเมื่อ 2026-07-21 โดย option analysis และ recommendation เดิมยังคงเป็น historical context ก่อนอนุมัติเท่านั้น การอนุมัตินี้ไม่เลือก technical implementation และไม่เปิด P0 Decisions ที่อนุมัติแล้วกลับมาพิจารณาใหม่

| Decision ID | Final status in this document |
| --- | --- |
| BDR-RETURN-002 | APPROVED — Option C — Product Owner / User — 2026-07-21 |
| BDR-OVERRIDE-003 | APPROVED — Option C — Product Owner / User — 2026-07-21 |
| BDR-OVERRIDE-006 | APPROVED — Option B — Product Owner / User — 2026-07-21 |
| BDR-PRIVACY-001 | APPROVED — Option B — Product Owner / User — 2026-07-21 |

Recommendation ทุกจุดเป็น advisory ก่อนการอนุมัติเท่านั้น ผลที่มีอำนาจคือ User Decision Record ข้างต้นและทะเบียนใน [[07 - ขอบเขต MVP และทะเบียนการตัดสินใจทางธุรกิจ]]
