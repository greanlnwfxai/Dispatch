# ADR-0007: Private Evidence Storage Abstraction

- **Status:** Accepted
- **Record Type:** Backfilled ADR
- **Date Recorded:** 2026-07-24
- **Effective Since:** MVP-03 (pre-loading evidence) ต่อเนื่องถึง MVP-04
- **Decision Owners:** Architecture, Engineering; Security/Privacy Review (ขอบเขตการเข้าถึง); Product Owner (การเลือก production provider — ยังไม่ตัดสินใจ)
- **Related BDRs:** None (ขอบเขตนี้เป็นสัญญาสถาปัตยกรรม ไม่ใช่การอนุมัตินโยบายธุรกิจ)
- **Related TDRs:** TDR-STORAGE-001
- **Related Milestones:** MVP-03, MVP-04
- **Supersedes:** None
- **Superseded By:** None

## Context

หลักฐานการปฏิบัติงาน (evidence) เช่นภาพถ่ายก่อนบรรทุกสินค้า (pre-loading
photo) เป็นข้อมูลที่ต้องไม่เปิดเผยต่อสาธารณะ ต้องเข้าถึงได้เฉพาะผู้มีสิทธิ์
ผ่าน API ที่ผ่าน authentication/authorization เท่านั้น (Dispatch Knowledge
Topic 11 หมวด 5.8, หมวด 12) TDR-STORAGE-001 (ตัวเลือก object storage
provider สำหรับ production) ยังไม่ได้รับการอนุมัติจาก Product Owner ณ เวลาที่
MVP-03 ต้อง implement evidence upload/retrieval จริง — ทีมจึงต้องออกแบบ
storage abstraction ที่ใช้งานได้ทันทีในการพัฒนา/ทดสอบ โดยไม่ผูกกับ
production provider ที่ยังไม่ตัดสินใจ และไม่ commit credential ของ third-party
service ใด ๆ ลง repository

## Decision Drivers

- Evidence ต้องไม่เปิดเผยต่อสาธารณะ (private by default)
- ต้อง portable ข้าม provider ในอนาคตโดยไม่กระทบ business logic
- ต้อง reproducible ในเครื่อง local โดยไม่ต้องพึ่ง external service/credential
- Metadata (ฐานข้อมูล) กับ object จริง (storage) ต้อง consistent กันเสมอ
- ต้อง validate เนื้อหาไฟล์จริง ไม่ใช่เชื่อ MIME type ที่ client ส่งมาเพียงอย่าง
  เดียว
- ต้องรองรับการ scale สู่ production โดยไม่ผูกกับ vendor เฉพาะเจาะจงตั้งแต่ชั้น
  domain/service
- หลีกเลี่ยงการผูก evidence bytes เข้ากับฐานข้อมูลเชิงสัมพันธ์โดยตรง (BLOB)
  เพราะสถาปัตยกรรมปัจจุบันไม่ได้ออกแบบมาสำหรับปริมาณไฟล์ภาพจำนวนมาก

## Considered Options

### Option A — Public/static file serving

ข้อดี: implement ง่ายที่สุด, ไม่ต้องมี authentication layer สำหรับไฟล์
ข้อเสีย: ขัดกับ requirement "evidence ต้องไม่เปิดเผยต่อสาธารณะ" โดยตรง —
ไม่ผ่านการพิจารณาตั้งแต่ต้น

### Option B — Database BLOB storage

ข้อดี: transaction เดียวกับ metadata, ไม่ต้องมี storage adapter แยก
ข้อเสีย: ฐานข้อมูลโตเร็วเกินไปเมื่อ evidence สะสม, ไม่เหมาะกับปริมาณภาพจำนวน
มากตามที่ Topic 11 หมวด 5.8 วิเคราะห์ไว้, ผูก evidence lifecycle เข้ากับ
database backup/restore cycle โดยไม่จำเป็น

### Option C — Private storage abstraction พร้อม replaceable adapter (ตัวเลือก
ที่ยอมรับ)

