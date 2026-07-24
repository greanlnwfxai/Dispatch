# ADR-0001: Application Architecture and Workspace Boundaries

- **Status:** Accepted
- **Record Type:** Backfilled ADR
- **Date Recorded:** 2026-07-24
- **Effective Since:** DEV-FOUNDATION-001 (monorepo/workspace structure) ต่อเนื่องถึง MVP-04
- **Decision Owners:** Product Owner (เลือก framework แต่ละ workspace), Architecture, Engineering
- **Related BDRs:** None
- **Related TDRs:** TDR-REPO-001, TDR-WEB-001, TDR-MOBILE-001, TDR-API-001
- **Related Milestones:** DEV-FOUNDATION-001, DEV-FOUNDATION-002, AUTH-001, MVP-02, MVP-03, MVP-04
- **Supersedes:** None
- **Superseded By:** None

## Context

Dispatch มีสาม application surface ที่ต้องทำงานร่วมกัน: Admin Web, Internal
Delivery Mobile/PWA, และ Backend API (Dispatch Knowledge Topic 11 หมวด 3.1)
ทั้งสาม surface ต้องแชร์แนวคิดเดียวกัน เช่น Task status enum, Role code,
API contract shape — หากแต่ละ surface นิยามสิ่งเหล่านี้แยกกัน จะเสี่ยงต่อ
ความไม่ตรงกัน (drift) ระหว่าง frontend กับ backend และเสี่ยงต่อการที่
frontend กลายเป็นแหล่งความจริงคู่ขนานของ business rule ซึ่งขัดกับหลักการ
"Business rules are authoritative" ของ Topic 11 หมวด 2 ข้อ 1 — Backend API
ต้องเป็นจุดเดียวที่บังคับใช้ business/validation rule เสมอ (Topic 11 หมวด
3.1) ทีมต้องเลือกโครงสร้าง repository และขอบเขตการพึ่งพา (dependency
boundary) ที่รองรับข้อกำหนดนี้ตั้งแต่ระดับ tooling

## Decision Drivers

- Business rule ต้องสอดคล้องกันเดียว ไม่ซ้ำซ้อนข้าม surface
- Contract (DTO, enum, status code) ต้องแชร์ระหว่าง API กับทั้งสอง frontend
  โดยไม่ duplicate นิยาม
- แยกขอบเขตระหว่าง UI กับ authorization อย่างชัดเจน (UI ไม่ใช่จุดตัดสินใจ
  สิทธิ์)
- แต่ละ application ต้อง deploy ได้อิสระ (Admin Web/API/Mobile-PWA เป็นสาม
  container แยกกัน)
- Type consistency ทั่วทั้ง stack (TypeScript)
- ทดสอบได้ในแต่ละชั้นแยกกัน (unit ที่ `packages/*`, integration ที่
  `apps/api`, e2e ที่ `e2e/`)
- หลีกเลี่ยงการเขียน status/permission logic ซ้ำในหลายที่

## Considered Options

### Option A — Repository แยกอิสระต่อ application พร้อม model ที่ duplicate กัน

ข้อดี: deploy pipeline แยกอิสระสมบูรณ์, ทีมเล็กจัดการ ownership ชัดเจนกว่าใน
องค์กรขนาดใหญ่
ข้อเสีย: Type/contract ระหว่าง API กับ frontend drift กันได้ง่าย ต้อง publish
package แยกหรือ copy-paste type ทุกครั้งที่ contract เปลี่ยน — เสี่ยงสูงต่อ
ขนาดทีมปัจจุบันของ Dispatch

### Option B — แอปพลิเคชันเดียวที่รวม UI และ API logic ไว้ด้วยกัน

ข้อดี: ไม่ต้องจัดการ workspace/package แยก, deploy หน่วยเดียว
ข้อเสีย: ไม่มีขอบเขตชัดเจนระหว่าง Presentation กับ Application/Domain, เสี่ยง
สูงที่ business logic จะรั่วเข้าไปในชั้น UI, ไม่รองรับ Mobile/PWA และ Admin
Web ที่ต้อง deploy แยกกันเป็นคนละ container ตาม Topic 11 หมวด 3.1

