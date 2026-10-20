import { cities } from "../../data/cities";
import { project } from "../../data/projection";
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
  cars: Car[];
}

export const cityPoints = new Map<string, Point>(cities.map((c) => [c.id, project(c)]));

function buildGeometry(route: Route): RouteGeometry {
  const a = cityPoints.get(route.from)!;
  const b = cityPoints.get(route.to)!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dist = Math.hypot(dx, dy);
  const ux = dx / dist;
  const uy = dy / dist;
  const side = route.doubleOf ? (route.id.endsWith("-a") ? 1 : -1) : 0;
  const ox = -uy * DOUBLE_OFFSET * side;
  const oy = ux * DOUBLE_OFFSET * side;

  const start: Point = [a[0] + ux * TRIM + ox, a[1] + uy * TRIM + oy];
  const end: Point = [b[0] - ux * TRIM + ox, b[1] - uy * TRIM + oy];
  const usable = dist - 2 * TRIM;
  const pitch = usable / route.length;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const cars: Car[] = Array.from({ length: route.length }, (_, i) => ({
    x: start[0] + ux * pitch * (i + 0.5),
    y: start[1] + uy * pitch * (i + 0.5),
    angle,
    length: pitch - CAR_GAP,
    locomotive: i < route.ferryLocomotives,
  }));
  return { route, start, end, cars };
}

export const geometries: RouteGeometry[] = routes.map(buildGeometry);

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
    .map((g) => ({ route: g.route, distance: distanceToSegment(p, g.start, g.end) }))
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
