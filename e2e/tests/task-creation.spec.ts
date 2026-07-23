import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * MVP-03 — Task creation and preparation flow (Admin Web). Login uses a
 * test-scoped Admin account only, never the real operator password. Fixture
 * setup/teardown runs inside the `api` container (see
 * e2e/scripts/*.cjs) because PostgreSQL has no host port mapping — the
 * Playwright process itself never needs direct database access.
 */

const ADMIN_WEB_URL = process.env.E2E_ADMIN_WEB_URL ?? "http://localhost:6001";
const REPO_ROOT = path.resolve(__dirname, "../..");
const PASSWORD = "e2e-test-password-only-not-a-real-secret";

function runFixtureScript(scriptFile: string, env: Record<string, string>): string {
  const scriptPath = path.join(__dirname, "..", "scripts", scriptFile);
  const args = ["compose", "exec", "-T"];
  for (const [key, value] of Object.entries(env)) {
    args.push("-e", `${key}=${value}`);
  }
  args.push("api", "node");

  const script = readFileSync(scriptPath, "utf8");
  return execFileSync("docker", args, { cwd: REPO_ROOT, input: script, encoding: "utf8" }).trim();
}

test.describe("MVP-03 — Task preparation flow", () => {
  const marker = `mvp03-pw-${randomUUID()}`;
  const loginId = `e2e-pw-${randomUUID()}`;
  let userId = "";
  let customerId = "";

  test.beforeAll(() => {
    const output = runFixtureScript("create-task-fixture.cjs", {
      FIXTURE_MARKER: marker,
      FIXTURE_LOGIN_ID: loginId,
      FIXTURE_PASSWORD: PASSWORD,
      FIXTURE_ROLE_CODE: "ADMIN",
    });
    const parsed = JSON.parse(output) as { userId: string; customerId: string };
    userId = parsed.userId;
    customerId = parsed.customerId;
  });

  test.afterAll(() => {
    if (!userId || !customerId) return;
    runFixtureScript("delete-task-fixture.cjs", {
      FIXTURE_USER_ID: userId,
      FIXTURE_CUSTOMER_ID: customerId,
    });
  });

  test("creates a Task, prepares goods with photo evidence, and confirms READY_FOR_DISPATCH without Assignment scope", async ({
    page,
  }) => {
    await page.goto(`${ADMIN_WEB_URL}/login`);
    await page.getByLabel("Login ID").fill(loginId);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${ADMIN_WEB_URL}/`);

    await page.goto(`${ADMIN_WEB_URL}/tasks/new`);
    await page.getByPlaceholder("ค้นหาลูกค้า/ปลายทาง").fill(marker);
    await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
    await expect(page.getByText(`${marker}-destination`)).toBeVisible();

    await page.getByRole("button", { name: "เลือก" }).click();
    await expect(page.getByText("แหล่งที่มา: MASTER")).toBeVisible();

    await page.getByLabel("วันที่วางแผนจัดส่ง").fill("2026-09-01");
    await page.getByRole("button", { name: "+ เพิ่มรายการสินค้า" }).click();
    await page.getByPlaceholder("รายละเอียดสินค้า").fill("Boxes");
    await page.getByPlaceholder("จำนวน").fill("5");
    await page.getByPlaceholder("หน่วย").fill("BOX");

    await page.getByRole("button", { name: "บันทึกเป็นแบบร่าง (Save as Draft)" }).click();
    await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);
    await expect(page.getByText("สถานะ: DRAFT")).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "ส่งงาน" }).click();
    await expect(page.getByText("สถานะ: WAITING_PREPARATION")).toBeVisible();

    // Historical Destination Snapshot remains visible after submission.
    await expect(page.getByText(`${marker}-destination`)).toBeVisible();
    await expect(page.getByText("123 Playwright Test Rd.")).toBeVisible();

    await page.getByRole("button", { name: "เริ่มเตรียมสินค้า" }).click();
    await expect(page.getByText("สถานะ: PREPARING")).toBeVisible();
    await page.getByLabel("prepared-1").fill("5");
    await page.getByLabel("note-1").fill("prepared in browser e2e");
    await page.getByRole("button", { name: "บันทึกจำนวนที่เตรียม" }).click();

    const pngBytes = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    await page.locator('input[type="file"]').setInputFiles({
      name: "loading.png",
      mimeType: "image/png",
      buffer: pngBytes,
    });
    await page.getByRole("button", { name: "อัปโหลดรูป" }).click();
    await expect(page.getByRole("button", { name: /เปิดรูป loading\.png/ })).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "ยืนยันพร้อมจัดส่ง" }).click();
    await expect(page.getByText("สถานะ: READY_FOR_DISPATCH")).toBeVisible();

    // Assignment/Delivery scope remains excluded in MVP-03.
    await expect(page.getByRole("button", { name: /มอบหมาย/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /มอบหมาย/ })).toHaveCount(0);
    // No delete action ever exists.
    await expect(page.getByRole("button", { name: /ลบงาน|delete task/i })).toHaveCount(0);
  });
});
