import { routeById, ticketById } from "../data/lookup";
import type { Route, Ticket } from "../data/types";
import { assignStations, pathCandidates, STATION_POINTS, usable, type Path, type PathContext, type StationUse } from "./paths";
import { stationsLeft, trainsLeft } from "./rules";
import type { GameState } from "./state";

/** Opportunity cost of one train, in points. Small: trains spent on a ticket path still score route points. */
export const TRAIN_COST = 0.15;
/** Chance that a route nobody has claimed yet is still free when I need it (2 players, open twin lane). */
const OPEN_TWIN_SUCCESS = 0.98;
const SINGLE_ROUTE_SUCCESS = 0.95;
/** Each extra opponent raises the chance that a needed route is taken first. */
const CROWD_FACTOR_PER_PLAYER = 0.15;
/** A borrowed route already exists; only the station city could still be taken. */
const BORROW_SUCCESS = 0.97;

export const pathContext = (state: GameState): PathContext => {
  const me = state.players.find((p) => p.isMe)?.id;
  return {
    claims: state.claims,
    me,
    playerCount: state.playerCount,
    stations: state.stations,
    stationsLeft: me ? stationsLeft(state, me) : 0,
  };
};

/** Probability that a route I still need is not taken before I claim it. */
export function routeSuccess(route: Route, ctx: PathContext): number {
  if (ctx.me && ctx.claims[route.id] === ctx.me) return 1;
  const twin = route.doubleOf ? routeById.get(route.doubleOf) : undefined;
  const base = twin && usable(twin, ctx) && !ctx.claims[twin.id] ? OPEN_TWIN_SUCCESS : SINGLE_ROUTE_SUCCESS;
  const crowd = 1 + Math.max(0, ctx.playerCount - 2) * CROWD_FACTOR_PER_PLAYER;
  return Math.max(0, 1 - (1 - base) * crowd);
}

const pathSuccess = (path: Path, ctx: PathContext) =>
  path.missing.reduce((p, id) => p * routeSuccess(routeById.get(id)!, ctx), 1) * BORROW_SUCCESS ** path.borrowed.length;

export interface TicketEval {
  ticket: Ticket;
  /** the plan for this ticket; null when opponents block every connection */
  path: Path | null;
  /** every useful plan: index 0 builds only, later ones borrow opponent routes through stations */
  candidates: Path[];
  /** trains still to place */
  trains: number;
  completed: boolean;
  /** chance to finish this ticket, 0..1 */
  success: number;
  /** ticket points per train still to place (Infinity when nothing is left to build) */
  pointsPerTrain: number;
}

function toEval(ticket: Ticket, candidates: Path[], path: Path | null, ctx: PathContext): TicketEval {
  if (!path) return { ticket, path, candidates, trains: 0, completed: false, success: 0, pointsPerTrain: 0 };
  return {
    ticket,
    path,
    candidates,
    trains: path.trains,
    completed: path.missing.length === 0,
    success: pathSuccess(path, ctx),
    pointsPerTrain: path.trains === 0 ? Infinity : ticket.points / path.trains,
  };
}

/** Candidates are expensive to compute; one cache per ranking run. */
type Cache = Map<string, Path[]>;

function candidatesOf(ticket: Ticket, ctx: PathContext, cache?: Cache): Path[] {
  const hit = cache?.get(ticket.id);
  if (hit) return hit;
  const found = pathCandidates(ticket.from, ticket.to, ctx);
  cache?.set(ticket.id, found);
  return found;
}

/** The cheapest single plan for a ticket (it may borrow an opponent route through a station). */
export function evaluateTicket(ticket: Ticket, ctx: PathContext, cache?: Cache): TicketEval {
  const candidates = candidatesOf(ticket, ctx, cache);
  const best = candidates.reduce<Path | null>((a, c) => (!a || c.cost < a.cost ? c : a), null);
  return toEval(ticket, candidates, best, ctx);
}

export interface Option {
  /** every ticket kept after this choice, already held ones first, each with the plan chosen for the whole network */
  tickets: TicketEval[];
  /** the new tickets that are kept / given back */
  keep: string[];
  drop: string[];
  /** trains still to place for the whole network (shared routes count once) */
  trains: number;
  /** trains saved because tickets share routes */
  shared: number;
  /** ticket points if everything is completed */
  points: number;
  /** chance that every kept ticket is completed */
  chanceAll: number;
  /** stations the plan relies on (existing ones and new ones to place) */
  stations: StationUse[];
  /** how many of those are new stations */
  newStations: number;
  /** expected ticket points minus a small train cost and the end bonus of new stations; higher is better */
  score: number;
  /** false when the network needs more trains than I have left */
  feasible: boolean;
}

interface Scored {
  trains: number;
  shared: number;
  points: number;
  chanceAll: number;
  stations: StationUse[];
  newStations: number;
  score: number;
  feasible: boolean;
}

/** Scores one choice of plan per ticket (null = ticket cannot be completed). */
function scoreChoice(tickets: Ticket[], plans: (Path | null)[], ctx: PathContext, trainsAvailable: number): Scored | null {
  const union = new Set<string>();
  const borrowed = new Set<string>();
  let sum = 0;
  let points = 0;
  let expected = 0;
  let chanceAll = 1;
  tickets.forEach((ticket, i) => {
    const plan = plans[i];
    const success = plan ? pathSuccess(plan, ctx) : 0;
    points += ticket.points;
    expected += (2 * success - 1) * ticket.points;
    chanceAll *= success;
    if (!plan) return;
    sum += plan.trains;
    plan.missing.forEach((id) => union.add(id));
    plan.borrowed.forEach((id) => borrowed.add(id));
  });
  let stations: StationUse[] = [];
  if (borrowed.size) {
    const assigned = assignStations([...borrowed], ctx);
    if (!assigned) return null; // not enough stations for this combination
    stations = assigned;
  }
  let trains = 0;
  for (const id of union) trains += routeById.get(id)!.length;
  const newStations = stations.filter((s) => !s.existing).length;
  const feasible = trains <= trainsAvailable;
  return {
    trains,
    shared: sum - trains,
    points,
    chanceAll,
    stations,
    newStations,
    feasible,
    score: expected - TRAIN_COST * trains - STATION_POINTS * newStations - (feasible ? 0 : 1000),
  };
}

