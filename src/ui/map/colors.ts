import type { RouteColor } from "../../data/types";
import type { PlayerColor } from "../../game/actions";

export const ROUTE_FILL: Record<RouteColor, string> = {
  red: "#d64545",
  orange: "#e8872f",
  yellow: "#f2cc3b",
  green: "#4aa564",
  blue: "#3f7fd1",
  purple: "#8a5cc2",
  white: "#f4f1ea",
  black: "#2b2b33",
  gray: "#a9b0b8",
};

export const PLAYER_FILL: Record<PlayerColor, string> = {
  red: "#e0302f",
  blue: "#2a6fe0",
  green: "#1f9d55",
  yellow: "#f5c400",
  black: "#1c1c22",
};

/** Letter shown next to colors for color-blind players. */
export const COLOR_LETTER: Record<RouteColor, string> = {
  red: "R",
  orange: "O",
  yellow: "Y",
  green: "G",
  blue: "B",
  purple: "P",
  white: "W",
  black: "K",
  gray: "–",
};

/** Pattern per color: id suffix and stroke color that contrasts with the fill. */
export const PATTERN_STROKE: Record<RouteColor, string> = {
  red: "#ffffff",
  orange: "#3a2200",
  yellow: "#4a3a00",
  green: "#ffffff",
  blue: "#ffffff",
  purple: "#ffffff",
  white: "#555555",
  black: "#ffffff",
  gray: "none",
};
