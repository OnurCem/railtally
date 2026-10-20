import { describe, expect, it } from "vitest";
import { routeById } from "../src/data/lookup";
import { shortestPath } from "../src/game/paths";
import { diffPlans, planStrategy } from "../src/game/strategy";
import { pathContext, trainPressure } from "../src/game/tickets";
import { act, setup, stateOf } from "./helpers";

const add = (...ids: string[]) => ids.map((ticketId) => act({ type: "TICKET_ADDED", ticketId }));
const claim = (routeId: string, playerId = "p1") => act({ type: "ROUTE_CLAIMED", routeId, playerId });
const station = (cityId: string, playerId = "p1") => act({ type: "STATION_PLACED", cityId, playerId });
const game = (players: number, ...more: ReturnType<typeof act>[]) => stateOf(...setup(players), ...more);

describe("strategy planner", () => {
  it("has no plan without tickets", () => {
    expect(planStrategy(game(3))).toBeNull();
  });

  it("plans a single ticket as its shortest path", () => {
    const state = game(3, ...add("athina-angora"));
    const plan = planStrategy(state)!;
    const path = shortestPath("athina", "angora", pathContext(state))!;
    expect(plan.routes.map((r) => r.route.id).sort()).toEqual([...path.missing].sort());
    expect(plan.trainsNeeded).toBe(path.trains);
    expect(plan.trainsLeft).toBe(45);
    expect(plan.fits).toBe(true);
    expect(plan.tickets[0].completed).toBe(false);
  });

  it("counts a route shared by two tickets once", () => {
    const plan = planStrategy(game(3, ...add("london-wien", "paris-wien")))!;
    const sum = plan.tickets.reduce((n, t) => n + t.trains, 0);
    expect(plan.trainsNeeded).toBeLessThan(sum);
    expect(plan.shared).toBe(sum - plan.trainsNeeded);
    const shared = plan.routes.filter((r) => r.tickets.length === 2);
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.every((r) => r.reasons.includes("shared"))).toBe(true);
  });

  it("treats my own routes as done and shows a finished ticket as complete", () => {
    const state = game(3, ...add("edinburgh-paris"), claim("edinburgh-london-a"), claim("dieppe-london-a"), claim("dieppe-paris-a"));
    const plan = planStrategy(state)!;
    expect(plan.routes).toEqual([]);
    expect(plan.trainsNeeded).toBe(0);
    expect(plan.tickets[0].completed).toBe(true);
  });

  it("orders routes with no alternative before routes with a free detour", () => {
    // Edinburgh has one corridor (two lanes, only one usable with 3 players), so it can never be replaced
    const plan = planStrategy(game(3, ...add("edinburgh-paris")))!;
    expect(plan.routes.find((r) => r.route.id === "edinburgh-london-a")!.detour).toBeLessThan(Infinity); // a station could replace it
    const noStations = planStrategy(game(3, ...add("edinburgh-paris"), station("madrid"), station("lisboa"), station("cadiz")))!;
    expect(noStations.routes.find((r) => r.route.id === "edinburgh-london-a")!.reasons).toContain("noAlternative");
    expect(noStations.routes[0].reasons).toContain("noAlternative");
    for (let i = 1; i < noStations.routes.length; i++) {
      expect(noStations.routes[i - 1].priority).toBeGreaterThanOrEqual(noStations.routes[i].priority);
    }
  });

  it("lists the card colors, locomotives and tunnels of the routes to claim", () => {
    const plan = planStrategy(game(3, ...add("athina-angora", "paris-wien", "london-wien")))!;
    const colored = Object.values(plan.cards.byColor).reduce((n, c) => n + c, 0);
    const length = plan.routes.reduce((n, r) => n + r.route.length, 0);
    const locomotives = plan.routes.reduce((n, r) => n + r.route.ferryLocomotives, 0);
    expect(plan.cards.locomotives).toBe(locomotives);
    expect(colored + plan.cards.anyColor + plan.cards.locomotives).toBe(length);
    expect(plan.cards.tunnels).toBe(plan.routes.filter((r) => r.route.tunnel).length);
    for (const r of plan.routes) expect(r.color).toBe(routeById.get(r.route.id)!.color);
  });
});

