import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * MVP-04 — Delivery Task Assignment flow (Admin Web). Login uses a
 * test-scoped Dispatcher account only, never the real operator password.
 * Fixture setup/teardown runs inside the `api` container (see
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

test.describe("MVP-04 — Delivery Task Assignment flow", () => {
  const marker = `mvp04-pw-${randomUUID()}`;
  const actorLoginId = `e2e-pw-assign-${randomUUID()}`;
  let actorUserId = "";
  let candidateAUserId = "";
  let candidateBUserId = "";
  let customerId = "";
  let taskId = "";

  test.beforeAll(() => {
    const output = runFixtureScript("create-assignment-fixture.cjs", {
      FIXTURE_MARKER: marker,
      FIXTURE_ACTOR_LOGIN_ID: actorLoginId,
      FIXTURE_PASSWORD: PASSWORD,
      FIXTURE_ACTOR_ROLE_CODE: "DISPATCHER",
    });
    const parsed = JSON.parse(output) as {
      actorUserId: string;
      candidateAUserId: string;
      candidateBUserId: string;
      customerId: string;
      taskId: string;
    };
    actorUserId = parsed.actorUserId;
    candidateAUserId = parsed.candidateAUserId;
    candidateBUserId = parsed.candidateBUserId;
    customerId = parsed.customerId;
    taskId = parsed.taskId;
  });

  test.afterAll(() => {
    if (!taskId || !actorUserId) return;
    runFixtureScript("delete-assignment-fixture.cjs", {
      FIXTURE_TASK_ID: taskId,
      FIXTURE_ACTOR_USER_ID: actorUserId,
      FIXTURE_CANDIDATE_A_USER_ID: candidateAUserId,
      FIXTURE_CANDIDATE_B_USER_ID: candidateBUserId,
      FIXTURE_CUSTOMER_ID: customerId,
    });
  });

  test("assigns a READY_FOR_DISPATCH task to a primary + supporting employee, then formally reassigns it", async ({ page }) => {
    await page.goto(`${ADMIN_WEB_URL}/login`);
    await page.getByLabel("Login ID").fill(actorLoginId);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${ADMIN_WEB_URL}/`);

    await page.goto(`${ADMIN_WEB_URL}/tasks/${taskId}`);
    await expect(page.getByText("สถานะ: READY_FOR_DISPATCH")).toBeVisible();

    await page.getByLabel("ค้นหาพนักงานจัดส่ง").fill(marker);
    await page.getByRole("button", { name: "ค้นหา" }).click();
    await expect(page.getByText(`${marker}-driver-a`)).toBeVisible();
    await expect(page.getByText(`${marker}-driver-b`)).toBeVisible();

    const driverARow = page.locator("li", { hasText: `${marker}-driver-a` });
    await driverARow.getByRole("button", { name: "เลือกเป็นผู้รับผิดชอบหลัก" }).click();
    const driverBRow = page.locator("li", { hasText: `${marker}-driver-b` });
    await driverBRow.getByRole("button", { name: /ร่วมปฏิบัติงาน/ }).click();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "ยืนยันมอบหมายงาน" }).click();

    await expect(page.getByText("สถานะ: ASSIGNED")).toBeVisible();
    const currentAssignment = page.getByTestId("current-assignment");
    await expect(currentAssignment.getByText(`${marker}-driver-a`)).toBeVisible();
    await expect(currentAssignment.getByText(/ข้อมูลเท่านั้น ไม่มีสิทธิ์ปฏิบัติงานแทน/)).toBeVisible();

    // Formal reassignment: pick driver B as the new primary with a mandatory reason.
    await page.getByLabel("ค้นหาพนักงานจัดส่ง").fill(marker);
    await page.getByRole("button", { name: "ค้นหา" }).click();
    const reassignDriverBRow = page.locator("li", { hasText: `${marker}-driver-b` });
    await reassignDriverBRow.getByRole("button", { name: "เลือกเป็นผู้รับผิดชอบหลัก" }).click();
    await page.getByLabel("เหตุผลการมอบหมายใหม่ (บังคับ)").fill("Original driver reported unavailable.");

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "ยืนยันมอบหมายใหม่" }).click();

    await expect(page.getByText("สถานะ: ASSIGNED")).toBeVisible();
    await expect(currentAssignment.getByText(`${marker}-driver-b`)).toBeVisible();
    await expect(currentAssignment.getByText("Original driver reported unavailable.")).toBeVisible();
    const assignmentHistory = page.getByTestId("assignment-history");
    await expect(assignmentHistory.getByText("มอบหมายใหม่")).toBeVisible();

    // MVP-04 ends at ASSIGNED — no start-delivery/execution control exists.
    await expect(page.getByRole("button", { name: /เริ่มจัดส่ง|start delivery/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /ลบงาน|delete task/i })).toHaveCount(0);
  });
});
