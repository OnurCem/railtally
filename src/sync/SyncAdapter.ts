import type { Action } from "../game/actions";

/** Where a game's action log lives. v1: this device. v4: a realtime server. */
export interface SyncAdapter {
  dispatch(action: Action): Promise<void>;
  /** Removes an action again (undo). A server adapter may turn this into a compensating action. */
  remove(actionId: string): Promise<void>;
  subscribe(onAction: (a: Action) => void): () => void;
  load(gameId: string): Promise<Action[]>;
}
