import { create } from "zustand";
import { routeById } from "../data/lookup";
import { usable } from "../game/paths";
import type { GameState } from "../game/state";
import { diffPlans, type PlanChange, type StrategyPlan } from "../game/strategy";
import { pathContext } from "../game/tickets";

/** The previous plan lives in memory only: it is not an action and is never saved or synced. */
interface PlanStore {
  prev: StrategyPlan | null;
  /** what the latest map change did to the plan; null when nothing planned was lost */
  change: PlanChange | null;
  observe: (plan: StrategyPlan | null, state: GameState) => void;
  dismiss: () => void;
}

export const usePlan = create<PlanStore>()((set, get) => ({
  prev: null,
  change: null,

  observe: (plan, state) => {
    const { prev, change } = get();
    if (prev === plan) return;
    const found = diffPlans(prev, plan, state);
    if (found) return set({ prev: plan, change: found });
    // an undo can give a taken route back: drop the note once none of its routes is lost any more
    const ctx = pathContext(state);
    const stillLost = !!plan && !!change && plan.gameId === change.gameId && change.taken.some((id) => !usable(routeById.get(id)!, ctx) && ctx.claims[id] !== ctx.me);
    set({ prev: plan, change: stillLost ? change : null });
  },

  dismiss: () => set({ change: null }),
}));
