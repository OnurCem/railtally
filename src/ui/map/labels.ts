import layout from "./labelLayout.json";
import type { Label } from "./labelPlacement";

/** Precomputed label positions. Regenerate with `UPDATE_LABELS=1 npm test` after changing the layout. */
export const labels = new Map<string, Label>(Object.entries(layout as Record<string, Label>));
