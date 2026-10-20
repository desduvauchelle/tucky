import { expect, test } from "@playwright/test";
import { installTauriMock } from "./mock";

test("clickable controls show a pointer while editing and dragging retain their cursors", async ({ page }) => {
  await installTauriMock(page, {
    onboardingCompleted: true,
    permissions: { microphone: true, accessibility: true },
    speechModelReady: true,
    llmReady: true,
    projectCount: 3,
  });
  await page.goto("/");
  // Focus now arrives through the assistant; seed the real backend route
  // before exercising the board's existing add/edit controls.
  await page.evaluate(async () => {
    await (window as any).__TAURI_INTERNALS__.invoke("add_focus_task", {
      projectId: "project-1", content: "Existing focus task",
    });
    (window as any).__MOCK_EMIT__("focus:changed", null);
  });
  const board = page.locator(".echo-focus-board");
  await board.getByRole("button", { name: "Add item to Project 1" }).click();
  const input = board.locator("input");
  await expect(input).toHaveCSS("cursor", "text");
  await input.fill("Check cursor behavior");
  await input.press("Enter");
  await input.press("Escape");
  const check = board.getByRole("checkbox", { name: "Check cursor behavior" });
  await check.hover();
  await expect(check).toHaveCSS("cursor", "pointer");
  const add = board.getByRole("button", { name: "Add item to Project 1" });
  await add.hover();
  await expect(add).toHaveCSS("cursor", "pointer");
  await expect(add.locator("svg")).toHaveCSS("cursor", "pointer");
  await expect(board.locator("[data-focus-row]", { hasText: "Check cursor behavior" }).getByRole("button", { name: /Drag to reorder/ })).toHaveCSS("cursor", "grab");
  const failures = await page.locator('button:enabled:not([aria-disabled="true"]):not([class*="cursor-"])').evaluateAll(
    els => els.filter(el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).cursor !== "pointer")
      .map(el => el.getAttribute("aria-label") || el.textContent?.trim()),
  );
  expect(failures).toEqual([]);
  await check.click();
  await expect(check).toHaveAttribute("aria-checked", "true");
});
