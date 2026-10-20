import { cities } from "../../data/cities";
import { MAP_HEIGHT, MAP_WIDTH } from "../../data/projection";
import { cityPoints, geometries, NODE_RADIUS, type Point } from "./geometry";

export interface Label {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  /** bounding box of the text */
  box: { x0: number; y0: number; x1: number; y1: number };
}

type Slot = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const FONT_SIZE = 13;
const CHAR_WIDTH = 7.3;
const HEIGHT = 15;
const GAP = 5;
/** lower is preferred */
const SLOT_COST: Record<Slot, number> = { n: 0, s: 1, e: 2, w: 2, ne: 3, nw: 3, se: 4, sw: 4 };
const SLOTS = Object.keys(SLOT_COST) as Slot[];
/** Labels may sit further from their city when the space next to it is full. */
const EXTRA_DISTANCES = [0, 8, 16, 26];

/** Optional hand-picked slots for cities where the automatic choice is not good enough. */
export const LABEL_OVERRIDES: Record<string, Slot> = {};

function labelAt(cityId: string, name: string, slot: Slot, extra = 0): Label {
  const [cx, cy] = cityPoints.get(cityId)!;
  const w = name.length * CHAR_WIDTH + 4;
  const r = NODE_RADIUS + GAP - 2 + extra;
  let x = cx;
  let baseline = cy;
  let anchor: Label["anchor"] = "middle";
  if (slot === "n") baseline = cy - r;
  if (slot === "s") baseline = cy + r + FONT_SIZE - 3;
  if (slot === "e" || slot === "ne" || slot === "se") {
    anchor = "start";
    x = cx + r;
  }
  if (slot === "w" || slot === "nw" || slot === "sw") {
    anchor = "end";
    x = cx - r;
  }
  if (slot === "e" || slot === "w") baseline = cy + FONT_SIZE / 2 - 2;
  if (slot === "ne" || slot === "nw") baseline = cy - r + 4;
  if (slot === "se" || slot === "sw") baseline = cy + r + 6;
  const x0 = anchor === "middle" ? x - w / 2 : anchor === "start" ? x : x - w;
  return { x, y: baseline, anchor, box: { x0, y0: baseline - HEIGHT + 3, x1: x0 + w, y1: baseline + 3 } };
}

const inflate = (b: Label["box"], m: number) => ({ x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m });
const overlaps = (a: Label["box"], b: Label["box"]) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const contains = (b: Label["box"], p: Point) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;

/** Dense sample of every drawn car and route line, used to find labels that sit on routes. */
export const routeSamples: Point[] = geometries.flatMap((g) => [
  ...g.points,
  ...g.cars.flatMap((c) => {
    const rad = (c.angle * Math.PI) / 180;
    const half = c.length / 2;
    return [-1, -0.5, 0, 0.5, 1].map((k): Point => [c.x + Math.cos(rad) * half * k, c.y + Math.sin(rad) * half * k]);
  }),
]);

function cost(cityId: string, label: Label, placed: Map<string, Label>): number {
  let total = 0;
  const padded = inflate(label.box, 3);
  for (const p of routeSamples) if (contains(padded, p)) total += 6;
  for (const [id, c] of cityPoints) {
    if (id === cityId) continue;
    if (contains(inflate(label.box, NODE_RADIUS - 2), c)) total += 60;
  }
  for (const [id, other] of placed) {
    if (id !== cityId && overlaps(inflate(label.box, 2), other.box)) total += 120;
  }
  const { x0, y0, x1, y1 } = label.box;
  if (x0 < 4 || y0 < 4 || x1 > MAP_WIDTH - 4 || y1 > MAP_HEIGHT - 4) total += 300;
  return total;
}

function place(): Map<string, Label> {
  const placed = new Map<string, Label>();
  const slots = new Map<string, Slot>();
  const crowded = [...cities].sort(
    (a, b) => routeSamples.filter((p) => Math.hypot(p[0] - cityPoints.get(b.id)![0], p[1] - cityPoints.get(b.id)![1]) < 60).length -
      routeSamples.filter((p) => Math.hypot(p[0] - cityPoints.get(a.id)![0], p[1] - cityPoints.get(a.id)![1]) < 60).length,
  );
  for (let pass = 0; pass < 3; pass++) {
    for (const city of crowded) {
      const options = LABEL_OVERRIDES[city.id] ? [LABEL_OVERRIDES[city.id]] : SLOTS;
      let best: { slot: Slot; label: Label; cost: number } | null = null;
      for (const extra of EXTRA_DISTANCES) {
        for (const slot of options) {
          const label = labelAt(city.id, city.name, slot, extra);
          const c = cost(city.id, label, placed) + SLOT_COST[slot] * 0.5 + extra * 0.4;
          if (!best || c < best.cost) best = { slot, label, cost: c };
        }
      }
      slots.set(city.id, best!.slot);
      placed.set(city.id, best!.label);
    }
  }
  return placed;
}

export const labels: Map<string, Label> = place();

/** Samples that fall inside a label box (for tests). */
export function routeSamplesUnder(label: Label): number {
  return routeSamples.filter((p) => contains(label.box, p)).length;
}