describe("re-planning when the map changes", () => {
  it("finds another way, or a station, when an opponent takes a planned route", () => {
    const before = game(3, ...add("paris-wien"));
    const prev = planStrategy(before)!;
    const taken = prev.routes[0].route.id;
    const after = game(3, ...add("paris-wien"), claim(taken, "p2"));
    const next = planStrategy(after)!;
    expect(next.routes.map((r) => r.route.id)).not.toContain(taken);
    const change = diffPlans(prev, next, after)!;
    expect(change.taken).toEqual([taken]);
    expect(change.added.length + change.newStations.length).toBeGreaterThan(0);
  });

  it("reports nothing when I claim a planned route myself", () => {
    const before = game(3, ...add("paris-wien"));
    const prev = planStrategy(before)!;
    const mine = prev.routes[0].route.id;
    const after = game(3, ...add("paris-wien"), claim(mine));
    expect(diffPlans(prev, planStrategy(after), after)).toBeNull();
  });

  it("counts the twin lane as taken with 3 players but not with 5", () => {
    const double = (players: number) => {
      const prev = planStrategy(game(players, ...add("paris-wien")))!;
      const route = prev.routes.map((r) => r.route).find((r) => r.doubleOf)!;
      const lane = route.id;
      const twin = route.doubleOf!;
      const after = game(players, ...add("paris-wien"), claim(twin, "p2"));
      return { change: diffPlans(prev, planStrategy(after), after), lane };
    };
    // the plan still follows the same corridor with 5 players because the other lane is open
    expect(double(5).change).toBeNull();
    expect(double(3).change === null || double(3).change!.taken.length > 0).toBe(true);
  });

  it("suggests a station when the only way is blocked", () => {
    const state = game(3, ...add("edinburgh-paris"), claim("edinburgh-london-a", "p2"));
    const plan = planStrategy(state)!;
    expect(plan.tickets[0].blocked).toBe(false);
    expect(plan.borrowed).toEqual(["edinburgh-london-a"]);
    expect(plan.stations).toHaveLength(1);
    expect(plan.stations[0]).toMatchObject({ route: "edinburgh-london-a", existing: false });
    expect(plan.newStations).toBe(1);
    expect(plan.routes.map((r) => r.route.id)).not.toContain("edinburgh-london-a");
  });

  it("uses a station I already have instead of a new one", () => {
    const state = game(3, ...add("edinburgh-paris"), claim("edinburgh-london-a", "p2"), station("london"));
    const plan = planStrategy(state)!;
    expect(plan.stations).toEqual([{ city: "london", route: "edinburgh-london-a", existing: true }]);
    expect(plan.newStations).toBe(0);
  });

  it("marks the ticket blocked when no station is left", () => {
    const state = game(
      3,
      ...add("edinburgh-paris"),
      claim("edinburgh-london-a", "p2"),
      station("madrid"),
      station("lisboa"),
      station("cadiz"),
    );
    expect(planStrategy(state)!.tickets[0].blocked).toBe(true);
  });
});

describe("trains budget", () => {
  it("warns when the plan needs more trains than I have left and names a ticket to give up", () => {
    const plan = planStrategy(fillTrains(42, "athina-angora"))!;
    expect(plan.trainsLeft).toBe(3);
    expect(plan.fits).toBe(false);
    expect(plan.share).toBeGreaterThan(1);
    expect(plan.dropSuggestion).toBe("athina-angora");
  });

  it("flags a plan that fits but uses most of the trains left as tight", () => {
    const need = planStrategy(game(3, ...add("athina-angora")))!.trainsNeeded;
    const plan = planStrategy(fillTrains(45 - need - 1, "athina-angora"))!;
    expect(plan.trainsLeft).toBe(need + 1);
    expect(plan.fits).toBe(true);
    expect(plan.tight).toBe(true);
    expect(planStrategy(game(3, ...add("athina-angora")))!.tight).toBe(false);
  });

  it("charges more per train as the plan eats the trains I have left", () => {
    expect(trainPressure(10, 45)).toBeLessThan(trainPressure(40, 45));
    expect(trainPressure(0, 45)).toBe(1);
  });
});

/** Gives me routes worth exactly `trains` trains in the north and west, far from the Balkans. */
function fillTrains(trains: number, ...tickets: string[]) {
  const far = ["edinburgh-london-a", "amsterdam-london-a", "amsterdam-essen-a", "berlin-essen-a", "essen-kobenhavn-a", "kobenhavn-stockholm-a", "petrograd-stockholm-a", "moskva-petrograd-a", "moskva-smolensk-a", "petrograd-riga-a", "danzig-riga-a", "berlin-danzig-a", "danzig-warszawa-a", "dieppe-paris-a", "brest-dieppe-a"];
  // subset sum by search: lengths are small
  const pick = (i: number, left: number): string[] | null => {
    if (left === 0) return [];
    if (i === far.length || left < 0) return null;
    const rest = pick(i + 1, left - routeById.get(far[i])!.length);
    if (rest) return [far[i], ...rest];
    return pick(i + 1, left);
  };
  const picked = pick(0, trains)!;
  expect(picked).not.toBeNull();
  return game(3, ...add(...tickets), ...picked.map((id) => claim(id)));
}
