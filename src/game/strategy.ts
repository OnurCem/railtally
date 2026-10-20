import { routeById, ticketById } from "../data/lookup";
import type { Route, RouteColor, Ticket } from "../data/types";
import { NEW_STATION_UNITS, pathCandidates, STATION_POINTS, usable, type Path, type PathContext, type StationUse } from "./paths";
import { trainsLeft } from "./rules";
import type { GameState } from "./state";
import { isCompleted, pathContext, planNetwork, routeSuccess } from "./tickets";

/** Above this share of my remaining trains the plan is called tight. */
export const TIGHT_SHARE = 0.8;
/** A detour that costs at least this many extra trains makes a route "scarce". */
const COSTLY_DETOUR = 2;
const NO_DETOUR_URGENCY = 5;

export type Reason = "noAlternative" | "costlyDetour" | "shared" | "crowded";

export interface PlannedRoute {
  route: Route;
  /** ticket ids that use this route */
  tickets: string[];
  /** card color needed; "gray" means any one color, as long as all cards match */
  color: RouteColor;
  /** locomotive cards the ferry needs among its cards */
  locomotives: number;
  tunnel: boolean;
  /** extra trains the worst-affected ticket needs if an opponent takes this route (Infinity: no other way) */
  detour: number;
  /** chance that an opponent takes it before I do, 0..1 */
  risk: number;
  /** opponent routes and stations at the two cities of this route */
  crowd: number;
  /** higher = claim sooner */
  priority: number;
  reasons: Reason[];
}

export interface TicketPlan {
  ticket: Ticket;
  /** already connected by my routes and stations */
  completed: boolean;
  /** opponents block every connection */
  blocked: boolean;
  /** routes I still have to build for this ticket (planned order) */
  routes: string[];
  /** opponent routes this ticket uses through stations */
  borrowed: string[];
  trains: number;
  /** trains saved if I gave this ticket up (routes only it uses) */
  exclusiveTrains: number;
}

export interface CardNeeds {
  /** cards needed per route color (locomotive cards excluded) */
  byColor: Partial<Record<RouteColor, number>>;
  /** cards for gray routes: any one color per route */
  anyColor: number;
  locomotives: number;
  /** routes that are tunnels: up to 3 extra cards may be needed for each */
  tunnels: number;
}

export interface StrategyPlan {
  gameId: string | null;
  tickets: TicketPlan[];
  /** routes still to claim, in suggested claim order */
  routes: PlannedRoute[];
  /** opponent routes used through stations */
  borrowed: string[];
  stations: StationUse[];
  newStations: number;
  trainsNeeded: number;
  trainsLeft: number;
  /** trains saved because tickets share routes */
  shared: number;
  /** needed / left */
  share: number;
  fits: boolean;
  tight: boolean;
  cards: CardNeeds;
  /** ticket points if everything is completed */
  points: number;
  chanceAll: number;
  /** when the plan does not fit: the ticket to give up first (not completed yet) */
  dropSuggestion: string | null;
}

const routeCard = (r: Route) => r.length - r.ferryLocomotives;

/** Opponent routes and stations at either end of a route: a crowded hub is more likely to close. */
function crowdAt(route: Route, ctx: PathContext): number {
  let n = 0;
  for (const [id, owner] of Object.entries(ctx.claims)) {
    if (owner === ctx.me || id === route.id) continue;
    const r = routeById.get(id)!;
    if ([r.from, r.to].some((c) => c === route.from || c === route.to)) n++;
  }
  for (const city of [route.from, route.to]) if (ctx.stations[city] && ctx.stations[city] !== ctx.me) n++;
  return n;
}

/** Search cost of a path, with new stations priced at their real 4-point cost instead of the search's cheaper stand-in. */
function realCost(path: Path, ctx: PathContext): number {
  const fresh = path.borrowed.filter((id) => {
    const r = routeById.get(id)!;
    return ![r.from, r.to].some((c) => ctx.me && ctx.stations[c] === ctx.me);
  }).length;
  return path.cost + fresh * (STATION_POINTS - NEW_STATION_UNITS);
}

const bestCost = (paths: Path[], ctx: PathContext) => paths.reduce((m, p) => Math.min(m, realCost(p, ctx)), Infinity);

/** Extra search cost of the ticket if an opponent took the route; Infinity when that disconnects it. */
function detourFor(ticket: Ticket, route: Route, ctx: PathContext, base: number): number {
  const closed = { ...ctx, claims: { ...ctx.claims, [route.id]: "__opponent" } };
  return Math.max(0, bestCost(pathCandidates(ticket.from, ticket.to, closed), closed) - base);
}

/**
 * Combines every ticket I hold into one network and orders the routes to claim.
 * A heuristic, not an optimum: it reuses the ticket planner (cheapest path per ticket, then a local search over which
 * tickets borrow opponent routes through stations) and scores the order by how badly losing each route would hurt.
 */
