import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { claimRoute, closeSheet, openRoute, openScore, startGame } from "./helpers";

test.beforeEach(({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
});

test("home screen loads", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Railtally" })).toBeVisible();
  await expect(page.getByText("not affiliated with Days of Wonder")).toBeVisible();
});

test("claim a route, undo, rotate and keep the game after a reload", async ({ page }) => {
  await startGame(page);

  await claimRoute(page, "budapest-kyiv-a");
  await openScore(page);
  await expect(page.getByTestId("me-route-points")).toHaveText("15");
  await expect(page.getByTestId("me-trains-left")).toHaveText("39");
  await closeSheet(page);

  await page.getByTestId("undo").click();
  await openScore(page);
  await expect(page.getByTestId("me-route-points")).toHaveText("0");
  await closeSheet(page);

  await claimRoute(page, "budapest-kyiv-a", "p2");
  await page.getByTestId("rotate").click();
  await expect(page.getByTestId("map-content")).toHaveAttribute("data-rotated", "true");

  await page.reload();
  await page.getByTestId("game-card").getByRole("button").first().click();
  await expect(page.getByTestId("map-viewport")).toBeVisible();
  await openScore(page);
  await expect(page.getByTestId("score-row-p2")).toContainText("15");
});

test("double routes: only one can be used with 3 players", async ({ page }) => {
  await startGame(page, 3);
  await claimRoute(page, "berlin-frankfurt-a", "p1");
  await openRoute(page, "berlin-frankfurt-b");
  await expect(page.getByTestId("claim-p2")).toBeDisabled();
  await expect(page.getByTestId("claim-p1")).toBeDisabled();
});

test("double routes: both can be used with 4 players", async ({ page }) => {
  await startGame(page, 4);
  await claimRoute(page, "berlin-frankfurt-a", "p1");
  await openRoute(page, "berlin-frankfurt-b");
  await expect(page.getByTestId("claim-p2")).toBeEnabled();
  await expect(page.getByTestId("claim-p1")).toBeDisabled();
});

test("a long press on a city places a station", async ({ page }) => {
  await startGame(page);
  // zoom out to the whole map so that Paris is on screen
  await page.getByTestId("map-viewport").dispatchEvent("wheel", { deltaY: 2000, clientX: 190, clientY: 300 });
  await expect(page.getByTestId("map-content")).toHaveAttribute("data-zoom", "1.00");
  const box = (await page.locator('[data-city="paris"] circle').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.getByTestId("station-sheet")).toBeVisible();
  await page.getByTestId("station-p1").click();
  await openScore(page);
  await expect(page.getByTestId("me-stations-left")).toHaveText("2");
});

test("zoom with the wheel and reset with the menu", async ({ page }) => {
  await startGame(page);
  const content = page.getByTestId("map-content");
  const fitZoom = Number(await content.getAttribute("data-zoom"));
  await page.getByTestId("map-viewport").dispatchEvent("wheel", { deltaY: -400, clientX: 190, clientY: 300 });
  await expect.poll(async () => Number(await content.getAttribute("data-zoom"))).toBeGreaterThan(fitZoom * 1.3);
  await page.getByTestId("menu").click();
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(content).toHaveAttribute("data-zoom", fitZoom.toFixed(2));
});

test("end the game, enter tickets and see the final score in the history", async ({ page }) => {
  await startGame(page, 2);
  await claimRoute(page, "budapest-kyiv-a");
  await page.getByTestId("menu").click();
  await page.getByTestId("end-game").click();

  await expect(page.getByTestId("end-screen")).toBeVisible();
  await page.getByTestId("tickets-p1").fill("20");
  await page.getByTestId("tickets-p1").blur();
  // 15 route points + 12 for three unused stations + 20 tickets + 10 European Express
  await expect(page.getByTestId("total-p1")).toHaveText("57");
  await expect(page.getByTestId("total-p2")).toHaveText("12");
  await expect(page.getByTestId("winner")).toContainText("Me");

  await page.getByTestId("home").click();
  await expect(page.getByTestId("game-card")).toContainText("57");
  await expect(page.getByTestId("stats")).toContainText("1");

  await page.getByTestId("game-card").getByRole("button").first().click();
  await expect(page.getByTestId("end-screen")).toBeVisible();
  await page.getByTestId("view-map").click();
  await expect(page.getByText("Finished game (read-only)")).toBeVisible();
});

