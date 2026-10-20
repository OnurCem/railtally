import { routes } from "../data/routes";
import type { Route } from "../data/types";

/** What the path finder needs to know about the game. */
export interface PathContext {
  /** routeId -> playerId */
  claims: Record<string, string>;
  /** the player the plan is for; their routes are free */
  me: string | undefined;
  playerCount: number;
}

/** Extra cost (in "trains") that makes tunnels and ferries slightly less attractive than plain routes. */
export const TUNNEL_PENALTY = 0.4;
export const FERRY_PENALTY_PER_LOCOMOTIVE = 1;

export interface Path {
  from: string;
  to: string;
  /** route ids in travel order */
  routes: string[];
  /** routes in this path that are not mine yet */
  missing: string[];
  /** trains still to place (sum of the missing routes' lengths) */
  trains: number;
  /** total length of the whole path, including routes I already own */
  length: number;
}

const adjacency = new Map<string, Route[]>();
for (const r of routes) {
  for (const city of [r.from, r.to]) {
    if (!adjacency.has(city)) adjacency.set(city, []);
    adjacency.get(city)!.push(r);
  }
}

/** True when `me` can still claim (or already owns) the route. */
export function usable(route: Route, ctx: PathContext): boolean {
  const owner = ctx.claims[route.id];
  if (owner) return owner === ctx.me;
  if (route.doubleOf) {
    const twinOwner = ctx.claims[route.doubleOf];
    if (twinOwner === ctx.me && ctx.me) return false; // one player cannot own both lanes
    if (twinOwner && ctx.playerCount <= 3) return false; // lane closed with 2-3 players
  }
  return true;
}

export function routeCost(route: Route, ctx: PathContext): number {
  if (ctx.claims[route.id] === ctx.me && ctx.me) return 0;
  return route.length + (route.tunnel ? TUNNEL_PENALTY : 0) + route.ferryLocomotives * FERRY_PENALTY_PER_LOCOMOTIVE;
}

/** Cheapest way for `me` to connect two cities, or null when opponents block every way. */
export function shortestPath(from: string, to: string, ctx: PathContext): Path | null {
  if (from === to) return { from, to, routes: [], missing: [], trains: 0, length: 0 };
  const dist = new Map<string, number>([[from, 0]]);
  const via = new Map<string, { city: string; route: Route }>();
  const done = new Set<string>();
  for (;;) {
    let current: string | null = null;
    let best = Infinity;
    for (const [city, d] of dist) {
      if (!done.has(city) && d < best) {
        best = d;
        current = city;
      }
    }
    if (current === null) return null;
    if (current === to) break;
    done.add(current);
    for (const route of adjacency.get(current) ?? []) {
      if (!usable(route, ctx)) continue;
      const next = route.from === current ? route.to : route.from;
      const d = best + routeCost(route, ctx);
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        via.set(next, { city: current, route });
      }
    }
  }
  const list: Route[] = [];
  for (let city = to; city !== from; ) {
    const step = via.get(city)!;
    list.unshift(step.route);
    city = step.city;
  }
  const missing = list.filter((r) => ctx.claims[r.id] !== ctx.me || !ctx.me);
  return {
    from,
    to,
    routes: list.map((r) => r.id),
    missing: missing.map((r) => r.id),
    trains: missing.reduce((n, r) => n + r.length, 0),
    length: list.reduce((n, r) => n + r.length, 0),
  };
}
