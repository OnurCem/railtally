import "fake-indexeddb/auto";
import { clear } from "idb-keyval";
import { beforeEach, describe, expect, it } from "vitest";
import { computeStats, deleteGame, listGames, summarize } from "../src/history/gameIndex";
import { exportAll, importAll } from "../src/history/exportImport";
import { LocalAdapter } from "../src/sync/LocalAdapter";
import { act, setup } from "./helpers";

async function saveGame(gameId: string, extra = [act({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p1" })]) {
  const adapter = new LocalAdapter(gameId);
  const actions = setup(2).map((a) => (a.type === "GAME_CREATED" ? { ...a, gameId } : a));
  for (const a of [...actions, ...extra]) await adapter.dispatch(a);
  return adapter;
}

beforeEach(() => clear());

describe("LocalAdapter", () => {
  it("stores, loads, notifies and removes actions in order", async () => {
    const adapter = new LocalAdapter("g1");
    const seen: string[] = [];
    const unsubscribe = adapter.subscribe((a) => seen.push(a.type));
    const [created, p1] = setup(2);
    await Promise.all([adapter.dispatch(created), adapter.dispatch(p1)]);
    expect((await adapter.load("g1")).map((a) => a.type)).toEqual(["GAME_CREATED", "PLAYER_ADDED"]);
    expect(seen).toEqual(["GAME_CREATED", "PLAYER_ADDED"]);
    await adapter.remove(p1.id);
    expect(await adapter.load("g1")).toHaveLength(1);
    unsubscribe();
    expect(await adapter.load("unknown")).toEqual([]);
  });
});

describe("game history", () => {
  it("lists newest first and skips unreadable games", async () => {
    await saveGame("a");
    await new Promise((r) => setTimeout(r, 5));
    await saveGame("b");
    await new LocalAdapter("broken").dispatch(act({ type: "GAME_ENDED" }));
    const games = await listGames();
    expect(games.map((g) => g.gameId)).toEqual(["b", "a"]);
    expect(games[0].players[0].score).toBe(1);
    await deleteGame("a");
    expect((await listGames()).map((g) => g.gameId)).toEqual(["b"]);
  });

  it("computes stats from finished games", async () => {
    await saveGame("a", [act({ type: "ROUTE_CLAIMED", routeId: "budapest-wien-a", playerId: "p1" }), act({ type: "GAME_ENDED" })]);
    await saveGame("b", [act({ type: "TICKET_POINTS_SET", playerId: "p2", points: 40 }), act({ type: "GAME_ENDED" })]);
    await saveGame("running");
    const stats = computeStats(await listGames());
    expect(stats.gamesPlayed).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.favoriteColor).toBe("red");
    expect(stats.averageScore).toBeGreaterThan(0);
    expect(computeStats([])).toEqual({ gamesPlayed: 0, wins: 0, averageScore: 0, favoriteColor: null });
  });

  it("summarize returns null for invalid logs", () => {
    expect(summarize([act({ type: "GAME_ENDED" })])).toBeNull();
  });
});

describe("export / import", () => {
  it("round-trips games", async () => {
    await saveGame("a");
    await saveGame("b");
    const json = await exportAll();
    await clear();
    expect(await listGames()).toHaveLength(0);
    expect(await importAll(json)).toEqual({ imported: 2, skipped: 0 });
    expect(await listGames()).toHaveLength(2);
  });

  it("rejects invalid files and skips broken games", async () => {
    await expect(importAll("not json")).rejects.toThrow("invalidFile");
    await expect(importAll(JSON.stringify({ app: "other" }))).rejects.toThrow("invalidFile");
    const bad = JSON.stringify({ app: "rotaray", version: 1, games: [{ gameId: "x", actions: [{ type: "GAME_ENDED" }] }] });
    expect(await importAll(bad)).toEqual({ imported: 0, skipped: 1 });
  });
});
