import { cities } from "../../data/cities";
import { project } from "../../data/projection";
import { COMPASS, routeBulge } from "../../data/curves";
import { routes } from "../../data/routes";
import type { Route } from "../../data/types";

export type Point = [number, number];

export const NODE_RADIUS = 13;
const TRIM = NODE_RADIUS + 4;
const CAR_GAP = 3;
const DOUBLE_OFFSET = 6.5;

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

function buildGeometry(route: Route): RouteGeometry {
  const a = cityPoints.get(route.from)!;
  const b = cityPoints.get(route.to)!;
  const side = route.doubleOf ? (route.id.endsWith("-a") ? 1 : -1) : 0;
  const line = centreLine(a, b, bendFor(route, a, b), DOUBLE_OFFSET * side);

  const cumulative = [0];
  for (let i = 1; i < line.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  }
  const total = cumulative[cumulative.length - 1];
  const usable = total - 2 * TRIM;
  const pitch = usable / route.length;

  const cars: Car[] = Array.from({ length: route.length }, (_, i) => {
    const { point, angle } = along(line, cumulative, TRIM + pitch * (i + 0.5));
    return { x: point[0], y: point[1], angle, length: pitch - CAR_GAP, locomotive: i < route.ferryLocomotives };
  });
  const points = Array.from({ length: 17 }, (_, i) => along(line, cumulative, TRIM + (usable * i) / 16).point);
  return { route, start: points[0], end: points[points.length - 1], points, cars };
}

export const geometries: RouteGeometry[] = routes.map(buildGeometry);

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
