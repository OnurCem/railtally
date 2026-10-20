import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initI18n } from "./i18n";
import { applySettings, loadSettings, resolveLanguage } from "./store/settingsStore";
import "./index.css";

const settings = loadSettings();
initI18n(resolveLanguage(settings));
applySettings(settings);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
