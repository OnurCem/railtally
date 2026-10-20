import { cities } from "../../data/cities";
import { project } from "../../data/projection";
import { COMPASS, routeBulge } from "../../data/curves";
import { routes } from "../../data/routes";
import type { Route } from "../../data/types";

export type Point = [number, number];

export const NODE_RADIUS = 13;
const TRIM = NODE_RADIUS + 4;
const CAR_GAP = 3;
export const CAR_WIDTH = 11;
const DOUBLE_OFFSET = 6.5;
/** Cars of different routes leaving the same city must stay at least this far apart (centre to centre). */
const MIN_SEPARATION = CAR_WIDTH + 2;
/** How far cars may start beyond the normal trim to keep apart from a neighbouring route. */
const MAX_EXTRA_TRIM = 18;

export interface Car {
  x: number;
  y: number;
  /** degrees */
  angle: number;
  length: number;
  locomotive: boolean;
}

export interface RouteGeometry {
  route: Route;
  start: Point;
  end: Point;
  /** the drawn centre line between the two city nodes, used for highlighting and hit-testing */
  points: Point[];
  cars: Car[];
}

export const cityPoints = new Map<string, Point>(cities.map((c) => [c.id, project(c)]));

const CURVE_STEPS = 64;

/** Quadratic Bézier from a to b that bulges `bend` map units sideways, shifted by `shift` along the normal. */
function centreLine(a: Point, b: Point, bend: number, shift: number): Point[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dist = Math.hypot(dx, dy);
  const nx = dy / dist; // left of travel direction with north up (screen y points down)
  const ny = -dx / dist;
  const p0: Point = [a[0] + nx * shift, a[1] + ny * shift];
  const p2: Point = [b[0] + nx * shift, b[1] + ny * shift];
  const c: Point = [(p0[0] + p2[0]) / 2 + nx * bend * 2, (p0[1] + p2[1]) / 2 + ny * bend * 2];
  return Array.from({ length: CURVE_STEPS + 1 }, (_, i) => {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]] as Point;
  });
}

/** Point and direction at arc length `s` along a polyline. */
function along(points: Point[], cumulative: number[], s: number): { point: Point; angle: number } {
  let i = 1;
  while (i < points.length - 1 && cumulative[i] < s) i++;
  const [p, q] = [points[i - 1], points[i]];
  const span = cumulative[i] - cumulative[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (s - cumulative[i - 1]) / span));
  return {
    point: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t],
    angle: (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI,
  };
}

/** Signed bend (positive = left of travel) that makes the route bulge the way the original board does. */
export function bendFor(route: Route, a: Point, b: Point): number {
  const bulge = routeBulge[`${route.from}-${route.to}`];
  if (!bulge) return 0;
  const [compass, ratio] = bulge;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dist = Math.hypot(dx, dy);
  const [vx, vy] = COMPASS[compass];
  const side = Math.sign((vx * dy - vy * dx) / dist) || 1; // dot with the left normal (dy, -dx)
  return side * ratio * dist;
}

interface Line {
  route: Route;
  line: Point[];
  cumulative: number[];
  total: number;
}

function makeLine(route: Route): Line {
  const a = cityPoints.get(route.from)!;
  const b = cityPoints.get(route.to)!;
  const side = route.doubleOf ? (route.id.endsWith("-a") ? 1 : -1) : 0;
  const line = centreLine(a, b, bendFor(route, a, b), DOUBLE_OFFSET * side);
  const cumulative = [0];
  for (let i = 1; i < line.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  }
  return { route, line, cumulative, total: cumulative[cumulative.length - 1] };
}

const pointFromEnd = (l: Line, atEnd: boolean, t: number): Point =>
  along(l.line, l.cumulative, atEnd ? l.total - t : t).point;

/**
 * Routes that leave a city at a narrow angle would put their first cars on top of each other.
 * Returns how far from the city both routes must start so their cars keep apart.
 */
function clearance(a: Line, aAtEnd: boolean, b: Line, bAtEnd: boolean): number {
  for (let t = TRIM; t < TRIM + MAX_EXTRA_TRIM; t++) {
    const pa = pointFromEnd(a, aAtEnd, t);
    const pb = pointFromEnd(b, bAtEnd, t);
    if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) >= MIN_SEPARATION) return t;
  }
  return TRIM + MAX_EXTRA_TRIM;
}

function computeTrims(lines: Line[]): [number, number][] {
  const trims = lines.map((): [number, number] => [TRIM, TRIM]);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const [a, b] = [lines[i], lines[j]];
      if (a.route.doubleOf === b.route.id) continue; // the two lanes of a double route run side by side
      for (const city of [a.route.from, a.route.to]) {
        if (city !== b.route.from && city !== b.route.to) continue;
        const aAtEnd = a.route.to === city;
        const bAtEnd = b.route.to === city;
        const t = clearance(a, aAtEnd, b, bAtEnd);
        trims[i][aAtEnd ? 1 : 0] = Math.max(trims[i][aAtEnd ? 1 : 0], t);
        trims[j][bAtEnd ? 1 : 0] = Math.max(trims[j][bAtEnd ? 1 : 0], t);
      }
    }
  }
  // never eat more than a fifth of a short route
  return trims.map(([s0, s1], i) => {
    const room = lines[i].total * 0.2;
    return [Math.min(s0, TRIM + room), Math.min(s1, TRIM + room)];
  });
}

function buildGeometry({ route, line, cumulative, total }: Line, [trimStart, trimEnd]: [number, number]): RouteGeometry {
  const usable = total - trimStart - trimEnd;
  const pitch = usable / route.length;

  const cars: Car[] = Array.from({ length: route.length }, (_, i) => {
    const { point, angle } = along(line, cumulative, trimStart + pitch * (i + 0.5));
    return { x: point[0], y: point[1], angle, length: pitch - CAR_GAP, locomotive: i < route.ferryLocomotives };
  });
  const points = Array.from({ length: 17 }, (_, i) => along(line, cumulative, trimStart + (usable * i) / 16).point);
  return { route, start: points[0], end: points[points.length - 1], points, cars };
}

const allLines = routes.map(makeLine);
const allTrims = computeTrims(allLines);
export const geometries: RouteGeometry[] = allLines.map((l, i) => buildGeometry(l, allTrims[i]));

export function distanceToPolyline(p: Point, points: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegment(p, points[i - 1], points[i]));
  return best;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2));
  return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
}

/** Routes within `radius` map units of the point, nearest first. */
export function routesNear(p: Point, radius: number): { route: Route; distance: number }[] {
  return geometries
    .map((g) => ({ route: g.route, distance: distanceToPolyline(p, g.points) }))
    .filter((c) => c.distance <= radius)
    .sort((x, y) => x.distance - y.distance);
}

export function cityNear(p: Point, radius: number): string | null {
  let best: string | null = null;
  let bestDistance = radius;
  for (const [id, c] of cityPoints) {
    const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
    if (d <= bestDistance) {
      best = id;
      bestDistance = d;
    }
  }
  return best;
}
