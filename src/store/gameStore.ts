import { create } from "zustand";
import { makeAction, SETUP_ACTIONS, type Action, type ActionBody, type PlayerColor } from "../game/actions";
import { replay, replayTolerant, tryReduce } from "../game/reducer";
import type { RuleCode } from "../game/rules";
import { initialState, type GameState } from "../game/state";
import { LocalAdapter } from "../sync/LocalAdapter";
import { createTransport, getSyncUrl } from "../sync/config";
import { newSyncState } from "../sync/merge";
import { makeRoomCode, normalizeCode, type RejectCode } from "../sync/protocol";
import { loadSyncState, RemoteAdapter } from "../sync/RemoteAdapter";
import type { SyncAdapter, SyncStatus } from "../sync/SyncAdapter";

export type Screen = "home" | "new" | "join" | "game" | "summary";

export interface PlayerSetup {
  name: string;
  color: PlayerColor;
  isMe: boolean;
}

/** Present while the open game is shared with other phones. */
export interface SharedInfo {
  code: string;
  status: SyncStatus;
  /** my changes the server has not confirmed yet */
  pending: number;
}

/** What the server refused, to show once ("this route was just taken"). */
export interface SyncNotice {
  code: RejectCode;
  undo: boolean;
}

export interface JoinPreview {
  code: string;
  gameId: string;
  state: GameState;
  /** this device already has the game: open it instead of joining again */
  existing: boolean;
}

export type JoinError = "invalidCode" | "notConfigured" | "offline" | "notFound";

export type JoinChoice = { seat: string } | { name: string; color: PlayerColor };

interface GameStore {
  screen: Screen;
  actions: Action[];
  state: GameState;
  adapter: SyncAdapter | null;
  shared: SharedInfo | null;
  notice: SyncNotice | null;
  go: (screen: Screen) => void;
  createGame: (players: PlayerSetup[]) => void;
  createSharedGame: (playerCount: number, me: { name: string; color: PlayerColor }) => void;
  /** Connects to a room and reads who is in it. Throws a JoinError. */
  previewGame: (input: string) => Promise<JoinPreview>;
  /** Finishes joining after previewGame: take an existing seat or add a new player. Returns a rule code on refusal. */
  joinGame: (choice: JoinChoice) => RuleCode | null;
  cancelJoin: () => void;
  clearNotice: () => void;
  openGame: (gameId: string, screen?: Screen) => Promise<void>;
  closeGame: () => void;
  /** Applies an action. Returns an error code when the rules reject it. */
  dispatch: (body: ActionBody) => RuleCode | null;
  undo: () => boolean;
  reopen: () => void;
}

const persist = (task: Promise<void> | undefined) => task?.catch((e) => console.error("Saving failed", e));

/** The action undo would take back: my newest one that is not setup. In a local game that is simply the last one. */
export const undoTarget = (actions: Action[], actorId = "local"): Action | null => {
  for (let i = actions.length - 1; i >= 0; i--) {
    if (actions[i].actorId === actorId && !SETUP_ACTIONS.includes(actions[i].type)) return actions[i];
  }
  return null;
};

export const canUndo = (actions: Action[], actorId = "local") => undoTarget(actions, actorId) !== null;

let detach: (() => void) | null = null;
let joining: RemoteAdapter | null = null;

export class JoinFailure extends Error {
  constructor(public readonly code: JoinError) {
    super(code);
  }
}

const JOIN_TIMEOUT_MS = 8000;

const seatId = (deviceId: string) => `p-${deviceId.slice(0, 8)}`;

function cancelJoin() {
  joining?.close();
  joining = null;
}

type Setter = (partial: Partial<GameStore>) => void;

/** Shows the merged log of a shared game in the store whenever the network changes it. */
function attach(adapter: RemoteAdapter, set: Setter) {
  detach?.();
  const offs = [
    adapter.subscribeLog((log) => set({ actions: log, state: replayTolerant(log).state, shared: sharedInfo(adapter) })),
    adapter.subscribeStatus(() => set({ shared: sharedInfo(adapter) })),
    adapter.subscribeRejections((r) => set({ notice: { code: r.code, undo: r.wasUndo } })),
  ];
  detach = () => offs.forEach((off) => off());
}

function leave(adapter: SyncAdapter | null) {
  detach?.();
  detach = null;
  adapter?.close?.();
}

const sharedInfo = (a: RemoteAdapter): SharedInfo => ({ code: a.code, status: a.status, pending: a.pendingCount });

