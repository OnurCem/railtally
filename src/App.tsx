import { useGame } from "./store/gameStore";
import { EndGame } from "./ui/screens/EndGame";
import { Home } from "./ui/screens/Home";
import { MapScreen } from "./ui/screens/MapScreen";
import { NewGame } from "./ui/screens/NewGame";

export function App() {
  const screen = useGame((s) => s.screen);
  switch (screen) {
    case "new":
      return <NewGame />;
    case "game":
      return <MapScreen />;
    case "summary":
      return <EndGame />;
    default:
      return <Home />;
  }
}
