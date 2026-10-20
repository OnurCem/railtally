import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import tr from "./tr.json";

export type Language = "en" | "tr";
export const LANGUAGES: Language[] = ["en", "tr"];

export function detectLanguage(preferred: readonly string[] = []): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "tr" || base === "en") return base;
  }
  return "en";
}

export function initI18n(language: Language) {
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, tr: { translation: tr } },
    lng: language,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return i18n;
}

export { i18n };
