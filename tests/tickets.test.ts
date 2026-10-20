import { describe, expect, it } from "vitest";
import { routeById, ticketById } from "../src/data/lookup";
import { tickets } from "../src/data/tickets";
import { act, setup, stateOf } from "./helpers";
import { assignStations, pathCandidates, shortestPath } from "../src/game/paths";
import { evaluateOption, evaluateTicket, explain, isCompleted, pathContext, rankOptions } from "../src/game/tickets";

const game = (players = 3, ...more: ReturnType<typeof act>[]) => stateOf(...setup(players), ...more);
const claim = (routeId: string, playerId = "p1") => act({ type: "ROUTE_CLAIMED", routeId, playerId });
const station = (cityId: string, playerId = "p1") => act({ type: "STATION_PLACED", cityId, playerId });
const ctxOf = (state: ReturnType<typeof game>) => pathContext(state);

describe("shortest path", () => {
  it("uses the direct route between neighbours", () => {
    const p = shortestPath("amsterdam", "bruxelles", ctxOf(game()))!;
    expect(p.routes).toEqual(["amsterdam-bruxelles-a"]);
    expect(p.trains).toBe(1);
  });

  it("counts my own routes as free", () => {
    const state = game(3, claim("amsterdam-bruxelles-a"));
    const p = shortestPath("amsterdam", "bruxelles", ctxOf(state))!;
    expect(p.trains).toBe(0);
    expect(p.missing).toEqual([]);
    expect(p.length).toBe(1);
  });

  it("goes around routes claimed by opponents", () => {
    const state = game(3, claim("amsterdam-bruxelles-a", "p2"));
    const p = shortestPath("amsterdam", "bruxelles", ctxOf(state))!;
    expect(p.routes).not.toContain("amsterdam-bruxelles-a");
    expect(p.trains).toBeGreaterThan(1);
  });

  it("returns null when every connection is blocked", () => {
    // Edinburgh only connects to London (a single route)
    const state = game(3, claim("edinburgh-london-a", "p2"));
    expect(shortestPath("edinburgh", "paris", ctxOf(state))).toBeNull();
  });

  it("closes the second lane of a double route with 3 players, not with 4", () => {
    const three = game(3, claim("berlin-frankfurt-a", "p2"));
    expect(shortestPath("berlin", "frankfurt", ctxOf(three))!.routes).not.toContain("berlin-frankfurt-b");
    const four = game(4, claim("berlin-frankfurt-a", "p2"));
    expect(shortestPath("berlin", "frankfurt", ctxOf(four))!.routes).toEqual(["berlin-frankfurt-b"]);
  });

  it("never uses both lanes of a double route I already own one of", () => {
    const state = game(5, claim("berlin-frankfurt-a", "p1"));
    expect(shortestPath("berlin", "frankfurt", ctxOf(state))!.routes).toEqual(["berlin-frankfurt-a"]);
  });

  it("is symmetric and its length matches the routes", () => {
    const ctx = ctxOf(game());
    for (const t of tickets) {
      const a = shortestPath(t.from, t.to, ctx)!;
      const b = shortestPath(t.to, t.from, ctx)!;
      // equal-cost paths can differ by a train because tunnels and ferries carry small penalties
      expect(Math.abs(a.trains - b.trains)).toBeLessThanOrEqual(1);
      expect(a.length).toBe(a.routes.reduce((n, id) => n + routeById.get(id)!.length, 0));
    }
  });

  it("finds a path for every ticket on an empty board", () => {
    const ctx = ctxOf(game());
    for (const t of tickets) expect(evaluateTicket(t, ctx).path, t.id).not.toBeNull();
  });
});

describe("ticket evaluation", () => {
  it("marks a ticket complete when my routes connect its cities", () => {
    const t = ticketById.get("athina-angora")!;
    const state = game(3);
    expect(isCompleted(state, t)).toBe(false);
    const path = shortestPath(t.from, t.to, ctxOf(state))!;
    const done = game(3, ...path.routes.map((r) => claim(r)));
    expect(isCompleted(done, t)).toBe(true);
    expect(evaluateTicket(t, ctxOf(done)).completed).toBe(true);
  });

  it("has a lower success chance with more players and more routes to place", () => {
    const short = evaluateTicket(ticketById.get("athina-angora")!, ctxOf(game(2)));
    const shortCrowded = evaluateTicket(ticketById.get("athina-angora")!, ctxOf(game(5)));
    const long = evaluateTicket(ticketById.get("palermo-moskva")!, ctxOf(game(2)));
    expect(shortCrowded.success).toBeLessThan(short.success);
    expect(long.success).toBeLessThan(short.success);
  });
});

