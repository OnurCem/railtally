import { useState } from "react";
import { makeAction } from "./game/actions";
import { replay } from "./game/reducer";
import { MapView } from "./ui/map/MapView";

const demo = replay([
  makeAction({ type: "GAME_CREATED", gameId: "demo", playerCount: 4 }),
  makeAction({ type: "PLAYER_ADDED", playerId: "p1", name: "Me", color: "red", isMe: true }),
  makeAction({ type: "PLAYER_ADDED", playerId: "p2", name: "B", color: "blue", isMe: false }),
  makeAction({ type: "ROUTE_CLAIMED", routeId: "berlin-frankfurt-a", playerId: "p1" }),
  makeAction({ type: "ROUTE_CLAIMED", routeId: "berlin-frankfurt-b", playerId: "p2" }),
  makeAction({ type: "ROUTE_CLAIMED", routeId: "bruxelles-paris-a", playerId: "p2" }),
  makeAction({ type: "STATION_PLACED", cityId: "wien", playerId: "p1" }),
]);

export function App() {
  const [rotated, setRotated] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <button onClick={() => setRotated(!rotated)}>rotate</button>
      <span>{picked.join(", ")}</span>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MapView state={demo} rotated={rotated} colorBlind={false} selectedRouteId={picked[0] ?? null} resetSignal={0}
          onRoutesTap={setPicked} onCityLongPress={(c) => setPicked([c])} />
      </div>
    </div>
  );
}