ข้อดี: แยก metadata (PostgreSQL) ออกจาก object จริง (storage adapter)
ตั้งแต่ต้น, เปลี่ยน production provider ได้ในอนาคตโดยไม่แตะ business logic,
adapter สำหรับ dev/test ใช้งานได้ทันทีโดยไม่ต้องมี credential ภายนอก
ข้อเสีย: ต้องดูแล 2 ระบบที่ consistency กันเอง (metadata แถวในฐานข้อมูล กับ
object จริงในระบบไฟล์/storage), เพิ่มความซับซ้อนของ cleanup logic เมื่อ
transaction ล้มเหลวหลัง object ถูกเขียนไปแล้ว

## Decision

Evidence ทั้งหมดผ่าน **storage abstraction** ที่ service ชั้นบน
(`PreparationService`) เรียกผ่าน interface เดียว ไม่แตะ filesystem/storage
provider โดยตรง — implementation ปัจจุบัน (`EvidenceStorageService`,
`apps/api/src/preparation/storage/evidence-storage.service.ts`) เป็น
**filesystem-backed development adapter** ที่เขียนไฟล์ลง
`/var/lib/dispatch/evidence` (กำหนดผ่าน `EVIDENCE_STORAGE_ROOT`) บน Docker
named volume `dispatch_evidence_data` ที่ mount เข้า service `api` เท่านั้น
— ไม่มี host port หรือ public path ใด ๆ ชี้ไปยัง volume นี้

Object key เป็น opaque identifier ที่ generate ด้วย `randomUUID()` ในรูปแบบ
`preparation/{preparationId}/{uuid}.{ext}` — client ไม่เคยได้รับ object key
หรือ filesystem path กลับมาในการตอบสนอง API เนื้อหาไฟล์ถูกตรวจสอบด้วย
magic-byte เทียบกับ MIME header ที่ client ส่งมา (ต้องตรงกันทั้งคู่ — ปฏิเสธ
หากไม่ตรง) จำกัดที่ JPEG/PNG/WebP ขนาดไม่เกิน 5 MB หนึ่งไฟล์ต่อคำขอ ระบบ
คำนวณ SHA-256 ฝั่ง server เหนือ byte ต้นฉบับเก็บเป็น metadata คู่กับ object
key, ประเภทไฟล์, ขนาด, actor, และเวลา — ไฟล์จริง (bytes) **ไม่**ถูกเก็บใน
PostgreSQL

การดึงหลักฐานกลับ (`GET /tasks/:id/preparation/evidence/:evidenceId`) ต้อง
ผ่าน authentication + role guard เสมอ (ไม่ใช่ `@Public()`) และตอบกลับด้วย
`Cache-Control: private, no-store` เสมอ — ไม่มี public URL หรือ presigned
URL ใด ๆ ในขอบเขตปัจจุบัน

Production ยังคงเป้าหมายที่ private S3-compatible object storage ตามที่
TDR-STORAGE-001 วิเคราะห์ไว้ — **ADR นี้ไม่เลือก vendor การเลือก provider
production ยังเป็น open technical decision**

## Consequences

### Positive

- Evidence ไม่เคยเปิดเผยต่อสาธารณะไม่ว่ากรณีใด — ทุกการเข้าถึงผ่าน
  authenticated, authorized API เท่านั้น
- Development/test ใช้งานได้ทันทีโดยไม่ต้องมี credential ของ third-party
  service ใด ๆ (ไม่ต้องแก้ `.env` เพื่อเพิ่ม MinIO/S3 secret)
- การตรวจสอบ magic-byte + SHA-256 ป้องกัน mismatch ระหว่าง MIME type ที่
  client อ้างกับเนื้อหาไฟล์จริง
- Rollback ที่แม่นยำ: หาก metadata transaction ล้มเหลวหลังเขียนไฟล์ไปแล้ว
  ระบบลบเฉพาะ object key ที่เพิ่งสร้างเท่านั้น ไม่มี broad cleanup/prune ที่
  เสี่ยงต่อการลบ object อื่น

### Negative

- Development adapter (filesystem) ไม่ scale เท่า production object storage
  จริง — ไม่มี built-in redundancy, versioning, หรือ multi-region replication
  ตามที่ Topic 11 หมวด 5.8 ระบุไว้เป็นข้อเสียของ local filesystem
