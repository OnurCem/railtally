import { describe, expect, it } from "vitest";
import { longestTrail, routePoints } from "../src/game/scoring";

describe("routePoints", () => {
  it("follows the scoring table", () => {
    expect([1, 2, 3, 4, 6, 8].map(routePoints)).toEqual([1, 2, 4, 7, 15, 21]);
  });
  it("rejects invalid lengths", () => {
    expect(() => routePoints(5)).toThrow();
  });
});

describe("longestTrail", () => {
  const r = (from: string, to: string, length: number) => ({ from, to, length });
  it("is 0 without routes", () => expect(longestTrail([])).toBe(0));
  it("follows a simple chain", () => {
    expect(longestTrail([r("a", "b", 2), r("b", "c", 3), r("c", "d", 4)])).toBe(9);
  });
  it("picks the longest branch", () => {
    expect(longestTrail([r("a", "b", 2), r("b", "c", 3), r("b", "d", 6)])).toBe(9);
  });
  it("can revisit a city through a loop but not reuse a route", () => {
    // triangle a-b-c-a plus a tail a-d
    expect(longestTrail([r("a", "b", 1), r("b", "c", 1), r("c", "a", 1), r("a", "d", 4)])).toBe(7);
  });
  it("handles parallel routes between the same cities", () => {
    expect(longestTrail([r("a", "b", 3), r("a", "b", 3)])).toBe(6);
  });
});
