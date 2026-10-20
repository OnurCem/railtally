import { PLAYER_COLORS, type Action } from "./actions";
import { claimError, RuleError, stationPlaceError } from "./rules";
import { initialState, type GameState } from "./state";

const hasPlayer = (state: GameState, id: string) => state.players.some((p) => p.id === id);

/** Pure reducer. Throws RuleError on illegal actions. */
export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "GAME_CREATED": {
      if (state.gameId) throw new RuleError("gameExists");
      if (!Number.isInteger(action.playerCount) || action.playerCount < 2 || action.playerCount > 5) {
        throw new RuleError("invalidPlayerCount");
      }
      return { ...initialState, gameId: action.gameId, playerCount: action.playerCount, createdAt: action.at };
    }
    case "PLAYER_ADDED": {
      if (!state.gameId) throw new RuleError("noGame");
      if (state.players.length >= state.playerCount) throw new RuleError("tooManyPlayers");
      if (state.players.some((p) => p.color === action.color) || !PLAYER_COLORS.includes(action.color)) {
        throw new RuleError("colorTaken");
      }
      if (action.isMe && state.players.some((p) => p.isMe)) throw new RuleError("tooManyMe");
      const { playerId, name, color, isMe } = action;
      return { ...state, players: [...state.players, { id: playerId, name, color, isMe }] };
    }
    case "ROUTE_CLAIMED": {
      const error = claimError(state, action.routeId, action.playerId);
      if (error) throw new RuleError(error);
      return { ...state, claims: { ...state.claims, [action.routeId]: action.playerId } };
    }
    case "ROUTE_UNCLAIMED": {
      if (state.ended) throw new RuleError("gameEnded");
      if (!state.claims[action.routeId]) throw new RuleError("routeNotClaimed");
      const claims = { ...state.claims };
      delete claims[action.routeId];
      return { ...state, claims };
    }
    case "STATION_PLACED": {
      const error = stationPlaceError(state, action.cityId, action.playerId);
      if (error) throw new RuleError(error);
      return { ...state, stations: { ...state.stations, [action.cityId]: action.playerId } };
    }
    case "STATION_REMOVED": {
      if (state.ended) throw new RuleError("gameEnded");
      if (state.stations[action.cityId] !== action.playerId) throw new RuleError("stationMissing");
      const stations = { ...state.stations };
      delete stations[action.cityId];
      return { ...state, stations };
    }
    case "TICKET_POINTS_SET": {
      if (!hasPlayer(state, action.playerId)) throw new RuleError("unknownPlayer");
      if (!Number.isInteger(action.points)) throw new RuleError("invalidPoints");
      return { ...state, ticketPoints: { ...state.ticketPoints, [action.playerId]: action.points } };
    }
    case "EXPRESS_OVERRIDE": {
      if (action.winners && !action.winners.every((id) => hasPlayer(state, id))) {
        throw new RuleError("unknownPlayer");
      }
      return { ...state, expressOverride: action.winners };
    }
    case "GAME_ENDED": {
      if (!state.gameId) throw new RuleError("noGame");
      if (state.ended) throw new RuleError("gameEnded");
      return { ...state, ended: true, endedAt: action.at };
    }
  }
}

/** Replays an action log from scratch. Throws on the first illegal action. */
export function replay(actions: Action[]): GameState {
  return actions.reduce(reduce, initialState);
}

export type TryResult = { ok: true; state: GameState } | { ok: false; error: RuleError };

export function tryReduce(state: GameState, action: Action): TryResult {
  try {
    return { ok: true, state: reduce(state, action) };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e };
    throw e;
  }
}
