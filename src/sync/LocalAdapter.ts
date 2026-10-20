import { get, set } from "idb-keyval";
import type { Action } from "../game/actions";
import type { SyncAdapter } from "./SyncAdapter";

export const GAME_KEY_PREFIX = "game:";
export const gameKey = (gameId: string) => `${GAME_KEY_PREFIX}${gameId}`;

/** Stores each game's action log in IndexedDB. */
export class LocalAdapter implements SyncAdapter {
  private listeners = new Set<(a: Action) => void>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly gameId: string) {}

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  dispatch(action: Action): Promise<void> {
    return this.serialize(async () => {
      const actions = (await get<Action[]>(gameKey(this.gameId))) ?? [];
      await set(gameKey(this.gameId), [...actions, action]);
      this.listeners.forEach((l) => l(action));
    });
  }

  remove(actionId: string): Promise<void> {
    return this.serialize(async () => {
      const actions = (await get<Action[]>(gameKey(this.gameId))) ?? [];
      await set(gameKey(this.gameId), actions.filter((a) => a.id !== actionId));
    });
  }

  subscribe(onAction: (a: Action) => void): () => void {
    this.listeners.add(onAction);
    return () => this.listeners.delete(onAction);
  }

  async load(gameId: string): Promise<Action[]> {
    return (await get<Action[]>(gameKey(gameId))) ?? [];
  }
}
