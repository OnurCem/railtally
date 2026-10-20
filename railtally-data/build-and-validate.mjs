// Builds routes.json / tickets.json from the CSV transcriptions and checks them.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const csv = (f) => readFileSync(join(dir, f), "utf8").trim().split("\n").map((l) => l.split(","));
const cities = JSON.parse(readFileSync(join(dir, "cities.json"), "utf8"));
const cityIds = new Set(cities.map((c) => c.id));
const errors = [];

const routes = [];
const seen = {};
for (const [from, to, len, color, tunnel, ferry] of csv("routes.csv")) {
  const key = `${from}-${to}`;
  const n = (seen[key] = (seen[key] ?? 0) + 1);
  routes.push({ id: `${key}-${"abc"[n - 1]}`, from, to, length: +len, color, tunnel: tunnel === "t", ferryLocomotives: +ferry });
}
for (const r of routes) {
  const twin = routes.find((o) => o !== r && o.from === r.from && o.to === r.to);
  if (twin) r.doubleOf = twin.id;
}
const tickets = csv("tickets.csv").map(([from, to, pts, l]) => ({ id: `${from}-${to}`, from, to, points: +pts, long: l === "L" }));

// --- checks ---
for (const r of routes) {
  if (!cityIds.has(r.from) || !cityIds.has(r.to)) errors.push(`unknown city in ${r.id}`);
  if (![1, 2, 3, 4, 6, 8].includes(r.length)) errors.push(`bad length ${r.id}`);
}
for (const t of tickets) if (!cityIds.has(t.from) || !cityIds.has(t.to)) errors.push(`unknown city in ticket ${t.id}`);
for (const c of cities) if (!routes.some((r) => r.from === c.id || r.to === c.id)) errors.push(`city without route: ${c.id}`);

const adj = new Map(cities.map((c) => [c.id, []]));
for (const r of routes) { adj.get(r.from).push([r.to, r.length]); adj.get(r.to).push([r.from, r.length]); }
const reach = new Set(["paris"]); const stack = ["paris"];
while (stack.length) for (const [n] of adj.get(stack.pop())) if (!reach.has(n)) { reach.add(n); stack.push(n); }
if (reach.size !== cities.length) errors.push("graph is not connected");

const shortest = (a, b) => {
  const dist = new Map([[a, 0]]); const done = new Set();
  while (true) {
    let u = null;
    for (const [k, v] of dist) if (!done.has(k) && (u === null || v < dist.get(u))) u = k;
    if (u === null) return Infinity; if (u === b) return dist.get(u);
    done.add(u);
    for (const [n, w] of adj.get(u)) if (!dist.has(n) || dist.get(u) + w < dist.get(n)) dist.set(n, dist.get(u) + w);
  }
};

const sum = (a) => a.reduce((s, x) => s + x, 0);
const summary = {
  cities: cities.length,
  routes: routes.length,
  doubleRoutePairs: routes.filter((r) => r.doubleOf).length / 2,
  tunnels: routes.filter((r) => r.tunnel).length,
  ferries: routes.filter((r) => r.ferryLocomotives > 0).length,
  trainSpaces: sum(routes.map((r) => r.length)),
  byLength: Object.fromEntries([1, 2, 3, 4, 6, 8].map((l) => [l, routes.filter((r) => r.length === l).length])),
  byColor: Object.fromEntries([...new Set(routes.map((r) => r.color))].sort().map((c) => [c, routes.filter((r) => r.color === c).length])),
  tickets: tickets.filter((t) => !t.long).length,
  longTickets: tickets.filter((t) => t.long).length,
};
console.log(JSON.stringify(summary, null, 1));

console.log("\nTicket points vs shortest path (trains):");
const odd = [];
for (const t of tickets) {
  const d = shortest(t.from, t.to);
  if (Math.abs(d - t.points) > 2) odd.push(`${t.id}: ${t.points} pts, shortest ${d}`);
}
console.log(odd.length ? odd.join("\n") : "all within ±2");

if (errors.length) { console.error("\nERRORS:\n" + errors.join("\n")); process.exit(1); }
writeFileSync(join(dir, "routes.json"), JSON.stringify(routes, null, 2) + "\n");
writeFileSync(join(dir, "tickets.json"), JSON.stringify(tickets, null, 2) + "\n");
console.log("\nOK — wrote routes.json and tickets.json");
