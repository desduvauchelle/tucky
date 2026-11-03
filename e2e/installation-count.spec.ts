import { test, expect } from "@playwright/test";
import { installTauriMock, recordedCalls } from "./mock";

test("counting is optional and requires a separate explicit action", async ({ page }) => {
  await installTauriMock(page, { adoptionAvailable: true });
  await page.goto("/");
  const count = page.getByRole("button", { name: "Count this installation", exact: true });
  await expect(count).toBeEnabled();
  expect((await recordedCalls(page)).filter(c => c.cmd === "adoption_choose")).toEqual([]);
  await count.click();
  await expect(page.getByText("Your installation was counted. No further reports will be sent.")).toBeVisible();
  expect((await recordedCalls(page)).filter(c => c.cmd === "adoption_choose")).toEqual([
    expect.objectContaining({ args: { count: true } }),
  ]);
  await page.reload();
  await expect(count).toHaveCount(0);
});

test("declining persists and does not submit a count", async ({ page }) => {
  await installTauriMock(page, { adoptionAvailable: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Don’t send", exact: true }).click();
  await expect(page.getByText("Your choice is saved. Nothing was sent.")).toBeVisible();
  expect((await recordedCalls(page)).filter(c => c.cmd === "adoption_choose")).toEqual([
    expect.objectContaining({ args: { count: false } }),
  ]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Count this installation", exact: true })).toHaveCount(0);
});

test("unconfigured builds send nothing and allow setup to continue", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await expect(page.getByText("Counting is not enabled in this build. Nothing is sent.")).toBeVisible();
  await page.getByRole("button", { name: "Skip setup for now" }).click();
  await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
  expect((await recordedCalls(page)).some(c => c.cmd === "adoption_choose")).toBe(false);
});

test("ambiguous delivery shows an error without offering a duplicate report", async ({ page }) => {
  await installTauriMock(page, { adoptionAvailable: true, adoptionError: "Delivery unconfirmed. You can continue setup." });
  await page.goto("/");
  await page.getByRole("button", { name: "Count this installation", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Delivery unconfirmed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Count this installation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skip setup for now" })).toBeEnabled();
});

test("existing installations never appear as fresh installs", async ({ page }) => {
  await installTauriMock(page, { adoptionAvailable: true, adoptionChoice: "ineligible" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to Tucky" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Help count Tucky installations (optional)" })).toHaveCount(0);
});

test("the consent controls fit a narrow viewport and remain keyboard accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installTauriMock(page, { adoptionAvailable: true });
  await page.goto("/");
  const count = page.getByRole("button", { name: "Count this installation", exact: true });
  await count.scrollIntoViewIfNeeded();
  await count.focus();
  await expect(count).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Don’t send", exact: true })).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: "output/playwright/installation-count/narrow.png", fullPage: true });
});
