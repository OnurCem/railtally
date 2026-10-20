import { cities } from "./cities";
import { routes } from "./routes";
import type { City, Route } from "./types";

export const cityById = new Map<string, City>(cities.map((c) => [c.id, c]));
export const routeById = new Map<string, Route>(routes.map((r) => [r.id, r]));
