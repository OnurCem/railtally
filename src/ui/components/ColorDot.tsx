import type { RouteColor } from "../../data/types";
import type { PlayerColor } from "../../game/actions";
import { COLOR_LETTER, PLAYER_FILL, ROUTE_FILL } from "../map/colors";

type Props =
  | { kind?: "player"; color: PlayerColor; size?: "s" | "m" }
  | { kind: "route"; color: RouteColor; size?: "s" | "m" };

/** A color swatch. With color-blind mode on, a letter is shown on top (see CSS). */
export function ColorDot(props: Props) {
  const { size = "m" } = props;
  const fill = props.kind === "route" ? ROUTE_FILL[props.color] : PLAYER_FILL[props.color];
  return <span className={`dot dot-${size}`} style={{ background: fill }} data-letter={COLOR_LETTER[props.color]} aria-hidden="true" />;
}
