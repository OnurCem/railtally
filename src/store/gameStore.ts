import { create } from "zustand";
import { makeAction, SETUP_ACTIONS, type Action, type ActionBody, type PlayerColor } from "../game/actions";
import { replay, tryReduce } from "../game/reducer";
import type { RuleCode } from "../game/rules";
import { initialState, type GameState } from "../game/state";
import { LocalAdapter } from "../sync/LocalAdapter";
import type { SyncAdapter } from "../sync/SyncAdapter";

export type Screen = "home" | "new" | "game" | "summary";

export interface PlayerSetup {
  name: string;
  color: PlayerColor;
  isMe: boolean;
}

interface GameStore {
  screen: Screen;
  actions: Action[];
  state: GameState;
  adapter: SyncAdapter | null;
  go: (screen: Screen) => void;
  createGame: (players: PlayerSetup[]) => void;
  openGame: (gameId: string, screen?: Screen) => Promise<void>;
  closeGame: () => void;
  /** Applies an action. Returns an error code when the rules reject it. */
  dispatch: (body: ActionBody) => RuleCode | null;
  undo: () => boolean;
  reopen: () => void;
}

const persist = (task: Promise<void> | undefined) => task?.catch((e) => console.error("Saving failed", e));

export const canUndo = (actions: Action[]) => {
  const last = actions[actions.length - 1];
  return !!last && !SETUP_ACTIONS.includes(last.type);
};

export const useGame = create<GameStore>()((set, get) => ({
  screen: "home",
  actions: [],
  state: initialState,
  adapter: null,

  go: (screen) => set({ screen }),

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

  openGame: async (gameId, screen = "game") => {
    const adapter = new LocalAdapter(gameId);
    const actions = await adapter.load(gameId);
    set({ actions, state: replay(actions), adapter, screen });
  },

  closeGame: () => set({ actions: [], state: initialState, adapter: null, screen: "home" }),

  dispatch: (body) => {
    const { state, actions, adapter } = get();
    const action = makeAction(body);
    const result = tryReduce(state, action);
    if (!result.ok) return result.error.code;
    set({ state: result.state, actions: [...actions, action] });
    persist(adapter?.dispatch(action));
    return null;
  },

  undo: () => {
    const { actions, adapter } = get();
    if (!canUndo(actions)) return false;
    const last = actions[actions.length - 1];
    const next = actions.slice(0, -1);
    set({ actions: next, state: replay(next) });
    persist(adapter?.remove(last.id));
    return true;
  },

  reopen: () => {
    const { actions, adapter } = get();
    const ended = actions.find((a) => a.type === "GAME_ENDED");
    if (!ended) return;
    const next = actions.filter((a) => a.id !== ended.id);
    set({ actions: next, state: replay(next), screen: "game" });
    persist(adapter?.remove(ended.id));
  },
}));
