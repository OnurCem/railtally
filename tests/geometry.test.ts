import { describe, expect, it } from "vitest";
import { cities } from "../src/data/cities";
import { routes } from "../src/data/routes";
import { MAP_HEIGHT, MAP_WIDTH, project } from "../src/data/projection";
import { cityNear, cityPoints, distanceToPolyline, geometries, routesNear } from "../src/ui/map/geometry";
import { labels, routeSamplesUnder } from "../src/ui/map/labels";

describe("projection", () => {
  it("keeps every city inside the map", () => {
    for (const c of cities) {
      const [x, y] = project(c);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(MAP_WIDTH);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(MAP_HEIGHT);
    }
  });
});

describe("route geometry", () => {
  it("has one car per train space and room to draw each car", () => {
    expect(geometries).toHaveLength(routes.length);
    for (const g of geometries) {
      expect(g.cars).toHaveLength(g.route.length);
      for (const car of g.cars) expect(car.length, g.route.id).toBeGreaterThanOrEqual(14);
    }
  });
  it("marks ferry locomotive spaces", () => {
    for (const g of geometries) {
      expect(g.cars.filter((c) => c.locomotive)).toHaveLength(g.route.ferryLocomotives);
    }
  });
  it("hit-tests routes and cities", () => {
    const g = geometries.find((x) => x.route.id === "budapest-kyiv-a")!;
    const mid = g.points[8];
    expect(routesNear(mid, 5)[0].route.id).toBe("budapest-kyiv-a");
    expect(routesNear([-500, -500], 30)).toHaveLength(0);
    expect(cityNear(cityPoints.get("paris")!, 5)).toBe("paris");
    expect(cityNear([-500, -500], 30)).toBeNull();
  });
  it("separates the two routes of a double pair", () => {
    const [a, b] = ["berlin-frankfurt-a", "berlin-frankfurt-b"].map((id) => geometries.find((g) => g.route.id === id)!);
    expect(Math.hypot(a.start[0] - b.start[0], a.start[1] - b.start[1])).toBeGreaterThan(10);
  });
});

type P = [number, number];
const ccw = (a: P, b: P, c: P) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
const segmentsCross = (a: P, b: P, c: P, d: P) => ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
const linesCross = (p: P[], q: P[]) =>
  p.slice(1).some((_, i) => q.slice(1).some((_, j) => segmentsCross(p[i], p[i + 1], q[j], q[j + 1])));

describe("readability", () => {
  it("no two routes cross each other", () => {
    const crossing: string[] = [];
    for (let i = 0; i < geometries.length; i++) {
      for (let j = i + 1; j < geometries.length; j++) {
        if (linesCross(geometries[i].points, geometries[j].points)) {
          crossing.push(`${geometries[i].route.id} x ${geometries[j].route.id}`);
        }
      }
    }
    expect(crossing).toEqual([]);
  });

  it("no route runs through a city it does not connect", () => {
    for (const g of geometries) {
      for (const [id, p] of cityPoints) {
        if (id === g.route.from || id === g.route.to) continue;
        expect(distanceToPolyline(p, g.points), `${g.route.id} near ${id}`).toBeGreaterThan(24);
      }
    }
  });

  it("every city has a label inside the map", () => {
    expect(labels.size).toBe(cities.length);
    for (const l of labels.values()) {
      expect(l.box.x0).toBeGreaterThanOrEqual(0);
      expect(l.box.x1).toBeLessThanOrEqual(MAP_WIDTH);
      expect(l.box.y0).toBeGreaterThanOrEqual(0);
      expect(l.box.y1).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });

  it("labels do not overlap each other", () => {
    const all = [...labels.entries()];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [a, b] = [all[i][1].box, all[j][1].box];
        const overlap = a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
        expect(overlap, `${all[i][0]} / ${all[j][0]}`).toBe(false);
      }
    }
  });

  it("labels stay off the routes", () => {
    const bad = [...labels.entries()].filter(([, l]) => routeSamplesUnder(l) > 0).map(([id]) => id);
    expect(bad).toEqual([]);
  });
});
