/**
 * Curved routes, read from photos of the physical board. Routes not listed here are straight.
 *
 * Each entry says which way the middle of the route bulges away from the straight line between its two
 * cities (a compass direction, north is up on our map) and by how much, as a fraction of that straight
 * distance. Keys are `${from}-${to}` as in routes.json; both routes of a double pair share the entry.
 */
export type Compass = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

/** Unit vectors in screen coordinates (x east, y south). */
export const COMPASS: Record<Compass, [number, number]> = {
  N: [0, -1],
  NE: [Math.SQRT1_2, -Math.SQRT1_2],
  E: [1, 0],
  SE: [Math.SQRT1_2, Math.SQRT1_2],
  S: [0, 1],
  SW: [-Math.SQRT1_2, Math.SQRT1_2],
  W: [-1, 0],
  NW: [-Math.SQRT1_2, -Math.SQRT1_2],
};

export const routeBulge: Record<string, [Compass, number]> = {
  // Iberia and the Atlantic coast
  "cadiz-lisboa": ["W", 0.15],
  "cadiz-madrid": ["E", 0.4],
  "lisboa-madrid": ["NW", 0.3],
  "barcelona-marseille": ["NW", 0.1],
  "brest-pamplona": ["E", 0.05],
  "marseille-pamplona": ["N", 0.08],
  "marseille-roma": ["N", 0.3],
  "paris-zurich": ["SW", 0.1],
  // Benelux and Germany
  "amsterdam-essen": ["N", 0.3],
  "frankfurt-munchen": ["SW", 0.25],
  "munchen-wien": ["S", 0.2],
  "berlin-wien": ["W", 0.1],
  "berlin-warszawa": ["N", 0.08],
  "berlin-danzig": ["NW", 0.18],
  "warszawa-wien": ["SE", 0.15],
  // Scandinavia and the Baltic
  "kobenhavn-stockholm": ["NW", 0.14],
  "riga-wilno": ["W", 0.1],
  "warszawa-wilno": ["N", 0.14],
  "smolensk-wilno": ["N", 0.1],
  "smolensk-moskva": ["S", 0.15],
  "moskva-petrograd": ["NE", 0.15],
  // Eastern Europe
  "budapest-kyiv": ["NW", 0.05],
  "kyiv-smolensk": ["SE", 0.3],
  "kharkov-kyiv": ["S", 0.24],
  "kharkov-moskva": ["E", 0.19],
  "kharkov-rostov": ["NE", 0.25],
  "rostov-sevastopol": ["NW", 0.3],
  "bucuresti-sevastopol": ["N", 0.12],
  "constantinople-sevastopol": ["SE", 0.1],
  "erzurum-sevastopol": ["W", 0.15],
  // Balkans, Italy and Turkey
  "athina-brindisi": ["SW", 0.2],
  "sarajevo-zagrab": ["SW", 0.3],
  "sarajevo-sofia": ["N", 0.28],
  "brindisi-palermo": ["E", 0.12],
  "palermo-roma": ["E", 0.2],
  "palermo-smyrna": ["S", 0.19],
  "angora-smyrna": ["S", 0.1],
  "angora-erzurum": ["S", 0.3],
};
