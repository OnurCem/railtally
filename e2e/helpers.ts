import { expect, type Page } from "@playwright/test";

export async function startGame(page: Page, players = 3) {
  await page.goto("./");
  await page.getByTestId("new-game").click();
  await page.getByTestId(`count-${players}`).click();
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("map-viewport")).toBeVisible();
  await expect(page.getByTestId("map-content")).toBeVisible();
}

/** Taps the middle of a route, picks it from the list if several routes are near, and opens the claim picker. */
export async function openRoute(page: Page, routeId: string) {
  const cars = page.locator(`[data-route="${routeId}"] rect`);
  const box = (await cars.nth(Math.floor((await cars.count()) / 2)).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const list = page.getByTestId("route-list");
  if (await list.isVisible().catch(() => false)) await page.getByTestId(`candidate-${routeId}`).click();
  await expect(page.getByTestId("claim-picker")).toBeVisible();
}

export async function claimRoute(page: Page, routeId: string, playerId = "p1") {
  await openRoute(page, routeId);
  await page.getByTestId(`claim-${playerId}`).click();
  await expect(page.getByTestId("claim-picker")).toBeHidden();
}

export async function openScore(page: Page) {
  await page.getByTestId("score").click();
  await expect(page.getByTestId("score-sheet")).toBeVisible();
}

export async function closeSheet(page: Page) {
  await page.keyboard.press("Escape");
}
