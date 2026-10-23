import { del, entries } from "idb-keyval";
import type { Action, PlayerColor } from "../game/actions";
import { replay } from "../game/reducer";
import { finalScore, routeScore, winners } from "../game/selectors";
import { GAME_KEY_PREFIX, gameKey } from "../sync/LocalAdapter";
import { deleteSyncState } from "../sync/RemoteAdapter";

export interface PlayerSummary {
  id: string;
  name: string;
  color: PlayerColor;
  isMe: boolean;
  /** final score when the game ended, route points only while it is running */
  score: number;
}

export interface GameSummary {
  gameId: string;
  createdAt: number;
  endedAt: number | null;
  ended: boolean;
  players: PlayerSummary[];
  winnerIds: string[];
}

export function summarize(actions: Action[]): GameSummary | null {
  try {
    const state = replay(actions);
    if (!state.gameId) return null;
    const players = state.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isMe: p.isMe,
      score: state.ended ? finalScore(state, p.id).total : routeScore(state, p.id),
    }));
    return {
      gameId: state.gameId,
      createdAt: state.createdAt,
      endedAt: state.endedAt,
      ended: state.ended,
      players,
      winnerIds: state.ended ? winners(state).map((p) => p.id) : [],
    };
  } catch {
    return null;
  }
}

/** All saved games, newest first. Unreadable games are skipped. */
export async function listGames(): Promise<GameSummary[]> {
  const all = await entries<string, Action[]>();
  return all
    .filter(([key]) => typeof key === "string" && key.startsWith(GAME_KEY_PREFIX))
    .map(([, actions]) => summarize(actions))
    .filter((s): s is GameSummary => s !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export const deleteGame = (gameId: string) => Promise.all([del(gameKey(gameId)), deleteSyncState(gameId)]);

export interface Stats {
  gamesPlayed: number;
  wins: number;
  averageScore: number;
  favoriteColor: PlayerColor | null;
}

/** Personal stats from finished games where I was a player. */
export function computeStats(games: GameSummary[]): Stats {
  const mine = games.filter((g) => g.ended && g.players.some((p) => p.isMe));
  const colorCount = new Map<PlayerColor, number>();
  let wins = 0;
  let total = 0;
  for (const g of mine) {
    const me = g.players.find((p) => p.isMe)!;
    if (g.winnerIds.includes(me.id)) wins++;
    total += me.score;
    colorCount.set(me.color, (colorCount.get(me.color) ?? 0) + 1);
  }
  const favorite = [...colorCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    gamesPlayed: mine.length,
    wins,
    averageScore: mine.length ? Math.round((total / mine.length) * 10) / 10 : 0,
    favoriteColor: favorite,
  };
}
