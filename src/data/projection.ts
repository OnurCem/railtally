import type { City } from "./types";

const SCALE = 36;
const LAT_REF = 46;
const LON_MIN = -10.5;
const LAT_MAX = 60.5;
const LON_MAX = 43.5;
const LAT_MIN = 35.5;
const PAD = 40;
const KX = Math.cos((LAT_REF * Math.PI) / 180);

export const MAP_WIDTH = Math.round((LON_MAX - LON_MIN) * KX * SCALE + PAD * 2);
export const MAP_HEIGHT = Math.round((LAT_MAX - LAT_MIN) * SCALE + PAD * 2);

/** Manual nudges (in map units) where real geography leaves routes too short to draw. */
export const ADJUST: Record<string, [number, number]> = {
  amsterdam: [-20, -10],
  essen: [20, -15],
  frankfurt: [20, 20],
  london: [-20, -10],
  paris: [10, 15],
  wilno: [25, 30],
};

export function project(city: Pick<City, "id" | "lat" | "lon">): [number, number] {
  const [dx, dy] = ADJUST[city.id] ?? [0, 0];
  return [
    (city.lon - LON_MIN) * KX * SCALE + PAD + dx,
    (LAT_MAX - city.lat) * SCALE + PAD + dy,
  ];
}