### Option C — Monorepo พร้อม shared domain/contracts และ application แยก
deploy อิสระ (ตัวเลือกที่ยอมรับ)

ข้อดี: Shared type/contract เดียวกันระหว่าง apps ทั้งหมดผ่าน npm workspaces,
atomic commit ข้าม surface เมื่อ contract เปลี่ยน, แต่ละ app ยัง build/deploy
เป็น container อิสระได้ (production build แยกกันตาม `docker-compose.yml`)
ข้อเสีย: Build tooling ซับซ้อนขึ้น (ต้องจัดการลำดับ build ของ
`packages/*` ก่อน `apps/*` เสมอ), CI ต้องรันทุก workspace แม้เปลี่ยนแค่จุด
เดียว (ไม่มี path-based trigger แยกในขอบเขตปัจจุบัน)

## Decision

Dispatch เป็น **monorepo ที่จัดการด้วย npm workspaces** — root `package.json`
ประกาศ workspace 9 รายการ:
`packages/shared-types`, `packages/domain`, `packages/validation`,
`packages/contracts`, `packages/test-utils`, `apps/api`, `apps/admin-web`,
`apps/mobile-pwa`, `e2e` ทิศทางการพึ่งพาบังคับด้วยการประกาศ dependency ใน
`package.json` ของแต่ละ workspace (ไม่ใช่ TypeScript project references —
`tsconfig.base.json` เป็นเพียง compiler option ฐานร่วมกัน ไม่ได้บังคับ
dependency graph ด้วยตัวเอง):

- **`packages/domain`** เป็น framework-independent — `package.json` ไม่มี
  dependency ใด ๆ ไปยัง NestJS/Next.js/Prisma/React และไม่มี import ของ
  framework เหล่านี้ในซอร์สโค้ด (ยืนยันด้วย grep) เก็บ record type และ
  business validation function ที่ทดสอบได้โดยไม่ต้องมี database/HTTP จริง
- **`packages/contracts`** เก็บ DTO/API contract ที่แชร์ระหว่าง API กับ
  frontend ทั้งสอง (health/readiness, auth, Task, preparation, assignment)
  — depends on `@dispatch/shared-types` เท่านั้น
- **`packages/shared-types`** เก็บ enum/status code/role code ที่เป็น
  "single source" ของค่าคงที่เหล่านี้ (เช่น `DELIVERY_TASK_STATUS_CODES`)
- **`packages/validation`** เก็บเฉพาะ generic assertion helper — ไม่มี
  BR-xxx/VR-xxx business rule ใด ๆ (ยืนยันด้วย doc-comment ในไฟล์เอง)
- **`apps/api`** (NestJS) เป็นแอปเดียวที่ depend on ทั้ง `@dispatch/domain`,
  `@dispatch/contracts`, `@dispatch/shared-types`, `@dispatch/validation`
  พร้อม NestJS/Prisma — เป็นจุดเดียวที่เข้าถึงฐานข้อมูลและบังคับใช้ business
  rule
- **`apps/admin-web`** และ **`apps/mobile-pwa`** (Next.js) depend on เฉพาะ
  `@dispatch/contracts` และ `@dispatch/shared-types` — **ไม่** depend on
  `@dispatch/domain` โดยตรง ทั้งสองแอปเรียก API ผ่าน HTTP client
  (เช่น `apps/admin-web/src/lib/tasks-client.ts`) แทนการ reimplement
  business validation ฝั่ง client
- **`e2e/`** เป็น workspace แยกสำหรับ Playwright ที่ทดสอบ flow ข้าม
  application จริงผ่าน browser ไม่ใช่ผ่าน internal import

## Consequences

### Positive

- Contract เปลี่ยนแปลงที่จุดเดียว (`packages/contracts`/`packages/shared-types`)
  แล้วสะท้อนไปยังทุก consumer ทันทีที่ build ใหม่ — ไม่มี type drift ระหว่าง
  API กับ frontend
