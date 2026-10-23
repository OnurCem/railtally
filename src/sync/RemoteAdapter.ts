import { del, get, set } from "idb-keyval";
import type { Action } from "../game/actions";
import type { RejectCode } from "./protocol";
import { gameKey } from "./LocalAdapter";
import { addLocal, applyEntries, applyRejection, effectiveLog, lastSeq, removeLocal, type SyncState } from "./merge";
import type { ServerMsg } from "./protocol";
import type { SyncAdapter, SyncStatus } from "./SyncAdapter";
import type { Transport } from "./transport";

export const SYNC_KEY_PREFIX = "sync:";
export const syncKey = (gameId: string) => `${SYNC_KEY_PREFIX}${gameId}`;

export interface Rejection {
  code: RejectCode;
  /** the action that was dropped, when it is known */
  action: Action | null;
  /** an undo that the server refused */
  wasUndo: boolean;
}

/**
 * Shared game on top of a Transport. Local changes apply at once (the store does that), go out as "pending",
 * and become final when the server's log contains them. Everything the server sends is merged into one list
 * (see merge.ts) and published through `subscribeLog`.
 */
export class RemoteAdapter implements SyncAdapter {
  readonly actorId: string;
  status: SyncStatus = "connecting";
  private sync: SyncState;
  private logListeners = new Set<(log: Action[]) => void>();
  private statusListeners = new Set<(s: SyncStatus) => void>();
  private rejectionListeners = new Set<(r: Rejection) => void>();
  private actionListeners = new Set<(a: Action) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private heardFromServer = false;
  private resolveReady!: () => void;
  /** Resolves after the first answer to "hello" of this session. */
  readonly ready = new Promise<void>((r) => (this.resolveReady = r));

  constructor(private readonly transport: Transport, initial: SyncState, public persistEnabled = true) {
    this.sync = initial;
    this.actorId = initial.deviceId;
  }

  get code() {
    return this.sync.code;
  }

  get pendingCount() {
    return this.sync.pending.length + this.sync.pendingRevokes.length;
  }

  get state(): SyncState {
    return this.sync;
  }

  /** The game id once the server log (or a pending GAME_CREATED) has it. */
  get gameId(): string | null {
    for (const a of effectiveLog(this.sync)) if (a.type === "GAME_CREATED") return a.gameId;
    return null;
  }

  log(): Action[] {
    return effectiveLog(this.sync);
  }

  connect() {
    this.transport.connect({
      onOpen: () => {
        this.setStatus("online");
        this.transport.send({ t: "hello", since: lastSeq(this.sync) });
        for (const action of this.sync.pending) this.transport.send({ t: "action", action });
        for (const actionId of this.sync.pendingRevokes) this.transport.send({ t: "revoke", actionId });
      },
      onClose: () => this.setStatus("offline"),
      onMessage: (msg) => this.handle(msg),
    });
  }

  private setStatus(status: SyncStatus) {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((l) => l(status));
  }

  private handle(msg: ServerMsg) {
    if (msg.t === "entries") {
      const { state, gap, changed } = applyEntries(this.sync, msg.entries);
      this.sync = state;
      if (gap) this.transport.send({ t: "hello", since: lastSeq(state) });
      if (changed) this.publish();
      if (msg.hello && !gap && !this.heardFromServer) {
        this.heardFromServer = true;
        this.resolveReady();
      }
    } else {
      const { state, action, wasRevoke } = applyRejection(this.sync, msg.ref);
      this.sync = state;
      this.publish();
      this.rejectionListeners.forEach((l) => l({ code: msg.code, action, wasUndo: wasRevoke }));
    }
  }

  private publish() {
    const log = effectiveLog(this.sync);
    this.logListeners.forEach((l) => l(log));
    this.save();
  }

  private save() {
    const gameId = this.gameId;
    if (!this.persistEnabled || !gameId) return;
    const sync = this.sync;
    const log = effectiveLog(sync);
    this.queue = this.queue
      .then(() => Promise.all([set(syncKey(gameId), sync), set(gameKey(gameId), log)]))
      .catch((e) => console.error("Saving failed", e));
  }

  /** Resolves when everything handed to save() so far is on disk. */
  flush(): Promise<unknown> {
    return this.queue;
  }

  async dispatch(action: Action): Promise<void> {
    this.sync = addLocal(this.sync, action);
    // the store applied it already; listeners of the merged log hear about it only when it moves around
    this.actionListeners.forEach((l) => l(action));
    this.save();
    if (this.sync.pending.some((a) => a.id === action.id)) this.transport.send({ t: "action", action });
  }

  async remove(actionId: string): Promise<void> {
    const { state, revoke } = removeLocal(this.sync, actionId);
    this.sync = state;
    this.save();
    if (revoke) {
      this.publish();
      this.transport.send({ t: "revoke", actionId });
    }
  }

  subscribe(onAction: (a: Action) => void): () => void {
    this.actionListeners.add(onAction);
    return () => this.actionListeners.delete(onAction);
  }

  subscribeLog(onLog: (log: Action[]) => void): () => void {
    this.logListeners.add(onLog);
    return () => this.logListeners.delete(onLog);
  }

  subscribeStatus(onStatus: (s: SyncStatus) => void): () => void {
    this.statusListeners.add(onStatus);
    return () => this.statusListeners.delete(onStatus);
  }

  subscribeRejections(onRejection: (r: Rejection) => void): () => void {
    this.rejectionListeners.add(onRejection);
    return () => this.rejectionListeners.delete(onRejection);
  }

  async load(gameId: string): Promise<Action[]> {
    return (await get<Action[]>(gameKey(gameId))) ?? this.log();
  }

  close() {
    this.transport.close();
    this.setStatus("offline");
  }
}

export const loadSyncState = (gameId: string) => get<SyncState>(syncKey(gameId));
export const deleteSyncState = (gameId: string) => del(syncKey(gameId));
