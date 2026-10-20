import type { RouteColor } from "../../data/types";
import { PATTERN_STROKE } from "./colors";

export const patternId = (color: RouteColor) => `pat-${color}`;

const SHAPES: Record<Exclude<RouteColor, "gray">, (stroke: string) => React.ReactNode> = {
  red: (s) => <path d="M0 6 L6 0" stroke={s} strokeWidth="1.4" />,
  orange: (s) => <circle cx="3" cy="3" r="1.3" fill={s} />,
  yellow: (s) => <path d="M0 3 H6" stroke={s} strokeWidth="1.4" />,
  green: (s) => <path d="M3 0 V6" stroke={s} strokeWidth="1.4" />,
  blue: (s) => <path d="M0 0 L6 6" stroke={s} strokeWidth="1.4" />,
  purple: (s) => <path d="M0 3 H6 M3 0 V6" stroke={s} strokeWidth="1" />,
  white: (s) => <rect x="1" y="1" width="4" height="4" fill="none" stroke={s} strokeWidth="1" />,
  black: (s) => <circle cx="3" cy="3" r="0.9" fill={s} />,
};

/** SVG patterns that make every color distinguishable without relying on hue. */
export function Patterns() {
  return (
    <defs>
      {(Object.keys(SHAPES) as Exclude<RouteColor, "gray">[]).map((color) => (
        <pattern key={color} id={patternId(color)} width="6" height="6" patternUnits="userSpaceOnUse">
          {SHAPES[color](PATTERN_STROKE[color])}
        </pattern>
      ))}
    </defs>
  );
}