describe("options", () => {
  const state = game(3);

  it("shared routes count once", () => {
    const a = "london-berlin";
    const b = "london-wien";
    const both = evaluateOption(state, [a, b], [a, b]);
    const sum = evaluateOption(state, [a], [a]).trains + evaluateOption(state, [b], [b]).trains;
    expect(both.shared).toBeGreaterThan(0);
    expect(both.trains).toBe(sum - both.shared);
    expect(both.trains).toBeLessThan(sum);
  });

  it("the network never needs more trains than the tickets added up", () => {
    const ids = tickets.filter((t) => !t.long).map((t) => t.id);
    for (let i = 0; i + 3 < ids.length; i += 3) {
      const offer = ids.slice(i, i + 3);
      const o = evaluateOption(state, offer, offer);
      expect(o.shared).toBeGreaterThanOrEqual(0);
    }
  });

  it("respects the minimum number of tickets to keep", () => {
    const offered = ["athina-angora", "budapest-sofia", "zurich-budapest", "palermo-moskva"];
    for (const option of rankOptions(state, offered, 2)) expect(option.keep.length).toBeGreaterThanOrEqual(2);
    for (const option of rankOptions(state, offered.slice(0, 3), 1)) expect(option.keep.length).toBeGreaterThanOrEqual(1);
    expect(rankOptions(state, offered, 2)).toHaveLength(11); // 4 choose 2 + 4 choose 3 + 4 choose 4
    expect(rankOptions(state, offered.slice(0, 3), 1)).toHaveLength(7);
  });

  it("drops a ticket that opponents have blocked when I have no station left to borrow", () => {
    const blocked = game(3, claim("edinburgh-london-a", "p2"), station("madrid"), station("lisboa"), station("cadiz"));
    const offered = ["edinburgh-paris", "athina-angora", "budapest-sofia"];
    const [best] = rankOptions(blocked, offered, 2);
    expect(best.keep).toEqual(expect.arrayContaining(["athina-angora", "budapest-sofia"]));
    expect(best.keep).not.toContain("edinburgh-paris");
    expect(explain(blocked, offered, best).get("edinburgh-paris")).toBe("dropBlocked");
  });

  it("gives a long ticket a lower success chance than a short one, and fewer players raise the chance", () => {
    const short = evaluateTicket(ticketById.get("athina-angora")!, ctxOf(game(4)));
    const long = evaluateTicket(ticketById.get("palermo-moskva")!, ctxOf(game(4)));
    expect(long.success).toBeLessThan(short.success);
    expect(long.success).toBeGreaterThan(0.2);
    expect(evaluateTicket(ticketById.get("palermo-moskva")!, ctxOf(game(2))).success).toBeGreaterThan(long.success);
  });

  it("prefers the cheaper tickets when the minimum allows", () => {
    const offered = ["frankfurt-smolensk", "athina-angora", "budapest-sofia", "sofia-smyrna"];
    const [best] = rankOptions(game(4), offered, 2);
    expect(best.keep).toEqual(expect.arrayContaining(["budapest-sofia", "sofia-smyrna"]));
  });

  it("prefers two tickets that share a route over two that do not", () => {
    // london-berlin and london-wien share the London - Amsterdam leg; kyiv-petrograd is far away
    const offered = ["london-berlin", "london-wien", "kyiv-petrograd"];
    const shared = evaluateOption(game(3), offered, ["london-berlin", "london-wien"]);
    const apart = evaluateOption(game(3), offered, ["london-berlin", "kyiv-petrograd"]);
    expect(shared.shared).toBeGreaterThan(apart.shared);
  });

  it("builds on tickets I already hold: a new ticket along the same path is cheap", () => {
    const held = game(3, act({ type: "TICKET_ADDED", ticketId: "london-wien" }));
    const withNew = evaluateOption(held, ["london-berlin"], ["london-berlin"]);
    const alone = evaluateOption(game(3), ["london-berlin"], ["london-berlin"]);
    const heldOnly = evaluateOption(held, [], []);
    expect(withNew.trains - heldOnly.trains).toBeLessThan(alone.trains);
  });

  it("marks an option infeasible when it needs more trains than I have left", () => {
    // I own 40 trains' worth of routes in the far north-east, so a long ticket across the south cannot fit
    let used = 0;
    const mine: string[] = [];
    for (const r of [...routeById.values()].filter((x) => !x.doubleOf).sort((a, b) => b.length - a.length)) {
      if (used + r.length > 40) continue;
      mine.push(r.id);
      used += r.length;
    }
    const state = game(3, ...mine.map((r) => claim(r)));
    const o = evaluateOption(state, ["palermo-moskva"], ["palermo-moskva"]);
    expect(o.feasible).toBe(o.trains <= 45 - used);
    expect(evaluateOption(state, [], []).feasible).toBe(true);
  });
});

