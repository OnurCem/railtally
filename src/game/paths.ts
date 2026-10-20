import { routeById } from "../data/lookup";
import { routes } from "../data/routes";
import type { Route } from "../data/types";
import { STATIONS_PER_PLAYER, STATION_BONUS } from "./actions";

/** What the path finder needs to know about the game. */
export interface PathContext {
  /** routeId -> playerId */
  claims: Record<string, string>;
  /** the player the plan is for; their routes are free */
  me: string | undefined;
  playerCount: number;
  /** cityId -> playerId, every station on the board */
  stations: Record<string, string>;
  /** stations I can still place */
  stationsLeft: number;
}

/** Extra cost (in "trains") that makes tunnels and ferries slightly less attractive than plain routes. */
export const TUNNEL_PENALTY = 0.4;
export const FERRY_PENALTY_PER_LOCOMOTIVE = 1;
/** Placing a new station costs the 4 end-game points of an unused station plus a few cards; in train units: */
export const NEW_STATION_UNITS = 3;
export const BORROW_COST_EXISTING = 0.05;

export interface Path {
  from: string;
  to: string;
  /** route ids in travel order, including borrowed ones */
  routes: string[];
  /** routes in this path that I still have to build */
  missing: string[];
  /** opponent routes this path uses through my stations */
  borrowed: string[];
  /** trains still to place (sum of the missing routes' lengths) */
  trains: number;
  /** total length of the whole path, including routes I already own or borrow */
  length: number;
  /** search cost (trains plus small penalties plus station units) */
  cost: number;
}

/** A station that a plan relies on: it lets me use one opponent route that touches its city. */
export interface StationUse {
  city: string;
  route: string;
  /** true when I already have a station here, false when it would be a new one */
  existing: boolean;
}

const adjacency = new Map<string, Route[]>();
for (const r of routes) {
  for (const city of [r.from, r.to]) {
    if (!adjacency.has(city)) adjacency.set(city, []);
    adjacency.get(city)!.push(r);
  }
}

const isMine = (route: Route, ctx: PathContext) => !!ctx.me && ctx.claims[route.id] === ctx.me;
const isOpponents = (route: Route, ctx: PathContext) => !!ctx.claims[route.id] && ctx.claims[route.id] !== ctx.me;
const myStation = (city: string, ctx: PathContext) => !!ctx.me && ctx.stations[city] === ctx.me;

/** True when I can still claim (or already own) the route. */
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
  if (isMine(route, ctx)) return 0;
  return route.length + (route.tunnel ? TUNNEL_PENALTY : 0) + route.ferryLocomotives * FERRY_PENALTY_PER_LOCOMOTIVE;
}

/**
 * Gives each borrowed opponent route its own station city (one of the route's two ends): an existing station of mine,
 * or a new one where nobody has a station and I still have stations left. Returns the cheapest assignment or null.
 */
export function assignStations(borrowed: string[], ctx: PathContext): StationUse[] | null {
  const list = [...new Set(borrowed)];
  let best: StationUse[] | null = null;
  let bestNew = Infinity;
  const used = new Set<string>();
  const current: StationUse[] = [];
  const visit = (i: number, newCount: number) => {
    if (newCount > ctx.stationsLeft || newCount >= bestNew) return;
    if (i === list.length) {
      best = [...current];
      bestNew = newCount;
      return;
    }
    const route = routeById.get(list[i])!;
    for (const city of [route.from, route.to]) {
      if (used.has(city)) continue;
      const existing = myStation(city, ctx);
      if (!existing && ctx.stations[city]) continue; // somebody else's station
      used.add(city);
      current.push({ city, route: route.id, existing });
      visit(i + 1, newCount + (existing ? 0 : 1));
      current.pop();
      used.delete(city);
    }
  };
  visit(0, 0);
  return best;
}

interface Step {
  prev: string;
  route: Route;
  borrow: boolean;
}

/**
 * Cheapest ways to connect two cities for me: index 0 builds everything (b = 0 borrowed routes); each further entry uses
 * one more opponent route through a station and is only listed when it is cheaper than the entries before it.
 * Returns an empty list when opponents block every way.
 */
export function pathCandidates(from: string, to: string, ctx: PathContext): Path[] {
  if (from === to) return [{ from, to, routes: [], missing: [], borrowed: [], trains: 0, length: 0, cost: 0 }];
  const maxBorrow = ctx.me ? STATIONS_PER_PLAYER : 0;
  const key = (city: string, b: number) => `${city}|${b}`;
  const dist = new Map<string, number>([[key(from, 0), 0]]);
  const via = new Map<string, Step>();
  const done = new Set<string>();
  const reached = new Map<number, string>();

  for (;;) {
    let current: string | null = null;
    let best = Infinity;
    for (const [k, d] of dist) {
      if (!done.has(k) && d < best) {
        best = d;
        current = k;
      }
    }
    if (current === null) break;
    done.add(current);
    const [city, bText] = current.split("|");
    const b = Number(bText);
    if (city === to && !reached.has(b)) reached.set(b, current);
    for (const route of adjacency.get(city) ?? []) {
      const next = route.from === city ? route.to : route.from;
      const relax = (nextB: number, cost: number, borrow: boolean) => {
        const k = key(next, nextB);
        if (best + cost < (dist.get(k) ?? Infinity)) {
          dist.set(k, best + cost);
          via.set(k, { prev: current!, route, borrow });
        }
      };
      if (usable(route, ctx)) relax(b, routeCost(route, ctx), false);
      else if (isOpponents(route, ctx) && b < maxBorrow) {
        const ends = [route.from, route.to];
        const existing = ends.some((c) => myStation(c, ctx));
        const fresh = ctx.stationsLeft > 0 && ends.some((c) => !ctx.stations[c]);
        if (existing) relax(b + 1, BORROW_COST_EXISTING, true);
        else if (fresh) relax(b + 1, NEW_STATION_UNITS, true);
      }
    }
  }

  const out: Path[] = [];
  let bestCost = Infinity;
  for (const b of [...reached.keys()].sort((x, y) => x - y)) {
    const end = reached.get(b)!;
    const cost = dist.get(end)!;
    if (cost >= bestCost - 1e-9) continue;
    const list: Route[] = [];
    const borrowed: string[] = [];
    for (let k = end; k !== key(from, 0); ) {
      const step = via.get(k)!;
      list.unshift(step.route);
      if (step.borrow) borrowed.push(step.route.id);
      k = step.prev;
    }
    if (borrowed.length && !assignStations(borrowed, ctx)) continue;
    const build = list.filter((r) => !isMine(r, ctx) && !borrowed.includes(r.id));
    out.push({
      from,
      to,
      routes: list.map((r) => r.id),
      missing: build.map((r) => r.id),
      borrowed,
      trains: build.reduce((n, r) => n + r.length, 0),
      length: list.reduce((n, r) => n + r.length, 0),
      cost,
    });
    bestCost = cost;
  }
  return out;
}

/** Cheapest way to connect two cities by building only (no stations), or null when opponents block every way. */
export function shortestPath(from: string, to: string, ctx: PathContext): Path | null {
  return pathCandidates(from, to, { ...ctx, stationsLeft: 0, stations: noStations(ctx) })[0] ?? null;
}

/** The context with my stations ignored, so that nothing can be borrowed. */
function noStations(ctx: PathContext): Record<string, string> {
  return Object.fromEntries(Object.entries(ctx.stations).filter(([, p]) => p !== ctx.me));
}

export const STATION_POINTS = STATION_BONUS;
