import { memo } from "react";
import { cities } from "../../data/cities";
import { MAP_HEIGHT, MAP_WIDTH } from "../../data/projection";
import type { GameState } from "../../game/state";
import { PLAYER_FILL, ROUTE_FILL } from "./colors";
import { CAR_WIDTH, cityPoints, geometries, NODE_RADIUS } from "./geometry";
import { labels } from "./labels";
import { patternId, Patterns } from "./Patterns";

const INK = "#10202b";

interface Props {
  state: GameState;
  colorBlind: boolean;
  selectedRouteId: string | null;
  /** routes highlighted briefly after a tap */
  flashRouteIds: string[];
  /** draw the owner's initial on claimed routes (high zoom) */
  showMarks: boolean;
  cityLabels: Map<string, string>;
}

/** One character that tells the players apart: the first letter of the name, otherwise the seat number. */
const markFor = (player: { name: string }, index: number) => (player.name.trim() ? [...player.name.trim()][0].toUpperCase() : String(index + 1));

export const MapContent = memo(function MapContent({ state, colorBlind, selectedRouteId, flashRouteIds, showMarks, cityLabels }: Props) {
  const playerById = new Map(state.players.map((p) => [p.id, p]));
  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="Map of Europe"
      style={{ display: "block" }}
    >
      <Patterns />
      <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="map-bg" />

      {selectedRouteId &&
        geometries
          .filter((g) => g.route.id === selectedRouteId)
          .map((g) => (
            <polyline
              key="sel"
              points={g.points.map((p) => p.join(",")).join(" ")}
              fill="none"
              className="map-selected"
              strokeWidth={CAR_WIDTH + 12}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

      {flashRouteIds.length > 0 &&
        geometries
          .filter((g) => flashRouteIds.includes(g.route.id) && g.route.id !== selectedRouteId)
          .map((g) => (
            <polyline
              key={g.route.id}
              points={g.points.map((p) => p.join(",")).join(" ")}
              fill="none"
              className="map-flash"
              strokeWidth={CAR_WIDTH + 12}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

      {geometries.map(({ route, cars }) => {
        const owner = playerById.get(state.claims[route.id]);
        const fill = owner ? PLAYER_FILL[owner.color] : ROUTE_FILL[route.color];
        const pattern = owner ? owner.color : route.color;
        return (
          <g key={route.id} data-route={route.id} className={owner ? "route claimed" : "route"}>
            {cars.map((car, i) => (
              <g key={i} transform={`translate(${car.x} ${car.y}) rotate(${car.angle})`}>
                <rect
                  x={-car.length / 2}
                  y={-CAR_WIDTH / 2}
                  width={car.length}
                  height={CAR_WIDTH}
                  rx={2.5}
                  fill={fill}
                  stroke={owner ? "#ffffff" : INK}
                  strokeWidth={owner ? 2 : 1.2}
                  strokeDasharray={route.tunnel ? "4 2.5" : undefined}
                />
                {colorBlind && pattern !== "gray" && (
                  <rect
                    x={-car.length / 2}
                    y={-CAR_WIDTH / 2}
                    width={car.length}
                    height={CAR_WIDTH}
                    rx={2.5}
                    fill={`url(#${patternId(pattern)})`}
                  />
                )}
                {showMarks && owner && (
                  <text
                    className="owner-mark"
                    data-testid="owner-mark"
                    transform={Math.abs(car.angle) > 90 ? "rotate(180)" : undefined}
                    fill={owner.color === "yellow" ? INK : "#ffffff"}
                  >
                    {markFor(owner, state.players.indexOf(owner))}
                  </text>
                )}
                {car.locomotive && !owner && (
                  <circle r={3.6} fill={INK} stroke="#ffffff" strokeWidth={1.2} />
                )}
              </g>
            ))}
          </g>
        );
      })}

      {cities.map((city) => {
        const [x, y] = cityPoints.get(city.id)!;
        const station = playerById.get(state.stations[city.id]);
        return (
          <g key={city.id} data-city={city.id}>
            <circle
              cx={x}
              cy={y}
              r={station ? NODE_RADIUS - 1 : NODE_RADIUS - 4}
              fill={station ? PLAYER_FILL[station.color] : "#ffffff"}
              stroke={station ? "#ffffff" : INK}
              strokeWidth={station ? 3 : 2.5}
            />
            {station && <path d={`M${x - 5} ${y + 3} L${x} ${y - 5} L${x + 5} ${y + 3} Z`} fill="#ffffff" />}
            <text x={labels.get(city.id)!.x} y={labels.get(city.id)!.y} textAnchor={labels.get(city.id)!.anchor} className="map-label">
              {cityLabels.get(city.id) ?? city.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
});