export const useGame = create<GameStore>()((set, get) => ({
  screen: "home",
  actions: [],
  state: initialState,
  adapter: null,
  shared: null,
  notice: null,

  go: (screen) => set({ screen }),

  clearNotice: () => set({ notice: null }),

  createGame: (players) => {
    const gameId = crypto.randomUUID();
    const adapter = new LocalAdapter(gameId);
    const bodies: ActionBody[] = [
      { type: "GAME_CREATED", gameId, playerCount: players.length },
      ...players.map((p, i): ActionBody => ({
        type: "PLAYER_ADDED",
        playerId: `p${i + 1}`,
        name: p.name.trim(),
        color: p.color,
        isMe: p.isMe,
      })),
    ];
    const actions = bodies.map((b) => makeAction(b));
    const state = replay(actions);
    actions.forEach((a) => persist(adapter.dispatch(a)));
    set({ actions, state, adapter, screen: "game" });
  },

  createSharedGame: (playerCount, me) => {
    leave(get().adapter);
    const gameId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const code = makeRoomCode();
    const adapter = new RemoteAdapter(createTransport(code), newSyncState(code, deviceId));
    const playerId = seatId(deviceId);
    const actions = (
      [
        { type: "GAME_CREATED", gameId, playerCount },
        { type: "PLAYER_ADDED", playerId, name: me.name.trim(), color: me.color, isMe: false },
        { type: "SEAT_TAKEN", playerId },
      ] as ActionBody[]
    ).map((b) => makeAction(b, deviceId));
    attach(adapter, set);
    actions.forEach((x) => persist(adapter.dispatch(x)));
    adapter.connect();
    set({ actions, state: replay(actions), adapter, shared: sharedInfo(adapter), notice: null, screen: "game" });
  },

  previewGame: async (input) => {
    const code = normalizeCode(input);
    if (!code) throw new JoinFailure("invalidCode");
    const url = getSyncUrl();
    if (!url) throw new JoinFailure("notConfigured");
    joining?.close();
    const adapter = new RemoteAdapter(createTransport(code, url), newSyncState(code, crypto.randomUUID()), false);
    joining = adapter;
    adapter.connect();
    const answered = await Promise.race([adapter.ready.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), JOIN_TIMEOUT_MS))]);
    if (joining !== adapter) throw new JoinFailure("offline"); // cancelled meanwhile
    if (!answered) {
      cancelJoin();
      throw new JoinFailure("offline");
    }
    const log = adapter.log();
    const gameId = adapter.gameId;
    if (!gameId) {
      cancelJoin();
      throw new JoinFailure("notFound");
    }
    const existing = !!(await loadSyncState(gameId));
    if (existing) cancelJoin();
    return { code, gameId, state: replayTolerant(log).state, existing };
  },

  joinGame: (choice) => {
    const adapter = joining;
    if (!adapter) return "noGame";
    const deviceId = adapter.actorId;
    const playerId = "seat" in choice ? choice.seat : seatId(deviceId);
    const bodies: ActionBody[] = [];
    if (!("seat" in choice)) {
      bodies.push({ type: "PLAYER_ADDED", playerId, name: choice.name.trim(), color: choice.color, isMe: false });
    }
    bodies.push({ type: "SEAT_TAKEN", playerId });
    let state = replayTolerant(adapter.log()).state;
    const actions = adapter.log();
    const added: Action[] = [];
    for (const body of bodies) {
      const action = makeAction(body, deviceId);
      const result = tryReduce(state, action);
      if (!result.ok) return result.error.code;
      state = result.state;
      added.push(action);
    }
    joining = null;
    adapter.persistEnabled = true;
    attach(adapter, set);
    added.forEach((x) => persist(adapter.dispatch(x)));
    set({ actions: [...actions, ...added], state, adapter, shared: sharedInfo(adapter), notice: null, screen: "game" });
    return null;
  },

  cancelJoin,

  openGame: async (gameId, screen = "game") => {
    leave(get().adapter);
    const sync = await loadSyncState(gameId);
    if (sync) {
      const adapter = new RemoteAdapter(createTransport(sync.code), sync);
      attach(adapter, set);
      adapter.connect();
      const actions = adapter.log();
      set({ actions, state: replayTolerant(actions).state, adapter, screen, shared: sharedInfo(adapter), notice: null });
      return;
    }
    const adapter = new LocalAdapter(gameId);
    const actions = await adapter.load(gameId);
    set({ actions, state: replay(actions), adapter, screen, shared: null, notice: null });
  },

  closeGame: () => {
    leave(get().adapter);
    set({ actions: [], state: initialState, adapter: null, shared: null, notice: null, screen: "home" });
  },

  dispatch: (body) => {
    const { state, actions, adapter } = get();
    const action = makeAction(body, adapter?.actorId);
    const result = tryReduce(state, action);
    if (!result.ok) return result.error.code;
    persist(adapter?.dispatch(action));
    set({ state: result.state, actions: [...actions, action], ...(adapter instanceof RemoteAdapter ? { shared: sharedInfo(adapter) } : {}) });
    return null;
  },

  undo: () => {
    const { actions, adapter } = get();
    const target = undoTarget(actions, adapter?.actorId);
    if (!target) return false;
    const next = actions.filter((a) => a.id !== target.id);
    persist(adapter?.remove(target.id));
    set({ actions: next, state: replayTolerant(next).state, ...(adapter instanceof RemoteAdapter ? { shared: sharedInfo(adapter) } : {}) });
    return true;
  },

  reopen: () => {
    const { actions, adapter } = get();
    const ended = actions.find((a) => a.type === "GAME_ENDED");
    if (!ended) return;
    const next = actions.filter((a) => a.id !== ended.id);
    persist(adapter?.remove(ended.id));
    set({ actions: next, state: replayTolerant(next).state, screen: "game", ...(adapter instanceof RemoteAdapter ? { shared: sharedInfo(adapter) } : {}) });
  },
}));
