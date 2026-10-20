import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import stored from "../src/ui/map/labelLayout.json";
import { placeLabels } from "../src/ui/map/labelPlacement";

const FILE = "src/ui/map/labelLayout.json";

describe("label layout", () => {
  it("is up to date (run `UPDATE_LABELS=1 npm test` to regenerate)", () => {
    const fresh = Object.fromEntries(
      [...placeLabels().entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, l]) => [id, { x: round(l.x), y: round(l.y), anchor: l.anchor, box: { x0: round(l.box.x0), y0: round(l.box.y0), x1: round(l.box.x1), y1: round(l.box.y1) } }]),
    );
    if (process.env.UPDATE_LABELS) writeFileSync(FILE, JSON.stringify(fresh, null, 1) + "\n");
    else expect(stored).toEqual(fresh);
  });
});

const round = (n: number) => Math.round(n * 10) / 10;
