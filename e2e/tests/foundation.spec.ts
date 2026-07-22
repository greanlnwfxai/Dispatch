import { expect, test } from "@playwright/test";

/**
 * Foundation-only E2E checks (DEV-FOUNDATION-001): reachability and the
 * expected identity markers for each surface. No business scenario is
 * exercised — those belong to the milestones that implement them.
 */

const ADMIN_WEB_URL = process.env.E2E_ADMIN_WEB_URL ?? "http://localhost:6001";
const MOBILE_PWA_URL = process.env.E2E_MOBILE_PWA_URL ?? "http://localhost:6003";
const API_URL = process.env.E2E_API_URL ?? "http://localhost:6002";

test("Admin Web is reachable and identifies itself", async ({ page }) => {
  await page.goto(ADMIN_WEB_URL);
  await expect(page.getByText("Dispatch Admin Web")).toBeVisible();
});

test("Mobile/PWA is reachable and identifies itself", async ({ page }) => {
  await page.goto(MOBILE_PWA_URL);
  await expect(page.getByText("Dispatch Mobile/PWA")).toBeVisible();
});

test("API health endpoint returns the expected foundation body", async ({ request }) => {
  const response = await request.get(`${API_URL}/health`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", service: "dispatch-api" });
});
