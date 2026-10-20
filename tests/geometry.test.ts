import { describe, expect, it } from "vitest";
import { cities } from "../src/data/cities";
import { routes } from "../src/data/routes";
import { MAP_HEIGHT, MAP_WIDTH, project } from "../src/data/projection";
import { cityNear, cityPoints, geometries, routesNear } from "../src/ui/map/geometry";

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
    const mid: [number, number] = [(g.start[0] + g.end[0]) / 2, (g.start[1] + g.end[1]) / 2];
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
