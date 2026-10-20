import type { CityId } from "../data/types";

export type PlayerColor = "red" | "blue" | "green" | "yellow" | "black";
export const PLAYER_COLORS: PlayerColor[] = ["red", "blue", "green", "yellow", "black"];

export const TRAINS_PER_PLAYER = 45;
export const STATIONS_PER_PLAYER = 3;
export const STATION_BONUS = 4;
export const EXPRESS_BONUS = 10;
export const LAST_ROUND_TRAINS = 2;

interface Meta {
  id: string;
  actorId: string;
  at: number;
}

export type ActionBody =
  | { type: "GAME_CREATED"; gameId: string; playerCount: number }
  | { type: "PLAYER_ADDED"; playerId: string; name: string; color: PlayerColor; isMe: boolean }
  | { type: "ROUTE_CLAIMED"; routeId: string; playerId: string }
  | { type: "ROUTE_UNCLAIMED"; routeId: string }
  | { type: "STATION_PLACED"; cityId: CityId; playerId: string }
  | { type: "STATION_REMOVED"; cityId: CityId; playerId: string }
  | { type: "TICKET_POINTS_SET"; playerId: string; points: number }
  | { type: "EXPRESS_OVERRIDE"; winners: string[] | null }
  | { type: "GAME_ENDED" };

export type Action = ActionBody & Meta;

export const SETUP_ACTIONS: Action["type"][] = ["GAME_CREATED", "PLAYER_ADDED"];

export function makeAction(body: ActionBody, actorId = "local", at = Date.now()): Action {
  return { ...body, id: crypto.randomUUID(), actorId, at };
}
