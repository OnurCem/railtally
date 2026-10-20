import { useTranslation } from "react-i18next";
import { useSettings, type Settings } from "../../store/settingsStore";
import { Sheet } from "./Sheet";

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const { update } = settings;

  return (
    <Sheet title={t("settings.title")} onClose={onClose} testId="settings-sheet">
      <label className="field">
        <span>{t("settings.language")}</span>
        <select value={settings.language} onChange={(e) => update({ language: e.target.value as Settings["language"] })}>
          <option value="auto">{t("settings.languageAuto")}</option>
          <option value="en">English</option>
          <option value="tr">Türkçe</option>
        </select>
      </label>
      <label className="field">
        <span>{t("settings.theme")}</span>
        <select value={settings.theme} onChange={(e) => update({ theme: e.target.value as Settings["theme"] })}>
          <option value="auto">{t("settings.themeAuto")}</option>
          <option value="light">{t("settings.themeLight")}</option>
          <option value="dark">{t("settings.themeDark")}</option>
        </select>
      </label>
      <label className="field check">
        <input type="checkbox" checked={settings.largeText} onChange={(e) => update({ largeText: e.target.checked })} />
        <span>{t("settings.largeText")}</span>
      </label>
      <label className="field check">
        <input type="checkbox" checked={settings.colorBlind} onChange={(e) => update({ colorBlind: e.target.checked })} />
        <span>{t("settings.colorBlind")}</span>
      </label>
      <a className="button" href="#data" onClick={onClose} data-testid="open-data-check">
        {t("dataCheck.open")}
      </a>
    </Sheet>
  );
}
