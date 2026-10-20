import { useEffect, useState } from "react";
import { useGame } from "./store/gameStore";
import { DataCheck } from "./ui/screens/DataCheck";
import { EndGame } from "./ui/screens/EndGame";
import { Home } from "./ui/screens/Home";
import { MapScreen } from "./ui/screens/MapScreen";
import { NewGame } from "./ui/screens/NewGame";

const isDataHash = () => window.location.hash === "#data";

export function App() {
  const screen = useGame((s) => s.screen);
  const [dataCheck, setDataCheck] = useState(isDataHash);
  useEffect(() => {
    const onHash = () => setDataCheck(isDataHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (dataCheck) return <DataCheck onBack={() => {
          window.history.replaceState(null, "", window.location.pathname);
          setDataCheck(false);
        }} />;
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
