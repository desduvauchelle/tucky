import { expect, test } from "@playwright/test";
import { installTauriMock } from "./mock";

test("a rejected update stays visible and explains that the current app was kept", async ({ page }) => {
  await installTauriMock(page, {
    onboardingCompleted: true,
    permissions: { microphone: true, accessibility: true },
    speechModelReady: true, llmReady: true,
  });
  await page.goto("/");
  await page.evaluate(() => {
    const original = (window as any).__TAURI_INTERNALS__.invoke;
    (window as any).__TAURI_INTERNALS__.invoke = (cmd: string, args: unknown) =>
      cmd === "apply_update_and_restart"
        ? Promise.reject("The downloaded update could not be verified. Your current app has been kept.")
        : original(cmd, args);
  });
  await expect.poll(async () => {
    await page.evaluate(() => (window as any).__MOCK_EMIT__("update-ready", { version: "1.0.29" }));
    return page.getByRole("button", { name: /^Restart now$/i }).count();
  }).toBe(1);
  await page.getByRole("button", { name: /^Restart now$/i }).click();
  await expect(page.getByText("The downloaded update could not be verified. Your current app has been kept.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Restart now$/i })).toBeVisible();
});
