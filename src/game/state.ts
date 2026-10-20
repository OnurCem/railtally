import type { CityId } from "../data/types";
import type { PlayerColor } from "./actions";

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  isMe: boolean;
}

export interface GameState {
  gameId: string | null;
  playerCount: number;
  createdAt: number;
  players: Player[];
  /** routeId -> playerId */
  claims: Record<string, string>;
  /** cityId -> playerId */
  stations: Record<CityId, string>;
  /** playerId -> manual ticket points (+/-) */
  ticketPoints: Record<string, number>;
  /** playerIds chosen manually as European Express winners, or null for automatic */
  expressOverride: string[] | null;
  ended: boolean;
  endedAt: number | null;
}

export const initialState: GameState = {
  gameId: null,
  playerCount: 0,
  createdAt: 0,
  players: [],
  claims: {},
  stations: {},
  ticketPoints: {},
  expressOverride: null,
  ended: false,
  endedAt: null,
};
