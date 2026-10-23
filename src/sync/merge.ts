import { isPrivateAction, type Action } from "../game/actions";
import type { LogEntry } from "./protocol";

/**
 * What one device knows about a shared game. The server's log is the truth; `pending` and `pendingRevokes`
 * are this device's optimistic changes that the server has not confirmed yet, and `privates` never leave the device.
 */
export interface SyncState {
  code: string;
  /** this device; used as `actorId` of its actions */
  deviceId: string;
  /** confirmed entries, contiguous from seq 1 */
  entries: LogEntry[];
  pending: Action[];
  /** public actions this device undid; confirmed once the server appends the revoke */
  pendingRevokes: string[];
  /** private actions with the public action they followed when they were made */
  privates: { action: Action; after: string | null }[];
}

export const newSyncState = (code: string, deviceId: string): SyncState => ({
  code,
  deviceId,
  entries: [],
  pending: [],
  pendingRevokes: [],
  privates: [],
});

export const lastSeq = (s: SyncState) => (s.entries.length ? s.entries[s.entries.length - 1].seq : 0);

/** The public log as this device shows it: confirmed (server order) without undone actions, then my pending ones. */
export function publicLog(s: SyncState): Action[] {
  const revoked = new Set(s.pendingRevokes);
  for (const e of s.entries) if (e.kind === "revoke") revoked.add(e.actionId);
  const confirmed = s.entries.flatMap((e) => (e.kind === "action" && !revoked.has(e.action.id) ? [e.action] : []));
  return [...confirmed, ...s.pending.filter((a) => !revoked.has(a.id))];
}

/** Public log with my private actions put back after the action they followed (at the end when it is gone). */
export function effectiveLog(s: SyncState): Action[] {
  const log = publicLog(s);
  if (!s.privates.length) return log;
  const ids = new Set(log.map((a) => a.id));
  const after = new Map<string | null, Action[]>();
  for (const p of s.privates) {
    const anchor = p.after !== null && ids.has(p.after) ? p.after : "end";
    after.set(anchor, [...(after.get(anchor) ?? []), p.action]);
  }
  const out: Action[] = [...(after.get(null) ?? [])];
  for (const a of log) out.push(a, ...(after.get(a.id) ?? []));
  out.push(...(after.get("end") ?? []));
  return out;
}

/** The last public action in the current view, used as the anchor of a new private action. */
export const lastPublicId = (s: SyncState): string | null => publicLog(s).at(-1)?.id ?? null;

/** Takes server entries in order. Returns false when there is a gap (the caller asks again with "hello"). */
export function applyEntries(s: SyncState, incoming: LogEntry[]): { state: SyncState; gap: boolean; changed: boolean } {
  let state = s;
  let changed = false;
  for (const entry of [...incoming].sort((a, b) => a.seq - b.seq)) {
    const last = lastSeq(state);
    if (entry.seq <= last) continue;
    if (entry.seq !== last + 1) return { state, gap: true, changed };
    changed = true;
    state = {
      ...state,
      entries: [...state.entries, entry],
      pending: entry.kind === "action" ? state.pending.filter((a) => a.id !== entry.action.id) : state.pending,
      pendingRevokes: entry.kind === "revoke" ? state.pendingRevokes.filter((id) => id !== entry.actionId) : state.pendingRevokes,
    };
  }
  return { state, gap: false, changed };
}

/** The server refused something this device sent; forget it. Returns the refused action when it was a pending one. */
export function applyRejection(s: SyncState, ref: string): { state: SyncState; action: Action | null; wasRevoke: boolean } {
  const action = s.pending.find((a) => a.id === ref) ?? null;
  const wasRevoke = s.pendingRevokes.includes(ref);
  return {
    state: {
      ...s,
      pending: s.pending.filter((a) => a.id !== ref),
      pendingRevokes: s.pendingRevokes.filter((id) => id !== ref),
    },
    action,
    wasRevoke,
  };
}

/** Adds a local action: public ones wait for the server, private ones stay here. */
export function addLocal(s: SyncState, action: Action): SyncState {
  if (isPrivateAction(action)) return { ...s, privates: [...s.privates, { action, after: lastPublicId(s) }] };
  return { ...s, pending: [...s.pending, action] };
}

/** Undo. Private and pending actions simply disappear; a confirmed one has to be revoked on the server. */
export function removeLocal(s: SyncState, actionId: string): { state: SyncState; revoke: boolean } {
  if (s.privates.some((p) => p.action.id === actionId)) {
    return { state: { ...s, privates: s.privates.filter((p) => p.action.id !== actionId) }, revoke: false };
  }
  if (s.pending.some((a) => a.id === actionId)) {
    return { state: { ...s, pending: s.pending.filter((a) => a.id !== actionId) }, revoke: false };
  }
  if (s.pendingRevokes.includes(actionId)) return { state: s, revoke: false };
  const confirmed = s.entries.some((e) => e.kind === "action" && e.action.id === actionId);
  return confirmed ? { state: { ...s, pendingRevokes: [...s.pendingRevokes, actionId] }, revoke: true } : { state: s, revoke: false };
}