/** Picks the best plan per ticket for the whole network: start by building everything, then try borrowing where it helps. */
function planNetwork(tickets: Ticket[], candidates: Path[][], ctx: PathContext, trainsAvailable: number) {
  const choice: number[] = candidates.map((c) => (c.length ? 0 : -1));
  const plans = () => choice.map((k, i) => (k < 0 ? null : candidates[i][k]));
  let best = scoreChoice(tickets, plans(), ctx, trainsAvailable)!;
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let i = 0; i < tickets.length; i++) {
      for (let k = 0; k < candidates[i].length; k++) {
        if (k === choice[i]) continue;
        const before = choice[i];
        choice[i] = k;
        const scored = scoreChoice(tickets, plans(), ctx, trainsAvailable);
        if (scored && scored.score > best.score + 1e-9) {
          best = scored;
          improved = true;
        } else choice[i] = before;
      }
    }
    if (!improved) break;
  }
  return { scored: best, plans: plans() };
}

function buildOption(state: GameState, offered: string[], keep: string[], ctx: PathContext, cache: Cache): Option {
  const ids = [...state.myTickets, ...keep];
  const list = ids.map((id) => ticketById.get(id)!);
  const candidates = list.map((t) => candidatesOf(t, ctx, cache));
  const available = ctx.me ? trainsLeft(state, ctx.me) : 45;
  const { scored, plans } = planNetwork(list, candidates, ctx, available);
  return {
    tickets: list.map((t, i) => toEval(t, candidates[i], plans[i], ctx)),
    keep,
    drop: offered.filter((id) => !keep.includes(id)),
    ...scored,
  };
}

export function evaluateOption(state: GameState, offered: string[], keep: string[]): Option {
  return buildOption(state, offered, keep, pathContext(state), new Map());
}

/**
 * Every allowed way to keep tickets from the ones just dealt, best first.
 * `minKeep` is 2 at the start of the game (1 long + 3 regular tickets are dealt) and 1 when drawing during the game.
 */
export function rankOptions(state: GameState, offered: string[], minKeep: number): Option[] {
  const ctx = pathContext(state);
  const cache: Cache = new Map();
  const options: Option[] = [];
  const n = offered.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const keep = offered.filter((_, i) => mask & (1 << i));
    if (keep.length < Math.min(minKeep, n)) continue;
    options.push(buildOption(state, offered, keep, ctx, cache));
  }
  return options.sort((a, b) => b.score - a.score || a.trains - b.trains);
}

export type Verdict = "keepShared" | "keepStation" | "keepEfficient" | "dropNoTrains" | "dropCostly" | "dropRisky" | "dropBlocked";

/** Short reason for each offered ticket, judged against the best option. */
export function explain(state: GameState, offered: string[], best: Option): Map<string, Verdict> {
  const result = new Map<string, Verdict>();
  const ctx = pathContext(state);
  const cache: Cache = new Map();
  const left = ctx.me ? trainsLeft(state, ctx.me) : 45;
  for (const id of offered) {
    const e = evaluateTicket(ticketById.get(id)!, ctx, cache);
    const inPlan = best.tickets.find((t) => t.ticket.id === id);
    if (best.keep.includes(id)) {
      const others = best.tickets.filter((t) => t.ticket.id !== id);
      const own = new Set(inPlan?.path?.missing ?? []);
      const overlaps = others.some((o) => o.path?.missing.some((r) => own.has(r)));
      result.set(id, inPlan?.path?.borrowed.length ? "keepStation" : overlaps ? "keepShared" : "keepEfficient");
    } else if (!e.path) result.set(id, "dropBlocked");
    else if (e.trains > left) result.set(id, "dropNoTrains");
    else result.set(id, e.success < 0.6 ? "dropRisky" : "dropCostly");
  }
  return result;
}

/**
 * Whether my routes and stations already connect the two cities of a ticket.
 * Each of my stations may borrow one opponent route that touches its city; this looks for any choice that works.
 */
export function isCompleted(state: GameState, ticket: Ticket): boolean {
  const me = state.players.find((p) => p.isMe)?.id;
  if (!me) return false;
  const mine = Object.entries(state.claims).filter(([, owner]) => owner === me).map(([id]) => routeById.get(id)!);
  const stations = Object.entries(state.stations).filter(([, owner]) => owner === me).map(([city]) => city);
  const connected = (extra: Route[]) => {
    const all = [...mine, ...extra];
    const seen = new Set([ticket.from]);
    const queue = [ticket.from];
    while (queue.length) {
      const city = queue.shift()!;
      for (const r of all) {
        const next = r.from === city ? r.to : r.to === city ? r.from : null;
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen.has(ticket.to);
  };
  const options = stations.map((city) =>
    Object.entries(state.claims)
      .filter(([id, owner]) => owner !== me && (routeById.get(id)!.from === city || routeById.get(id)!.to === city))
      .map(([id]) => routeById.get(id)!),
  );
  const search = (i: number, extra: Route[]): boolean => {
    if (connected(extra)) return true;
    if (i === options.length) return false;
    return search(i + 1, extra) || options[i].some((r) => search(i + 1, [...extra, r]));
  };
  return search(0, []);
}