- Cross-entity consistency ระหว่างไฟล์จริงกับ metadata ต้องพึ่ง compensating
  action ในโค้ด (try/catch ล้อม transaction) แทนที่จะเป็น atomic operation
  เดียวโดยธรรมชาติของ database transaction — หากกระบวนการ crash ระหว่าง
  `writeObject` สำเร็จแต่ก่อนถึง catch block จะเหลือ orphan object ที่ไม่มี
  metadata อ้างอิง (เสี่ยงต่ำเพราะช่วงเวลานี้สั้นมาก แต่ไม่ใช่ zero-risk)
- Object retrieval ผ่าน `StreamableFile` ของ NestJS แทนการ serve ผ่าน
  CDN/public bucket — ป้องกัน public caching ที่ง่ายกว่าไม่ได้ในทางเทคนิค
  (ต้อง trade-off ความเป็นส่วนตัวกับความเร็วในการ serve ไฟล์ขนาดใหญ่จำนวนมาก
  ในอนาคต)

### Operational Consequences

- `docker-compose.yml` mount `dispatch_evidence_data` เข้า service `api`
  เท่านั้น — evidence data อยู่ใน Docker named volume ไม่ใช่ bind mount ที่
  operator เข้าถึงตรงจาก host โดยไม่ตั้งใจ
- ยังไม่มี production deployment ของ evidence storage — เมื่อเลือก
  S3-compatible provider จริง ต้องมี migration/cutover plan สำหรับข้อมูลที่
  สะสมใน development adapter (ยังไม่ implement)

### Security and Privacy Consequences

- Object key ไม่เคยรั่วไหลให้ client — ป้องกันการเดา/enumerate object path
- `resolveObjectPath` ใน `EvidenceStorageService` ตรวจสอบทั้ง regex ของ
  object key และ path-containment (ป้องกัน path traversal) ก่อนเข้าถึง
  filesystem จริงทุกครั้ง
- Response header `Cache-Control: private, no-store` ป้องกันไม่ให้
  intermediary cache หรือ browser cache เก็บสำเนาหลักฐานไว้

### Testing Consequences

- ต้องมี test ที่ยืนยันการปฏิเสธ MIME/magic-byte ที่ไม่ตรงกัน, ขนาดไฟล์เกิน
  ลิมิต, และการเข้าถึงโดยไม่ผ่าน authentication
- ต้องมี test ที่ยืนยัน compensating-delete ทำงานถูกต้องเมื่อ metadata
  transaction ล้มเหลว (ลบเฉพาะ object ที่เพิ่งสร้าง ไม่ใช่ broad cleanup)

## Implementation Constraints

- Service ชั้นบนต้องเรียกผ่าน storage interface เท่านั้น ห้าม import
  filesystem module โดยตรงนอก storage adapter
- Object key ต้องเป็น opaque identifier ที่ generate โดย server เสมอ ห้ามรับ
  ค่าจาก client
- ทุกการอัปโหลดต้องตรวจสอบ MIME header เทียบกับ magic-byte จริงของเนื้อหาไฟล์
  ก่อนยอมรับ
- ทุก endpoint ที่ retrieve evidence ต้องมี auth guard + role/record-scope
  check และตอบกลับด้วย `Cache-Control: private, no-store` เสมอ ห้ามมี public
  URL หรือ presigned URL ที่ไม่หมดอายุ
- การ cleanup เมื่อ transaction ล้มเหลวต้องลบเฉพาะ object key ที่เพิ่งสร้างใน
  operation นั้นเท่านั้น ห้ามทำ broad cleanup/prune ของ storage
- ห้ามเลือกหรือ implement production storage provider เฉพาะเจาะจงจนกว่า
  TDR-STORAGE-001 จะได้รับการอนุมัติจาก Product Owner/Technical Architecture
  ตามกระบวนการของ Topic 11 หมวด 22

## Repository Evidence

**Decision evidence**
- Dispatch Knowledge Topic 11 หมวด 5.8 (Evidence Object Storage), หมวด 12
  (Evidence Architecture), หมวด 22 แถว `TDR-STORAGE-001` — สถานะปัจจุบัน
  `IMPLEMENTED_FOR_MVP_03_DEV_ADAPTER` (technical implementation decision,
  not Product Owner business approval) — ADR นี้คงสถานะนี้ไว้ตามเดิม ไม่
  เปลี่ยนเป็น approved