test("the last-round banner appears when a player has 2 or fewer trains (via import)", async ({ page }, testInfo) => {
  const routes = JSON.parse(readFileSync("src/data/json/routes.json", "utf8")) as { id: string; length: number; doubleOf?: string }[];
  const meta = (type: string) => ({ id: randomUUID(), actorId: "local", at: Date.now(), type });
  const claims: string[] = [];
  let used = 0;
  for (const r of routes.filter((x) => !x.doubleOf).sort((a, b) => b.length - a.length)) {
    if (used + r.length > 44) continue;
    claims.push(r.id);
    used += r.length;
  }
  expect(45 - used).toBeLessThanOrEqual(2);
  const gameId = randomUUID();
  const actions = [
    { ...meta("GAME_CREATED"), gameId, playerCount: 2 },
    { ...meta("PLAYER_ADDED"), playerId: "p1", name: "", color: "red", isMe: true },
    { ...meta("PLAYER_ADDED"), playerId: "p2", name: "", color: "blue", isMe: false },
    ...claims.map((routeId) => ({ ...meta("ROUTE_CLAIMED"), routeId, playerId: "p2" })),
  ];
  const file = testInfo.outputPath("backup.json");
  writeFileSync(file, JSON.stringify({ app: "railtally", version: 1, exportedAt: Date.now(), games: [{ gameId, actions }] }));

  await page.goto("./");
  await page.getByTestId("import-file").setInputFiles(file);
  await expect(page.getByText("1 game imported.")).toBeVisible();
  await page.getByTestId("game-card").getByRole("button").first().click();
  await expect(page.getByTestId("last-round")).toBeVisible();
  await openScore(page);
  await expect(page.getByTestId("score-row-p2")).toContainText(String(45 - used));
});

test("pinch with two fingers zooms the map", async ({ page, context }) => {
  await startGame(page);
  const cdp = await context.newCDPSession(page);
  const content = page.getByTestId("map-content");
  const touch = (type: "touchStart" | "touchMove" | "touchEnd",  points: { x: number; y: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, id) => ({ ...p, id })) });
  await touch("touchStart", [{ x: 150, y: 400 }, { x: 220, y: 400 }]);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [{ x: 150 - i * 12, y: 400 }, { x: 220 + i * 12, y: 400 }]);
  await touch("touchEnd", []);
  await expect.poll(async () => Number(await content.getAttribute("data-zoom"))).toBeGreaterThan(1.5);
});

test("settings: Turkish, dark theme and color-blind mode", async ({ page }) => {
  await page.goto("./");
  await page.getByTestId("open-settings").click();
  const sheet = page.getByTestId("settings-sheet");
  await sheet.getByLabel("Theme").selectOption("dark");
  await sheet.getByLabel("Color-blind patterns").check();
  await expect(page.locator("html")).toHaveAttribute("data-color-blind", "");
  await sheet.getByLabel("Large text").check();
  await sheet.getByLabel("Language").selectOption("tr");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("new-game")).toHaveText("Yeni oyun");
});

test("works offline after the first visit", async ({ page, context }) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the service worker
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Railtally" })).toBeVisible();
  await page.getByTestId("new-game").click();
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("map-viewport")).toBeVisible();
  await context.setOffline(false);
});

test("the data check screen lists cities and tickets", async ({ page }) => {
  await page.goto("./");
  await page.getByTestId("open-settings").click();
  await page.getByTestId("open-data-check").click();
  await expect(page.getByTestId("data-check")).toBeVisible();
  await expect(page.getByTestId("data-totals")).toContainText("47 cities");
  await expect(page.getByTestId("data-city-paris")).toContainText("Pamplona");
  await expect(page.getByTestId("data-tickets").locator("tbody tr")).toHaveCount(46);
  await page.getByTestId("data-back").click();
  await expect(page.getByTestId("new-game")).toBeVisible();
  await page.goto("./#data");
  await expect(page.getByTestId("data-check")).toBeVisible();
});