export function planStrategy(state: GameState): StrategyPlan | null {
  const ctx = pathContext(state);
  if (!ctx.me || state.myTickets.length === 0) return null;
  const available = trainsLeft(state, ctx.me);
  const list = state.myTickets.map((id) => ticketById.get(id)!).filter(Boolean);
  const candidates = list.map((t) => pathCandidates(t.from, t.to, ctx));
  const { scored, plans } = planNetwork(list, candidates, ctx, available);

  // One lane per double route: if two tickets picked different lanes, both use the first one.
  const lane = new Map<string, string>();
  const canonical = (id: string) => {
    const r = routeById.get(id)!;
    const twin = r.doubleOf;
    if (twin && lane.has(twin)) return twin;
    lane.set(id, id);
    return id;
  };
  const users = new Map<string, string[]>();
  const ticketRoutes = plans.map((plan, i) =>
    (plan?.missing ?? []).map((id) => {
      const c = canonical(id);
      users.set(c, [...(users.get(c) ?? []), list[i].id]);
      return c;
    }),
  );

  const planned: PlannedRoute[] = [...users.entries()].map(([id, ids]) => {
    const route = routeById.get(id)!;
    let detour = 0;
    ids.forEach((tid) => {
      const i = list.findIndex((t) => t.id === tid);
      detour = Math.max(detour, detourFor(list[i], route, ctx, bestCost(candidates[i], ctx)));
    });
    const risk = 1 - routeSuccess(route, ctx);
    const crowd = crowdAt(route, ctx);
    const reasons: Reason[] = [];
    if (detour === Infinity) reasons.push("noAlternative");
    else if (detour >= COSTLY_DETOUR) reasons.push("costlyDetour");
    if (ids.length > 1) reasons.push("shared");
    if (crowd >= 3) reasons.push("crowded");
    const priority =
      (detour === Infinity ? NO_DETOUR_URGENCY : Math.min(detour, NO_DETOUR_URGENCY)) +
      risk * 20 +
      crowd * 0.4 +
      (ids.length - 1) * 1.5 -
      route.length * 0.05;
    return {
      route,
      tickets: ids,
      color: route.color,
      locomotives: route.ferryLocomotives,
      tunnel: route.tunnel,
      detour,
      risk,
      crowd,
      priority,
      reasons,
    };
  });
  planned.sort((a, b) => b.priority - a.priority || a.route.id.localeCompare(b.route.id));

  const cards: CardNeeds = { byColor: {}, anyColor: 0, locomotives: 0, tunnels: 0 };
  let trainsNeeded = 0;
  for (const p of planned) {
    trainsNeeded += p.route.length;
    cards.locomotives += p.locomotives;
    if (p.tunnel) cards.tunnels++;
    if (p.color === "gray") cards.anyColor += routeCard(p.route);
    else cards.byColor[p.color] = (cards.byColor[p.color] ?? 0) + routeCard(p.route);
  }

  const ticketPlans: TicketPlan[] = list.map((ticket, i) => {
    const plan = plans[i];
    const mine = ticketRoutes[i];
    const exclusive = mine.filter((id) => users.get(id)!.length === 1).reduce((n, id) => n + routeById.get(id)!.length, 0);
    return {
      ticket,
      completed: isCompleted(state, ticket) || (!!plan && plan.missing.length === 0),
      blocked: !plan,
      routes: planned.filter((p) => mine.includes(p.route.id)).map((p) => p.route.id),
      borrowed: plan?.borrowed ?? [],
      trains: plan?.trains ?? 0,
      exclusiveTrains: exclusive,
    };
  });

  const fits = trainsNeeded <= available;
  let dropSuggestion: string | null = null;
  if (!fits) {
    const open = ticketPlans.filter((t) => !t.completed && t.exclusiveTrains > 0);
    const enough = open.filter((t) => trainsNeeded - t.exclusiveTrains <= available);
    const pool = enough.length ? enough : open;
    const worth = (t: TicketPlan) => t.exclusiveTrains / t.ticket.points;
    pool.sort((a, b) => worth(b) - worth(a));
    dropSuggestion = pool[0]?.ticket.id ?? null;
  }

  return {
    gameId: state.gameId,
    tickets: ticketPlans,
    routes: planned,
    borrowed: [...new Set(plans.flatMap((p) => p?.borrowed ?? []))],
    stations: scored.stations,
    newStations: scored.newStations,
    trainsNeeded,
    trainsLeft: available,
    shared: scored.shared,
    share: available > 0 ? trainsNeeded / available : trainsNeeded > 0 ? Infinity : 0,
    fits,
    tight: fits && trainsNeeded > TIGHT_SHARE * available,
    cards,
    points: scored.points,
    chanceAll: scored.chanceAll,
    dropSuggestion,
  };
}

export interface PlanChange {
  gameId: string | null;
  /** routes of the previous plan that an opponent has taken (or closed by taking the twin lane) */
  taken: string[];
  /** routes the new plan adds */
  added: string[];
  /** stations the new plan needs that the old one did not */
  newStations: StationUse[];
  /** tickets that are blocked now but were not before */
  blocked: string[];
}

/** What changed between two plans of the same game, or null when no planned route was lost. */
export function diffPlans(prev: StrategyPlan | null, next: StrategyPlan | null, state: GameState): PlanChange | null {
  if (!prev || !next || prev.gameId !== next.gameId) return null;
  const ctx = pathContext(state);
  const nextIds = new Set(next.routes.map((r) => r.route.id));
  const taken = prev.routes
    .map((r) => r.route)
    .filter((r) => !nextIds.has(r.id) && ctx.claims[r.id] !== ctx.me && !usable(r, ctx))
    .map((r) => r.id);
  if (taken.length === 0) return null;
  const prevIds = new Set(prev.routes.map((r) => r.route.id));
  const prevStations = new Set(prev.stations.map((s) => `${s.city}|${s.route}`));
  const wasBlocked = new Set(prev.tickets.filter((t) => t.blocked).map((t) => t.ticket.id));
  return {
    gameId: next.gameId,
    taken,
    added: next.routes.map((r) => r.route.id).filter((id) => !prevIds.has(id)),
    newStations: next.stations.filter((s) => !prevStations.has(`${s.city}|${s.route}`)),
    blocked: next.tickets.filter((t) => t.blocked && !wasBlocked.has(t.ticket.id)).map((t) => t.ticket.id),
  };
}
