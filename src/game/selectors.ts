import { routeById } from "../data/lookup";
import type { Route } from "../data/types";
import { EXPRESS_BONUS, STATION_BONUS } from "./actions";
import { longestTrail, routePoints } from "./scoring";
import { stationsLeft, trainsLeft } from "./rules";
import type { GameState, Player } from "./state";

export { isLastRound, stationsLeft, trainsLeft } from "./rules";

export function playerRoutes(state: GameState, playerId: string): Route[] {
  return Object.entries(state.claims)
    .filter(([, owner]) => owner === playerId)
    .map(([routeId]) => routeById.get(routeId)!)
    .filter(Boolean);
}

export const routeScore = (state: GameState, playerId: string) =>
  playerRoutes(state, playerId).reduce((sum, r) => sum + routePoints(r.length), 0);

export const longestPath = (state: GameState, playerId: string) =>
  longestTrail(playerRoutes(state, playerId));

/** Automatic European Express winners: all players tied for the longest trail. */
export function autoExpressWinners(state: GameState): string[] {
  const lengths = state.players.map((p) => ({ id: p.id, len: longestPath(state, p.id) }));
  const max = Math.max(0, ...lengths.map((l) => l.len));
  return max === 0 ? [] : lengths.filter((l) => l.len === max).map((l) => l.id);
}

export const expressWinners = (state: GameState) => state.expressOverride ?? autoExpressWinners(state);

export interface ScoreBreakdown {
  routes: number;
  stations: number;
  tickets: number;
  express: number;
  total: number;
}

export function finalScore(state: GameState, playerId: string): ScoreBreakdown {
  const routes = routeScore(state, playerId);
  const stations = stationsLeft(state, playerId) * STATION_BONUS;
  const tickets = state.ticketPoints[playerId] ?? 0;
  const express = expressWinners(state).includes(playerId) ? EXPRESS_BONUS : 0;
  return { routes, stations, tickets, express, total: routes + stations + tickets + express };
}

export function winners(state: GameState): Player[] {
  const totals = state.players.map((p) => ({ p, total: finalScore(state, p.id).total }));
  const max = Math.max(...totals.map((t) => t.total));
  return totals.filter((t) => t.total === max).map((t) => t.p);
}

export const me = (state: GameState): Player | undefined => state.players.find((p) => p.isMe);

export const trainsOf = trainsLeft;