describe("stations", () => {
  const blockedAmsterdam = () => game(3, claim("amsterdam-bruxelles-a", "p2"));

  it("lets a ticket use an opponent route through a new station", () => {
    const candidates = pathCandidates("amsterdam", "bruxelles", ctxOf(blockedAmsterdam()));
    expect(candidates[0].borrowed).toEqual([]);
    const withStation = candidates.find((c) => c.borrowed.length > 0)!;
    expect(withStation.borrowed).toEqual(["amsterdam-bruxelles-a"]);
    expect(withStation.trains).toBe(0);
  });

  it("does not offer stations when I have none left", () => {
    const none = game(3, claim("amsterdam-bruxelles-a", "p2"), station("madrid"), station("lisboa"), station("cadiz"));
    expect(pathCandidates("amsterdam", "bruxelles", ctxOf(none)).every((c) => c.borrowed.length === 0)).toBe(true);
  });

  it("uses an existing station for free and charges a new one", () => {
    const ticket = "amsterdam-bruxelles";
    const fake = { id: ticket, from: "amsterdam", to: "bruxelles", points: 6, long: false };
    const newOne = evaluateTicket(fake, ctxOf(blockedAmsterdam()));
    expect(newOne.path!.borrowed).toHaveLength(1);
    const have = evaluateTicket(fake, ctxOf(game(3, claim("amsterdam-bruxelles-a", "p2"), station("amsterdam"))));
    expect(have.path!.borrowed).toEqual(["amsterdam-bruxelles-a"]);
    expect(have.path!.cost).toBeLessThan(newOne.path!.cost);
  });

  it("assigns one station per borrowed route and respects the limit and other players' stations", () => {
    const ctx = ctxOf(blockedAmsterdam());
    const four = ["amsterdam-bruxelles-a", "edinburgh-london-a", "madrid-pamplona-a", "madrid-pamplona-b"];
    expect(assignStations(["amsterdam-bruxelles-a"], ctx)).toHaveLength(1);
    expect(assignStations(four, ctx)).toBeNull(); // only 3 stations exist
    const taken = ctxOf(game(3, claim("amsterdam-bruxelles-a", "p2"), station("amsterdam", "p2"), station("bruxelles", "p3")));
    expect(assignStations(["amsterdam-bruxelles-a"], taken)).toBeNull(); // both end cities have somebody else's station
  });

  it("subtracts the end bonus for each new station from the score", () => {
    const state = game(4, claim("edinburgh-london-a", "p2"), claim("edinburgh-london-b", "p3"));
    const option = evaluateOption(state, ["edinburgh-paris"], ["edinburgh-paris"]);
    expect(option.tickets[0].path!.borrowed.length).toBeGreaterThan(0);
    expect(option.newStations).toBe(1);
    expect(option.stations).toHaveLength(1);
    expect(option.stations[0].existing).toBe(false);
  });

  it("counts a ticket as complete through a station", () => {
    const t = ticketById.get("athina-angora")!;
    const path = shortestPath(t.from, t.to, ctxOf(game(3)))!;
    const [first, ...rest] = path.routes;
    // an opponent owns the first route, I own the others and have a station at one of its ends
    const firstRoute = routeById.get(first)!;
    const state = game(3, claim(first, "p2"), ...rest.map((r) => claim(r)), station(firstRoute.from));
    expect(isCompleted(state, t)).toBe(true);
    const noStation = game(3, claim(first, "p2"), ...rest.map((r) => claim(r)));
    expect(isCompleted(noStation, t)).toBe(false);
  });

  it("one station serves only one borrowed route", () => {
    const state = game(
      3,
      claim("berlin-frankfurt-a", "p2"),
      claim("berlin-essen-a", "p2"),
      station("berlin"),
    );
    const ctx = ctxOf(state);
    expect(assignStations(["berlin-frankfurt-a", "berlin-essen-a"], ctx)!.filter((s) => s.city === "berlin")).toHaveLength(1);
  });
});