**Implementation evidence**
- `apps/api/src/preparation/storage/evidence-storage.service.ts` — interface
  `writeObject`/`deleteObjectIfExists`/`openReadStream`, การตรวจสอบ path
  traversal ใน `resolveObjectPath`
- `apps/api/src/preparation/preparation.service.ts` เมธอด `addEvidence` —
  magic-byte detection (`detectImageMediaType`), ขนาดไฟล์ (`5 * 1024 *
  1024`), SHA-256 (`createHash("sha256")`), compensating delete ใน `catch`
  block (`this.storage.deleteObjectIfExists(objectKey)`)
- `apps/api/src/preparation/preparation.controller.ts` — `@UseGuards(RolesGuard)`
  + `@Roles(...)` บนทั้ง `addEvidence` และ `openEvidence`,
  `Cache-Control: private, no-store` บน response ของ `openEvidence`
- `apps/api/prisma/schema.prisma` model `PreparationEvidence` — field
  `objectKey`, `sha256`, `mediaType`, `sizeBytes` (ไม่มี field เก็บ bytes
  ไฟล์จริง)
- `apps/api/prisma/migrations/20260723152000_fix_preparation_evidence_object_key_check/migration.sql`
  — CHECK constraint บน `object_key` เป็นด่านป้องกันระดับฐานข้อมูลเพิ่มเติม
- `docker-compose.yml` — `EVIDENCE_STORAGE_ROOT: /var/lib/dispatch/evidence`
  และ volume `dispatch_evidence_data` mount เข้า service `api` เท่านั้น

**Test evidence**
- `docs/CTO_SUMMARY_MVP_03.md` หัวข้อ "Evidence Security" และ "Evidence-Storage
  Technical Decision" — ยืนยันขอบเขตการทดสอบ MIME/magic-byte/ขนาด/private
  retrieval/zero residue

**Governance evidence**
- `README.md` หัวข้อ "Docker Compose startup" และตาราง "Architecture
  overview" — ยืนยันคำอธิบายตรงกับโค้ดจริง
- `docs/CTO_SUMMARY_MVP_03.md` หัวข้อ "Remaining Risks" — "TDR-STORAGE-001
  production adapter remains future work"

## Open Follow-ups

- **TDR-STORAGE-001**: การเลือก production S3-compatible provider ยังไม่
  อนุมัติ — ADR นี้บันทึกเฉพาะสัญญา (contract) ของ abstraction ที่ implement
  แล้ว ไม่ใช่การอนุมัติ vendor ใด ๆ อ้างอิง Dispatch Knowledge Topic 11 หมวด
  22 เป็น authoritative source ของสถานะ
- Retention policy ของ evidence (BDR-PRIVACY-003 ถึง 006) ยังเปิดอยู่ — ไม่
  กระทบ abstraction ที่ ADR นี้บันทึก แต่จะกระทบ lifecycle management ในอนาคต
- ยังไม่มี migration/cutover plan จาก development adapter สู่ production
  provider เมื่อ TDR-STORAGE-001 ได้รับการอนุมัติ

## Review Triggers

- เลือก production object-store provider จริง (TDR-STORAGE-001 ได้รับการ
  อนุมัติ)
- นำ presigned upload/download URL เข้ามาใช้
- นำ CDN หรือ private distribution network เข้ามาใช้
- ต้องมี encryption-key management สำหรับ evidence ที่ rest
- มีนโยบาย retention/deletion ของ evidence ที่อนุมัติแล้ว
- ต้องมี antivirus/content scanning ก่อนยอมรับไฟล์
- รองรับหลักฐานวิดีโอขนาดใหญ่
- ต้อง replicate ข้าม region
- มี legal hold ที่กระทบ evidence lifecycle

## References

- Dispatch Knowledge `11 - Technical Architecture และแผนพัฒนา MVP.md` หมวด
  5.8, 12, 22
- `docs/CTO_SUMMARY_MVP_03.md`
- [ADR-0002](ADR-0002-postgresql-prisma-and-forward-only-migrations.md) —
  metadata persistence
- [ADR-0005](ADR-0005-immutable-operational-history-and-audit-trail.md) —
  ความสัมพันธ์กับ evidence history/correction
- [ADR-0006](ADR-0006-rbac-and-server-side-record-scope.md) — การควบคุมสิทธิ์
  การเข้าถึง retrieval endpoint
