import { expect, test, type Page } from "@playwright/test";
import { installTauriMock, recordedCalls } from "./mock";
import type { RecordingRow } from "../src/lib/api";

const recording = (id: string, title: string): RecordingRow => ({
  id, title, created_at: Date.UTC(2026, 9, 28, 12),
  file_path: `/already-removed-in-finder/${id}.mp4`,
  duration_ms: 1000, width: 1920, height: 1080, size_bytes: 1000,
  source_label: "Screen", has_mic: true, has_sysaudio: true,
  thumb_path: null, drive_file_id: null, drive_link: null,
  upload_status: "local", upload_error: null, exports: "[]",
  transcript: null, denoised_path: null, events_path: null,
  project_json: null, webcam_path: null, cursor_hidden: false,
  webcam_offset_ms: null, n_events: null, n_clicks: null,
  project_id: null, confidence: null, classified_by: null,
});
const recordings = [recording("a", "Walkthrough one"), recording("b", "Walkthrough two"), recording("c", "Other clip")];
const ready = {
  onboardingCompleted: true, permissions: { microphone: true, accessibility: true },
  speechModelReady: true, llmReady: true, recordings,
};
const deletedIds = async (page: Page) => (await recordedCalls(page))
  .filter((call) => call.cmd === "delete_recording").map((call) => call.args.id);
const selectTab = (page: Page) => page.locator(".echo-filter-toolbar").getByRole("button", { name: "Recordings", exact: true }).click();

test("select all removes stale recording entries only after confirmation", async ({ page }) => {
  await installTauriMock(page, ready);
  await page.goto("/");
  await selectTab(page);
  await page.getByRole("button", { name: "Select recordings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete selected", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.getByText("3 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Delete 3 recordings?");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Delete recordings", exact: true })).toBeFocused();
  expect(await deletedIds(page)).toEqual([]);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await deletedIds(page)).toEqual([]);
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete recordings", exact: true }).click();
  await expect.poll(() => deletedIds(page)).toEqual(["a", "b", "c"]);
  await expect(page.getByText("No recordings yet.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Open recording:/ })).toHaveCount(0);
});

test("individual checkboxes, deselect all, and Done preserve normal recording controls", async ({ page }) => {
  await installTauriMock(page, ready);
  await page.goto("/");
  await selectTab(page);
  await expect(page.getByRole("button", { name: "Open recording: Walkthrough one", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Select recordings", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: "Select recording: Walkthrough one", exact: true });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(3);
  await page.getByRole("button", { name: "Deselect all", exact: true }).click();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Select recording: Other clip", exact: true }).click();
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Delete 1 recording?");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open recording: Walkthrough one", exact: true })).toBeVisible();
  expect(await deletedIds(page)).toEqual([]);
});

test("search scopes Select all and changing the filter clears selection", async ({ page }) => {
  await installTauriMock(page, ready);
  await page.goto("/");
  await selectTab(page);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("textbox", { name: "Search captures" }).fill("Walkthrough");
  await expect(page.getByRole("button", { name: "Open recording: Other clip", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Select recordings", exact: true }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.locator(".echo-filter-toolbar").getByRole("button", { name: "All", exact: true }).click();
  await selectTab(page);
  await expect(page.getByRole("button", { name: "Select recordings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Select recordings", exact: true }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete recordings", exact: true }).click();
  await expect.poll(() => deletedIds(page)).toEqual(["a", "b"]);
  await page.getByRole("textbox", { name: "Search captures" }).fill("");
  await expect(page.getByRole("button", { name: "Open recording: Other clip", exact: true })).toBeVisible();
});

test("a failed delete keeps only failed entries selected and continues the batch", async ({ page }) => {
  await installTauriMock(page, { ...ready, recordingDeleteErrors: { b: "Database is busy" } });
  await page.goto("/");
  await selectTab(page);
  await page.getByRole("button", { name: "Select recordings", exact: true }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete recordings", exact: true }).click();
  await expect.poll(() => deletedIds(page)).toEqual(["a", "b", "c"]);
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "Select recording: Walkthrough two", exact: true })).toBeChecked();
  await expect(page.getByRole("alert").filter({ hasText: "Could not delete 1 recording" })).toBeVisible();
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete recordings", exact: true }).click();
  await expect.poll(() => deletedIds(page)).toEqual(["a", "b", "c", "b"]);
});

test("Select all includes the entire recording library beyond an item page", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 650 });
  await installTauriMock(page, { ...ready, recordings: Array.from({ length: 60 }, (_, i) => recording(`r${i}`, `Clip ${i}`)) });
  await page.goto("/");
  await selectTab(page);
  await page.getByRole("button", { name: "Select recordings", exact: true }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.getByText("60 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Delete 60 recordings?");
  await page.screenshot({ path: "output/playwright/recording-selection-confirmation.png" });
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.screenshot({ path: "output/playwright/recording-selection.png" });
  await page.setViewportSize({ width: 600, height: 500 });
  const scroller = page.locator(".echo-dashboard-scroll");
  expect(await scroller.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Delete selected", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "output/playwright/recording-selection-small.png" });
  expect(await deletedIds(page)).toEqual([]);
});
