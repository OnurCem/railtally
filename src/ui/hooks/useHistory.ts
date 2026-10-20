import { useEffect, useRef } from "react";
import { useGame, type Screen } from "../../store/gameStore";

/** Depth of each screen in the browser history, so the system back button walks summary → map → home. */
const DEPTH: Record<Screen, number> = { home: 0, new: 1, game: 1, summary: 2 };
const PARENT: Record<number, Screen> = { 0: "home", 1: "game" };

interface HistoryState {
  depth: number;
  /** this entry was pushed by openDataCheck */
  data?: boolean;
}

const readState = (): HistoryState | null => {
  const s = window.history.state as Partial<HistoryState> | null;
  return s && typeof s.depth === "number" ? (s as HistoryState) : null;
};

export function openDataCheck() {
  window.history.pushState({ depth: readState()?.depth ?? 0, data: true }, "", "#data");
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function closeDataCheck() {
  if (readState()?.data) window.history.back();
  else {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
}

/** Keeps the History API in step with the current screen (no router library). */
export function useHistory() {
  const screen = useGame((s) => s.screen);
  const depth = useRef(0);

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, depth: 0 }, "");
    const onPop = (e: PopStateEvent) => {
      const state = e.state as Partial<HistoryState> | null;
      if (!state || typeof state.depth !== "number") return;
      depth.current = state.depth;
      const game = useGame.getState();
      if (DEPTH[game.screen] === state.depth) return;
      if (game.screen === "home") {
        window.history.go(-state.depth); // forward into a screen that no longer exists
        return;
      }
      if (state.depth === 0) game.closeGame();
      else game.go(PARENT[state.depth] ?? "game");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const target = DEPTH[screen];
    const current = depth.current;
    if (target === current) return;
    depth.current = target;
    if (target > current) {
      for (let d = current + 1; d <= target; d++) window.history.pushState({ depth: d }, "");
    } else {
      window.history.go(target - current);
    }
  }, [screen]);
}
