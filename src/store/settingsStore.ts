import { create } from "zustand";
import { detectLanguage, i18n, type Language } from "../i18n";

export interface Settings {
  language: "auto" | Language;
  theme: "auto" | "light" | "dark";
  largeText: boolean;
  colorBlind: boolean;
}

const STORAGE_KEY = "railtally:settings";
/** Key used before the app was renamed; its value is copied over once. */
const LEGACY_STORAGE_KEY = "rotaray:settings";
export const defaultSettings: Settings = { language: "auto", theme: "auto", largeText: false, colorBlind: false };

export function loadSettings(): Settings {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (raw) return { ...defaultSettings, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage can be unavailable (private mode) */
  }
  return defaultSettings;
}

function save(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export const resolveLanguage = (s: Settings): Language =>
  s.language === "auto" ? detectLanguage(navigator.languages ?? [navigator.language]) : s.language;

/** Pushes settings into the document and i18n. */
export function applySettings(s: Settings) {
  const root = document.documentElement;
  if (s.theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", s.theme);
  root.toggleAttribute("data-large-text", s.largeText);
  root.toggleAttribute("data-color-blind", s.colorBlind);
  const language = resolveLanguage(s);
  root.lang = language;
  if (i18n.language !== language) void i18n.changeLanguage(language);
}

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsStore>()((set, get) => ({
  ...loadSettings(),
  update: (patch) => {
    set(patch);
    const { language, theme, largeText, colorBlind } = get();
    const next = { language, theme, largeText, colorBlind };
    save(next);
    applySettings(next);
  },
}));
