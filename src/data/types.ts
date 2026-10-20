export type CityId = string;

export interface City {
  id: CityId;
  name: string;
  lat: number;
  lon: number;
  labelOffset?: { dx: number; dy: number };
}

export type RouteColor =
  | "red" | "orange" | "yellow" | "green" | "blue"
  | "purple" | "white" | "black" | "gray";

export interface Route {
  id: string;
  from: CityId;
  to: CityId;
  length: 1 | 2 | 3 | 4 | 6 | 8;
  color: RouteColor;
  tunnel: boolean;
  ferryLocomotives: number;
  doubleOf?: string;
  path?: [number, number][];
}

export interface Ticket {
  id: string;
  from: CityId;
  to: CityId;
  points: number;
  long: boolean;
}
