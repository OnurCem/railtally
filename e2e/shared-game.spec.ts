import { expect, test } from "@playwright/test";
import { openRoute } from "./helpers";

test("shared games say so when no server is set up", async ({ page }) => {
  await page.goto("./");
  await page.getByTestId("new-game").click();
  await page.getByTestId("mode-together").click();
  await expect(page.getByTestId("start-game")).toBeDisabled();
  await page.goto("./");
  await page.getByTestId("join-game").click();
  await expect(page.getByTestId("join-not-configured")).toBeVisible();
  await expect(page.getByTestId("join-lookup")).toBeDisabled();
});

test("create a shared game, see its code and play", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("railtally:syncUrl", "memory:"));
  await page.goto("./");
  await page.getByTestId("new-game").click();
  await page.getByTestId("mode-together").click();
  await page.getByTestId("count-3").click();
  await page.getByTestId("name-1").fill("Ayşe");
  await expect(page.getByTestId("player-2")).toHaveCount(0); // others join with their own phones
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("map-viewport")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toContainText("online");

  await page.getByTestId("menu").click();
  await page.getByTestId("open-share").click();
  await expect(page.getByTestId("room-code")).toHaveText(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("share-sheet")).toBeHidden();
  await page.keyboard.press("Escape");

  await openRoute(page, "budapest-wien-a");
  await page.locator('[data-testid^="claim-p-"]').first().click();
  await expect(page.getByTestId("claim-picker")).toBeHidden();
  await expect(page.getByTestId("undo")).toBeEnabled();
  await expect(page.getByTestId("sync-status")).not.toContainText("waiting");
});

test("a shared link opens the join screen with the code filled in", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("railtally:syncUrl", "memory:"));
  await page.goto("./#join=abc-234");
  await expect(page.getByTestId("join-code")).toHaveValue("ABC234");
  await page.getByTestId("join-lookup").click();
  await expect(page.getByTestId("join-error")).toBeVisible(); // no such game on the (empty) in-memory server
});
