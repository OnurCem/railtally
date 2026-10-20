import { describe, expect, it } from "vitest";
import { routes } from "../src/data/routes";
import { tryReduce, replay } from "../src/game/reducer";
import { initialState } from "../src/game/state";
import { finalScore, autoExpressWinners, isLastRound, stationsLeft, trainsLeft, winners } from "../src/game/selectors";
import { makeAction } from "../src/game/actions";
import { act, setup, stateOf } from "./helpers";

const single = routes.find((r) => !r.doubleOf && r.length === 2)!;
const double = routes.find((r) => r.doubleOf)!;
const twin = routes.find((r) => r.id === double.doubleOf)!;
const claim = (routeId: string, playerId: string) => act({ type: "ROUTE_CLAIMED", routeId, playerId });

describe("setup", () => {
  it("creates a game with players", () => {
    const s = stateOf(...setup(3));
    expect(s.players).toHaveLength(3);
    expect(s.players[0].isMe).toBe(true);
  });
  it("rejects bad player counts, duplicate colors, extra players and two 'me'", () => {
    expect(tryReduce(initialState, act({ type: "GAME_CREATED", gameId: "x", playerCount: 6 })).ok).toBe(false);
    const s = stateOf(...setup(2));
    const add = (color: "red" | "blue" | "green", isMe = false) =>
      tryReduce(s, act({ type: "PLAYER_ADDED", playerId: "p9", name: "", color, isMe }));
    expect(add("green")).toMatchObject({ ok: false, error: { code: "tooManyPlayers" } });
    const partial = stateOf(...setup(3).slice(0, 3));
    const dup = tryReduce(partial, act({ type: "PLAYER_ADDED", playerId: "p3", name: "", color: "red", isMe: false }));
    expect(dup).toMatchObject({ ok: false, error: { code: "colorTaken" } });
    const two = tryReduce(partial, act({ type: "PLAYER_ADDED", playerId: "p3", name: "", color: "green", isMe: true }));
    expect(two).toMatchObject({ ok: false, error: { code: "tooManyMe" } });
  });
  it("rejects a second GAME_CREATED and players before a game", () => {
    const s = stateOf(...setup(2));
    expect(tryReduce(s, act({ type: "GAME_CREATED", gameId: "y", playerCount: 2 })).ok).toBe(false);
    const p = act({ type: "PLAYER_ADDED", playerId: "p1", name: "", color: "red", isMe: false });
    expect(tryReduce(initialState, p)).toMatchObject({ ok: false, error: { code: "noGame" } });
  });
});

describe("routes", () => {
  it("claims and unclaims", () => {
    let s = stateOf(...setup(3), claim(single.id, "p1"));
    expect(s.claims[single.id]).toBe("p1");
    expect(trainsLeft(s, "p1")).toBe(45 - single.length);
    s = replay([...setup(3), claim(single.id, "p1"), act({ type: "ROUTE_UNCLAIMED", routeId: single.id })]);
    expect(s.claims[single.id]).toBeUndefined();
  });
  it("rejects taken, unknown and unclaiming a free route", () => {
    const s = stateOf(...setup(3), claim(single.id, "p1"));
    expect(tryReduce(s, claim(single.id, "p2"))).toMatchObject({ ok: false, error: { code: "routeTaken" } });
    expect(tryReduce(s, claim("nope", "p2"))).toMatchObject({ ok: false, error: { code: "unknownRoute" } });
    expect(tryReduce(s, claim(twin.id, "zz"))).toMatchObject({ ok: false, error: { code: "unknownPlayer" } });
    expect(tryReduce(s, act({ type: "ROUTE_UNCLAIMED", routeId: twin.id }))).toMatchObject({
      ok: false,
      error: { code: "routeNotClaimed" },
    });
  });
  it("blocks the twin in 2-3 player games and allows it with 4+", () => {
    const three = stateOf(...setup(3), claim(double.id, "p1"));
    expect(tryReduce(three, claim(twin.id, "p2"))).toMatchObject({ ok: false, error: { code: "twinBlocked" } });
    expect(tryReduce(three, claim(twin.id, "p1"))).toMatchObject({ ok: false, error: { code: "twinOwn" } });
    const four = stateOf(...setup(4), claim(double.id, "p1"));
    expect(tryReduce(four, claim(twin.id, "p2")).ok).toBe(true);
    expect(tryReduce(four, claim(twin.id, "p1"))).toMatchObject({ ok: false, error: { code: "twinOwn" } });
  });
  it("rejects claims without enough trains", () => {
    const long = routes.filter((r) => r.length >= 4 && !r.doubleOf);
    let s = stateOf(...setup(2));
    let used = 0;
    for (const r of long) {
      if (used + r.length > 45) {
        expect(tryReduce(s, claim(r.id, "p1"))).toMatchObject({ ok: false, error: { code: "noTrains" } });
        return;
      }
      s = stateOf(...setup(2), ...Object.keys(s.claims).map((id) => claim(id, "p1")), claim(r.id, "p1"));
      used += r.length;
    }
    throw new Error("expected to run out of trains");
  });
});

