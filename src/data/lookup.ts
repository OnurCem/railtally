import { cities } from "./cities";
import { routes } from "./routes";
import { tickets } from "./tickets";
import type { City, Route, Ticket } from "./types";

export const cityById = new Map<string, City>(cities.map((c) => [c.id, c]));
export const routeById = new Map<string, Route>(routes.map((r) => [r.id, r]));
export const ticketById = new Map<string, Ticket>(tickets.map((t) => [t.id, t]));
