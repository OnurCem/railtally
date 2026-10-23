import type { Action } from "../game/actions";

export type SyncStatus = "connecting" | "online" | "offline";

/** Where a game's action log lives. v1: this device. v4: a realtime server. */
export interface SyncAdapter {
  dispatch(action: Action): Promise<void>;
  /** Removes an action again (undo). A server adapter turns this into a revocation. */
  remove(actionId: string): Promise<void>;
  subscribe(onAction: (a: Action) => void): () => void;
  load(gameId: string): Promise<Action[]>;
  /** `actorId` for new actions; defaults to "local". */
  readonly actorId?: string;
  /** Shared games: the whole merged log again after every change coming from the network. */
  subscribeLog?(onLog: (log: Action[]) => void): () => void;
  close?(): void;
}