test("the map starts zoomed to the screen height and the Fit button restores it", async ({ page }) => {
  await startGame(page);
  const viewport = page.getByTestId("map-viewport");
  const content = page.getByTestId("map-content");
  const fitZoom = Number(await content.getAttribute("data-zoom"));
  expect(fitZoom).toBeGreaterThan(1.3); // a portrait phone is narrower than the map
  const v = (await viewport.boundingBox())!;
  const svg = (await content.locator("svg").boundingBox())!;
  expect(Math.abs(svg.height - v.height)).toBeLessThan(3);
  expect(Math.abs(svg.y + svg.height / 2 - (v.y + v.height / 2))).toBeLessThan(3); // vertically centered
  expect(Math.abs(svg.x + svg.width / 2 - (v.x + v.width / 2))).toBeLessThan(3); // horizontally centered

  await viewport.dispatchEvent("wheel", { deltaY: -600, clientX: 190, clientY: 300 });
  await expect.poll(async () => Number(await content.getAttribute("data-zoom"))).toBeGreaterThan(fitZoom + 0.5);
  await page.getByTestId("fit").click();
  await expect(content).toHaveAttribute("data-zoom", fitZoom.toFixed(2));
});

test("the Android back button goes summary → map → home", async ({ page }) => {
  await startGame(page, 2);
  await page.getByTestId("menu").click();
  await page.getByTestId("end-game").click();
  await expect(page.getByTestId("end-screen")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("map-viewport")).toBeVisible();
  await expect(page.getByText("Finished game (read-only)")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("new-game")).toBeVisible();
  await page.goForward(); // forward into a game that is closed leads nowhere
  await expect(page.getByTestId("new-game")).toBeVisible();
});

test("back from the new-game screen and from the data check", async ({ page }) => {
  await page.goto("./");
  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("start-game")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("new-game")).toBeVisible();

  await page.getByTestId("open-settings").click();
  await page.getByTestId("open-data-check").click();
  await expect(page.getByTestId("data-check")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("new-game")).toBeVisible();
});

test("opening a finished game and pressing back walks to the map, then home", async ({ page }) => {
  await startGame(page, 2);
  await page.getByTestId("menu").click();
  await page.getByTestId("end-game").click();
  await page.getByTestId("home").click();
  await expect(page.getByTestId("game-card")).toBeVisible();
  await page.getByTestId("game-card").getByRole("button").first().click();
  await expect(page.getByTestId("end-screen")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("map-viewport")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("game-card")).toBeVisible();
});

test("claimed routes show the owner's mark only at high zoom", async ({ page }) => {
  await startGame(page);
  await claimRoute(page, "budapest-kyiv-a");
  await expect(page.getByTestId("owner-mark")).toHaveCount(0);
  const viewport = page.getByTestId("map-viewport");
  for (let i = 0; i < 4; i++) await viewport.dispatchEvent("wheel", { deltaY: -500, clientX: 190, clientY: 300 });
  await expect.poll(async () => page.getByTestId("owner-mark").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("owner-mark").first()).toHaveText("1");
  await page.getByTestId("fit").click();
  await expect(page.getByTestId("owner-mark")).toHaveCount(0);
});

test("tapping a route flashes a highlight", async ({ page }) => {
  await startGame(page);
  const cars = page.locator('[data-route="budapest-kyiv-a"] rect');
  const box = (await cars.nth(1).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".map-selected, .map-flash").first()).toBeAttached();
});

test("a finger tap on a route opens the claim dialog and it stays open", async ({ page }) => {
  await startGame(page);
  const cars = page.locator('[data-route="budapest-kyiv-a"] rect');
  const box = (await cars.nth(1).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("claim-picker")).toBeVisible();
  await page.waitForTimeout(500); // the synthesized click arrives after the dialog opened
  await expect(page.getByTestId("claim-picker")).toBeVisible();
  await page.getByTestId("claim-p1").tap();
  await expect(page.getByTestId("claim-picker")).toBeHidden();
});
