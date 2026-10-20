import { cityById, routeById } from "../data/lookup";
import {
  LAST_ROUND_TRAINS,
  STATIONS_PER_PLAYER,
  TRAINS_PER_PLAYER,
} from "./actions";
import type { GameState } from "./state";

/** Error codes double as i18n keys under `errors.*`. */
export type RuleCode =
  | "gameEnded"
  | "unknownRoute"
  | "unknownCity"
  | "unknownPlayer"
  | "unknownTicket"
  | "ticketHeld"
  | "ticketMissing"
  | "routeTaken"
  | "routeNotClaimed"
  | "noTrains"
  | "twinOwn"
  | "twinBlocked"
  | "stationTaken"
  | "stationMissing"
  | "noStations"
  | "colorTaken"
  | "tooManyPlayers"
  | "tooManyMe"
  | "invalidPlayerCount"
  | "invalidPoints"
  | "gameExists"
  | "noGame";

export class RuleError extends Error {
  constructor(public readonly code: RuleCode) {
    super(code);
  }
}

export function trainsUsed(state: GameState, playerId: string): number {
  let used = 0;
  for (const [routeId, owner] of Object.entries(state.claims)) {
    if (owner === playerId) used += routeById.get(routeId)?.length ?? 0;
  }
  return used;
}

export const trainsLeft = (state: GameState, playerId: string) =>
  TRAINS_PER_PLAYER - trainsUsed(state, playerId);

export function stationsLeft(state: GameState, playerId: string): number {
  const placed = Object.values(state.stations).filter((p) => p === playerId).length;
  return STATIONS_PER_PLAYER - placed;
}

export const isLastRound = (state: GameState) =>
  state.players.some((p) => trainsLeft(state, p.id) <= LAST_ROUND_TRAINS);

/** Returns why `playerId` cannot claim `routeId`, or null when allowed. */
export function claimError(state: GameState, routeId: string, playerId: string): RuleCode | null {
  if (state.ended) return "gameEnded";
  const route = routeById.get(routeId);
  if (!route) return "unknownRoute";
  if (!state.players.some((p) => p.id === playerId)) return "unknownPlayer";
  if (state.claims[routeId]) return "routeTaken";
  if (route.length > trainsLeft(state, playerId)) return "noTrains";
  if (route.doubleOf) {
    const twinOwner = state.claims[route.doubleOf];
    if (twinOwner === playerId) return "twinOwn";
    if (twinOwner && state.playerCount <= 3) return "twinBlocked";
  }
  return null;
}

export function stationPlaceError(state: GameState, cityId: string, playerId: string): RuleCode | null {
  if (state.ended) return "gameEnded";
  if (!cityById.has(cityId)) return "unknownCity";
  if (!state.players.some((p) => p.id === playerId)) return "unknownPlayer";
  if (state.stations[cityId]) return "stationTaken";
  if (stationsLeft(state, playerId) <= 0) return "noStations";
  return null;
}