- `packages/domain` ทดสอบได้เร็วและอิสระจาก framework ใด ๆ (Vitest, ไม่ต้อง
  mock NestJS/Prisma/React)
- Frontend ทั้งสองไม่มีทางกลายเป็นแหล่งความจริงคู่ขนานของ business rule
  เพราะไม่มี dependency ไปยัง `@dispatch/domain` เลย — บังคับให้ทุก
  validation ที่มีนัยสำคัญต้องผ่าน API

### Negative

- Build ต้องเรียงลำดับ `packages/*` ก่อน `apps/*` เสมอ (`npm run
  build:packages` แยกจาก `npm run build`) — เพิ่มความซับซ้อนของ script
  เทียบกับ single-app repository
- ไม่มี TypeScript project references หรือ lint rule ระดับ tooling ที่บังคับ
  ทิศทางการพึ่งพาโดยอัตโนมัติ — การป้องกัน `packages/domain` ไม่ให้ import
  framework อาศัย code review และการไม่มี dependency declared ใน
  `package.json` เป็นหลัก ไม่ใช่ compiler-enforced boundary
- CI รันทุก workspace ในทุก commit (ไม่มี path-based trigger แยกตาม workspace
  ที่เปลี่ยน) — เวลารัน CI เพิ่มขึ้นตามจำนวน workspace แม้เปลี่ยนแค่จุดเดียว

### Operational Consequences

- ทั้งสาม application build เป็น production build แยกกัน (`node
  dist/main.js` สำหรับ API, `node server.js` จาก Next `output: "standalone"`
  สำหรับสองแอป) และ deploy เป็น container อิสระตาม `docker-compose.yml` — ไม่
  กระทบกันเมื่อ scale หรือ restart แยกกัน

### Security and Privacy Consequences

- เพราะ frontend ไม่มี business validation logic ของตัวเอง การ bypass UI
  guard (เช่นแก้ JavaScript ฝั่ง client) จึงไม่เปิดช่องทางข้าม business rule
  ใด ๆ — Backend API ยังคงเป็นด่านตรวจสอบเดียว (ดูเพิ่มเติม
  [ADR-0006](ADR-0006-rbac-and-server-side-record-scope.md))

### Testing Consequences

- Unit test แยกระดับ `packages/*` (Vitest) ทดสอบ domain/contract logic ได้
  เร็วโดยไม่ต้องมี HTTP/database
- Integration test ระดับ `apps/api` (Jest + Supertest) ทดสอบ guard/transaction
  จริง
- E2E test ระดับ `e2e/` (Playwright) ทดสอบ flow ข้าม application ผ่าน
  browser จริง — เป็นชั้นทดสอบที่ครอบคลุมการเชื่อมต่อจริงระหว่าง surface
  ทั้งหมด

## Implementation Constraints

- `packages/domain` ต้องไม่ประกาศ dependency หรือ import NestJS, Next.js,
  Prisma, React, หรือโค้ดเฉพาะ Docker ใด ๆ
- `apps/admin-web` และ `apps/mobile-pwa` ต้องไม่ import `@dispatch/domain`
  โดยตรง — logic ที่มีนัยสำคัญทางธุรกิจต้องเรียกผ่าน API เท่านั้น
- `packages/validation` ต้องไม่มี business rule ที่ trace กลับไปยัง BR-xxx/
  VR-xxx ของ Topic 06 — เฉพาะ generic assertion helper เท่านั้น
- Workspace ใหม่ที่เพิ่มเข้ามาในอนาคตต้องประกาศใน root `package.json`
  `workspaces` array และระบุ dependency ทิศทางเดียว (Presentation ->
  Application -> Domain) ตาม Topic 11 หมวด 4.2
- ห้าม deploy `apps/admin-web`/`apps/mobile-pwa`/`apps/api` ด้วย dev server
  (`next dev`, `nest start --watch`) ใน production build path

## Repository Evidence

