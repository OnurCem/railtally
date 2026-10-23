import { isPrivateAction, SETUP_ACTIONS, type Action } from "../game/actions";
import { replayTolerant, tryReduce } from "../game/reducer";
import { initialState } from "../game/state";
import type { ClientMsg, LogEntry, RejectCode, ServerMsg } from "./protocol";

export interface RoomResult {
  /** sent only to the sender */
  reply: ServerMsg[];
  /** appended to the log; sent to everybody in the room, the sender included */
  appended: LogEntry[];
}

const isAction = (a: unknown): a is Action =>
  !!a && typeof a === "object" && typeof (a as Action).id === "string" && typeof (a as Action).type === "string";

/**
 * The authority for one game: an append-only log of public actions and revocations, in server order.
 * Pure and storage-free (the Cloudflare Durable Object in server/ persists `entries`), so the same
 * class runs in tests and in production.
 */
export class Room {
  constructor(public entries: LogEntry[] = []) {}

  get lastSeq() {
    return this.entries.length ? this.entries[this.entries.length - 1].seq : 0;
  }

  private revokedIds(extra?: string) {
    const ids = new Set<string>(extra ? [extra] : []);
    for (const e of this.entries) if (e.kind === "revoke") ids.add(e.actionId);
    return ids;
  }

  /** Actions that still count, in order. */
  effectiveActions(without?: string): Action[] {
    const revoked = this.revokedIds(without);
    return this.entries.flatMap((e) => (e.kind === "action" && !revoked.has(e.action.id) ? [e.action] : []));
  }

  receive(msg: ClientMsg): RoomResult {
    switch (msg.t) {
      case "hello": {
        const since = Number.isInteger(msg.since) ? msg.since : 0;
        return { reply: [{ t: "entries", entries: this.entries.filter((e) => e.seq > since), hello: true }], appended: [] };
      }
      case "action":
        return this.addAction(msg.action);
      case "revoke":
        return this.revoke(msg.actionId);
      default:
        return { reply: [{ t: "rejected", ref: "", code: "malformed" }], appended: [] };
    }
  }

  private reject(ref: string, code: RejectCode): RoomResult {
    return { reply: [{ t: "rejected", ref, code }], appended: [] };
  }

  private append(entry: { kind: "action"; action: Action } | { kind: "revoke"; actionId: string }): RoomResult {
    const full = { ...entry, seq: this.lastSeq + 1 } as LogEntry;
    this.entries.push(full);
    return { reply: [], appended: [full] };
  }

  private addAction(action: Action): RoomResult {
    if (!isAction(action)) return this.reject("", "malformed");
    // a retry after a lost acknowledgement: nothing new to append, the sender learns the entry through "hello"
    if (this.entries.some((e) => e.kind === "action" && e.action.id === action.id)) return { reply: [], appended: [] };
    if (isPrivateAction(action)) return this.reject(action.id, "private");
    const { state } = replayTolerant(this.effectiveActions());
    const result = tryReduce(state, action);
    if (!result.ok) return this.reject(action.id, result.error.code);
    return this.append({ kind: "action", action });
  }

  private revoke(actionId: string): RoomResult {
    const target = this.entries.find((e) => e.kind === "action" && e.action.id === actionId);
    if (!target || target.kind !== "action") return this.reject(actionId, "unknownAction");
    if (this.revokedIds().has(actionId)) return { reply: [], appended: [] };
    if (SETUP_ACTIONS.includes(target.action.type)) return this.reject(actionId, "setupLocked");
    // the log without the target must still replay cleanly: later actions may depend on it
    let state = initialState;
    for (const a of this.effectiveActions(actionId)) {
      const result = tryReduce(state, a);
      if (!result.ok) return this.reject(actionId, result.error.code);
      state = result.state;
    }
    return this.append({ kind: "revoke", actionId });
  }
}
