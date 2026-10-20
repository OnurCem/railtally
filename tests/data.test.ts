import { describe, expect, it } from "vitest";
import { cities } from "../src/data/cities";
import { routes } from "../src/data/routes";
import { tickets } from "../src/data/tickets";

const cityIds = new Set(cities.map((c) => c.id));

describe("map data", () => {
  it("has unique city and route ids", () => {
    expect(cityIds.size).toBe(cities.length);
    expect(new Set(routes.map((r) => r.id)).size).toBe(routes.length);
  });

  it("routes and tickets reference existing cities", () => {
    for (const r of routes) {
      expect(cityIds.has(r.from), r.id).toBe(true);
      expect(cityIds.has(r.to), r.id).toBe(true);
    }
    for (const t of tickets) {
      expect(cityIds.has(t.from), t.id).toBe(true);
      expect(cityIds.has(t.to), t.id).toBe(true);
    }
  });

  it("every city has at least one route", () => {
    for (const c of cities) {
      expect(routes.some((r) => r.from === c.id || r.to === c.id), c.id).toBe(true);
    }
  });

  it("doubleOf references are symmetric", () => {
    const byId = new Map(routes.map((r) => [r.id, r]));
    for (const r of routes.filter((x) => x.doubleOf)) {
      const twin = byId.get(r.doubleOf!);
      expect(twin, r.id).toBeDefined();
      expect(twin!.doubleOf).toBe(r.id);
      expect([twin!.from, twin!.to]).toEqual([r.from, r.to]);
    }
  });

  it("graph is connected", () => {
    const adj = new Map<string, string[]>(cities.map((c) => [c.id, []]));
    for (const r of routes) {
      adj.get(r.from)!.push(r.to);
      adj.get(r.to)!.push(r.from);
    }
    const seen = new Set([cities[0].id]);
    const stack = [cities[0].id];
    while (stack.length) {
      for (const n of adj.get(stack.pop()!)!) {
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    expect(seen.size).toBe(cities.length);
  });

  // Totals as transcribed so far; verify against the physical board.
  it("matches expected totals", () => {
    expect(cities).toHaveLength(47);
    expect(routes).toHaveLength(101);
    expect(routes.filter((r) => r.tunnel)).toHaveLength(18);
    expect(routes.filter((r) => r.ferryLocomotives > 0)).toHaveLength(13);
    expect(routes.reduce((s, r) => s + r.length, 0)).toBe(300);
    expect(routes.filter((r) => r.doubleOf)).toHaveLength(22);
    expect(tickets).toHaveLength(46);
    expect(tickets.filter((t) => t.long)).toHaveLength(6);
  });
});