describe("stations", () => {
  const place = (cityId: string, playerId: string) => act({ type: "STATION_PLACED", cityId, playerId });
  it("places, removes and limits to 3 per player", () => {
    let s = stateOf(...setup(2), place("paris", "p1"), place("wien", "p1"), place("roma", "p1"));
    expect(stationsLeft(s, "p1")).toBe(0);
    expect(tryReduce(s, place("berlin", "p1"))).toMatchObject({ ok: false, error: { code: "noStations" } });
    const r = tryReduce(s, act({ type: "STATION_REMOVED", cityId: "paris", playerId: "p1" }));
    expect(r.ok && stationsLeft(r.state, "p1")).toBe(1);
    s = stateOf(...setup(2), place("paris", "p1"));
    expect(tryReduce(s, act({ type: "STATION_REMOVED", cityId: "paris", playerId: "p2" }))).toMatchObject({
      ok: false,
      error: { code: "stationMissing" },
    });
  });
  it("allows only one station per city and known cities", () => {
    const s = stateOf(...setup(2), place("paris", "p1"));
    expect(tryReduce(s, place("paris", "p2"))).toMatchObject({ ok: false, error: { code: "stationTaken" } });
    expect(tryReduce(s, place("atlantis", "p2"))).toMatchObject({ ok: false, error: { code: "unknownCity" } });
  });
});

describe("end of game and score", () => {
  it("detects the last round at 2 trains or fewer", () => {
    const base = setup(2);
    const big = routes.filter((r) => !r.doubleOf && r.length >= 4);
    const picked: string[] = [];
    let total = 0;
    for (const r of big) {
      if (total + r.length > 43) continue;
      picked.push(r.id);
      total += r.length;
    }
    let s = stateOf(...base, ...picked.map((id) => claim(id, "p2")));
    expect(isLastRound(s)).toBe(total >= 43);
    const small = routes.filter((r) => !r.doubleOf && r.length <= 3 && !picked.includes(r.id));
    for (const r of small) {
      if (total + r.length <= 43) {
        s = stateOf(...base, ...[...picked, r.id].map((id) => claim(id, "p2")));
        picked.push(r.id);
        total += r.length;
      }
    }
    expect(trainsLeft(s, "p2")).toBeLessThanOrEqual(2);
    expect(isLastRound(s)).toBe(true);
  });
  it("blocks claims after the game ended but allows ticket points", () => {
    const s = stateOf(...setup(2), act({ type: "GAME_ENDED" }));
    expect(tryReduce(s, claim(single.id, "p1"))).toMatchObject({ ok: false, error: { code: "gameEnded" } });
    expect(tryReduce(s, act({ type: "GAME_ENDED" })).ok).toBe(false);
    expect(tryReduce(s, act({ type: "TICKET_POINTS_SET", playerId: "p1", points: -5 })).ok).toBe(true);
    expect(tryReduce(s, act({ type: "TICKET_POINTS_SET", playerId: "p1", points: 1.5 })).ok).toBe(false);
  });
  it("computes the final score with stations, tickets and the European Express", () => {
    const s = stateOf(
      ...setup(2),
      claim(single.id, "p1"),
      act({ type: "STATION_PLACED", cityId: "paris", playerId: "p1" }),
      act({ type: "TICKET_POINTS_SET", playerId: "p1", points: 20 }),
    );
    expect(autoExpressWinners(s)).toEqual(["p1"]);
    // 2 route points + 2 unused stations * 4 + 20 tickets + 10 express
    expect(finalScore(s, "p1")).toEqual({ routes: 2, stations: 8, tickets: 20, express: 10, total: 40 });
    expect(finalScore(s, "p2")).toMatchObject({ routes: 0, stations: 12, express: 0, total: 12 });
    expect(winners(s).map((p) => p.id)).toEqual(["p1"]);
  });
  it("supports an express override and ties", () => {
    const s = stateOf(...setup(2), act({ type: "EXPRESS_OVERRIDE", winners: ["p1", "p2"] }));
    expect(finalScore(s, "p1").express).toBe(10);
    expect(finalScore(s, "p2").express).toBe(10);
    expect(tryReduce(s, act({ type: "EXPRESS_OVERRIDE", winners: ["zz"] })).ok).toBe(false);
    expect(autoExpressWinners(stateOf(...setup(2)))).toEqual([]);
  });
  it("keeps action ids unique", () => {
    const a = makeAction({ type: "GAME_ENDED" });
    const b = makeAction({ type: "GAME_ENDED" });
    expect(a.id).not.toBe(b.id);
  });
});

describe("public vs private actions", () => {
  it("keeps ticket points private", async () => {
    const { isPrivateAction } = await import("../src/game/actions");
    expect(isPrivateAction({ type: "TICKET_POINTS_SET" })).toBe(true);
    expect(isPrivateAction({ type: "ROUTE_CLAIMED" })).toBe(false);
  });
});
