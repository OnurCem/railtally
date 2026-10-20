import { routeById, ticketById } from "../data/lookup";
import type { Route, Ticket } from "../data/types";
import { trainsLeft } from "./rules";
import { shortestPath, usable, type Path, type PathContext } from "./paths";
import type { GameState } from "./state";

/** Opportunity cost of one train, in points. Small: trains spent on a ticket path still score route points. */
export const TRAIN_COST = 0.15;
/** Chance that a route nobody has claimed yet is still free when I need it (2 players, open twin lane). */
const OPEN_TWIN_SUCCESS = 0.98;
const SINGLE_ROUTE_SUCCESS = 0.95;
/** Each extra opponent raises the chance that a needed route is taken first. */
const CROWD_FACTOR_PER_PLAYER = 0.15;

export const pathContext = (state: GameState): PathContext => ({
  claims: state.claims,
  me: state.players.find((p) => p.isMe)?.id,
  playerCount: state.playerCount,
});

/** Probability that a route I still need is not taken before I claim it. */
export function routeSuccess(route: Route, ctx: PathContext): number {
  if (ctx.me && ctx.claims[route.id] === ctx.me) return 1;
  const twin = route.doubleOf ? routeById.get(route.doubleOf) : undefined;
  const base = twin && usable(twin, ctx) && !ctx.claims[twin.id] ? OPEN_TWIN_SUCCESS : SINGLE_ROUTE_SUCCESS;
  const crowd = 1 + Math.max(0, ctx.playerCount - 2) * CROWD_FACTOR_PER_PLAYER;
  return Math.max(0, 1 - (1 - base) * crowd);
}

export interface TicketEval {
  ticket: Ticket;
  /** null when opponents block every connection */
  path: Path | null;
  /** trains still to place */
  trains: number;
  completed: boolean;
  /** chance to finish this ticket, 0..1 */
  success: number;
  /** ticket points per train still to place (Infinity when already complete) */
  pointsPerTrain: number;
}

export function evaluateTicket(ticket: Ticket, ctx: PathContext): TicketEval {
  const path = shortestPath(ticket.from, ticket.to, ctx);
  if (!path) return { ticket, path, trains: 0, completed: false, success: 0, pointsPerTrain: 0 };
  const success = path.missing.reduce((p, id) => p * routeSuccess(routeById.get(id)!, ctx), 1);
  return {
    ticket,
    path,
    trains: path.trains,
    completed: path.missing.length === 0,
    success,
    pointsPerTrain: path.trains === 0 ? Infinity : ticket.points / path.trains,
  };
}

export interface Option {
  /** every ticket kept after this choice, already held ones first */
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
  /** expected ticket points minus a small train cost; higher is better */
  score: number;
  /** false when the network needs more trains than I have left */
  feasible: boolean;
}

function evaluateSet(all: TicketEval[], trainsAvailable: number) {
  const union = new Set<string>();
  let sum = 0;
  let points = 0;
  let expected = 0;
  let chanceAll = 1;
  for (const e of all) {
    points += e.ticket.points;
    expected += (2 * e.success - 1) * e.ticket.points;
    chanceAll *= e.success;
    sum += e.trains;
    for (const id of e.path?.missing ?? []) union.add(id);
  }
  let trains = 0;
  for (const id of union) trains += routeById.get(id)!.length;
  const feasible = trains <= trainsAvailable;
  return { trains, shared: sum - trains, points, chanceAll, feasible, score: expected - TRAIN_COST * trains - (feasible ? 0 : 1000) };
}

export function evaluateOption(state: GameState, offered: string[], keep: string[]): Option {
  const ctx = pathContext(state);
  const held = state.myTickets.map((id) => evaluateTicket(ticketById.get(id)!, ctx));
  const kept = keep.map((id) => evaluateTicket(ticketById.get(id)!, ctx));
  const available = ctx.me ? trainsLeft(state, ctx.me) : 45;
  const all = [...held, ...kept];
  return {
    tickets: all,
    keep,
    drop: offered.filter((id) => !keep.includes(id)),
    ...evaluateSet(all, available),
  };
}

/**
 * Every allowed way to keep tickets from the ones just dealt, best first.
 * `minKeep` is 2 at the start of the game (1 long + 3 regular tickets are dealt) and 1 when drawing during the game.
 */
export function rankOptions(state: GameState, offered: string[], minKeep: number): Option[] {
  const options: Option[] = [];
  const n = offered.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const keep = offered.filter((_, i) => mask & (1 << i));
    if (keep.length < Math.min(minKeep, n)) continue;
    options.push(evaluateOption(state, offered, keep));
  }
  return options.sort((a, b) => b.score - a.score || a.trains - b.trains);
}

export type Verdict = "keepShared" | "keepEfficient" | "dropCostly" | "dropRisky" | "dropBlocked";

/** Short reason for each offered ticket, judged against the best option. */
export function explain(state: GameState, offered: string[], best: Option): Map<string, Verdict> {
  const result = new Map<string, Verdict>();
  const ctx = pathContext(state);
  for (const id of offered) {
    const e = evaluateTicket(ticketById.get(id)!, ctx);
    if (best.keep.includes(id)) {
      const others = best.tickets.filter((t) => t.ticket.id !== id);
      const own = new Set(e.path?.missing ?? []);
      const overlaps = others.some((o) => o.path?.missing.some((r) => own.has(r)));
      result.set(id, overlaps ? "keepShared" : "keepEfficient");
    } else if (!e.path) result.set(id, "dropBlocked");
    else result.set(id, e.success < 0.6 ? "dropRisky" : "dropCostly");
  }
  return result;
}

/** Whether my claimed routes already connect the two cities of a ticket. */
export function isCompleted(state: GameState, ticket: Ticket): boolean {
  const me = state.players.find((p) => p.isMe)?.id;
  if (!me) return false;
  const seen = new Set([ticket.from]);
  const queue = [ticket.from];
  while (queue.length) {
    const city = queue.shift()!;
    for (const [routeId, owner] of Object.entries(state.claims)) {
      if (owner !== me) continue;
      const r = routeById.get(routeId)!;
      const next = r.from === city ? r.to : r.to === city ? r.from : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.has(ticket.to);
}