**Decision evidence**
- Dispatch Knowledge Topic 11 หมวด 3.1, 4.1–4.2 (Logical Layers, Dependency
  Direction), หมวด 5.1–5.4 (Repository Structure/Framework), หมวด 22 แถว
  `TDR-REPO-001`/`TDR-WEB-001`/`TDR-MOBILE-001`/`TDR-API-001` (สถานะ
  `APPROVED`)

**Implementation evidence**
- `package.json` (root) — `"workspaces"` array 9 รายการ
- `packages/domain/package.json` — ไม่มี dependency ไปยัง NestJS/Next.js/
  Prisma/React; grep ยืนยันไม่มี import ของ framework เหล่านี้ใน
  `packages/domain/src/`
- `packages/validation/src/index.ts` — doc-comment ยืนยัน "Deliberately
  contains no Dispatch business/validation rules (BR-xxx, VR-xxx...)"
- `packages/contracts/package.json` — depends on `@dispatch/shared-types`
  เท่านั้น
- `apps/api/package.json` — depends on `@dispatch/contracts`,
  `@dispatch/domain`, `@dispatch/shared-types`, `@dispatch/validation`,
  `@nestjs/*`, `@prisma/client`
- `apps/admin-web/package.json`, `apps/mobile-pwa/package.json` — depends on
  `@dispatch/contracts`, `@dispatch/shared-types`, `next`, `react` เท่านั้น
  (ไม่มี `@dispatch/domain`)
- `apps/admin-web/src/lib/tasks-client.ts` — เรียก API ผ่าน `authFetch` และ
  path builder จาก `@dispatch/contracts` แทนการ reimplement validation
- `e2e/package.json` — workspace แยกสำหรับ Playwright, depends on
  `@playwright/test` เท่านั้น
- `tsconfig.base.json` — compiler option ฐานร่วมกัน (ไม่ใช่ project
  references ที่บังคับ dependency graph)

**Test evidence**
- `apps/admin-web`/`apps/mobile-pwa` มี Vitest configuration แยกจาก
  `apps/api` ที่ใช้ Jest (`docs` ยืนยันใน Topic 11 หมวด 5.11, `TDR-TEST-001`)
- `e2e/` มี Playwright suite ที่ทดสอบ MVP-02/MVP-04 flow ข้าม application จริง

**Governance evidence**
- `CLAUDE.md` §4 (Repository Structure), §5 (Architecture Rules — "packages/domain
  must never import NestJS, Next.js, Prisma, React, or Docker-specific code")
- `README.md` หัวข้อ "Architecture overview" และ "Repository structure"

## Open Follow-ups

- ไม่มี lint rule หรือ TypeScript project reference ที่บังคับทิศทางการพึ่งพา
  โดยอัตโนมัติในระดับ tooling — ปัจจุบันอาศัยการไม่ประกาศ dependency และ code
  review เท่านั้น อาจพิจารณาเพิ่ม dependency-boundary lint rule ในอนาคตหาก
  ทีมขยายใหญ่ขึ้น (ไม่ใช่การตัดสินใจของ ADR นี้)
- ไม่มี path-based CI trigger แยกตาม workspace — ทุก commit รันทุก workspace

## Review Triggers

- แยก workspace ใดออกเป็น repository อิสระ
- เพิ่ม backend service ที่สอง (นอกเหนือจาก `apps/api`)
- เปลี่ยนไปใช้สถาปัตยกรรมแบบ event-driven ข้าม service
- แทนที่ shared package ด้วย generated contract (เช่น OpenAPI codegen)
- ข้อกำหนดการ deploy ที่ทำให้ขอบเขต workspace ปัจจุบันใช้ไม่ได้อีกต่อไป

## References

- Dispatch Knowledge `11 - Technical Architecture และแผนพัฒนา MVP.md` หมวด
  3, 4, 5, 6, 7, 22
- `docs/CTO_SUMMARY_DEV_FOUNDATION_001.md`
- `CLAUDE.md` §4, §5
- [ADR-0006](ADR-0006-rbac-and-server-side-record-scope.md)
