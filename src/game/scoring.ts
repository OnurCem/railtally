
export const ROUTE_POINTS: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 6: 15, 8: 21 };

export function routePoints(length: number): number {
  const points = ROUTE_POINTS[length];
  if (points === undefined) throw new Error(`Invalid route length: ${length}`);
  return points;
}

/** Longest continuous trail (no route used twice, cities may repeat), in train cars. */
export function longestTrail(routes: { from: string; to: string; length: number }[]): number {
  const adjacency = new Map<string, { edge: number; to: string }[]>();
  routes.forEach((r, edge) => {
    if (!adjacency.has(r.from)) adjacency.set(r.from, []);
    if (!adjacency.has(r.to)) adjacency.set(r.to, []);
    adjacency.get(r.from)!.push({ edge, to: r.to });
    adjacency.get(r.to)!.push({ edge, to: r.from });
  });

  let best = 0;
  const visit = (city: string, used: Set<number>, total: number) => {
    if (total > best) best = total;
    for (const { edge, to } of adjacency.get(city) ?? []) {
      if (used.has(edge)) continue;
      used.add(edge);
      visit(to, used, total + routes[edge].length);
      used.delete(edge);
    }
  };
  for (const city of adjacency.keys()) visit(city, new Set(), 0);
  return best;
}
