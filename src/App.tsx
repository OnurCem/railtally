import { useEffect, useState } from "react";
import { useGame } from "./store/gameStore";
import { closeDataCheck, useHistory } from "./ui/hooks/useHistory";
import { DataCheck } from "./ui/screens/DataCheck";
import { EndGame } from "./ui/screens/EndGame";
import { Home } from "./ui/screens/Home";
import { MapScreen } from "./ui/screens/MapScreen";
import { JoinGame, joinCodeFromHash } from "./ui/screens/JoinGame";
import { NewGame } from "./ui/screens/NewGame";

const isDataHash = () => window.location.hash === "#data";

export function App() {
  const screen = useGame((s) => s.screen);
  const [dataCheck, setDataCheck] = useState(isDataHash);
  useHistory();
  useEffect(() => {
    // a shared link (…/#join=CODE) opens the join screen, which reads the code from the hash
    if (joinCodeFromHash()) useGame.getState().go("join");
  }, []);
  useEffect(() => {
    const onChange = () => setDataCheck(isDataHash());
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);

  if (dataCheck) return <DataCheck onBack={closeDataCheck} />;
  switch (screen) {
    case "new":
      return <NewGame />;
    case "join":
      return <JoinGame />;
    case "game":
      return <MapScreen />;
    case "summary":
      return <EndGame />;
    default:
      return <Home />;
  }
}
