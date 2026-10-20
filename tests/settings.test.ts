import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings, loadSettings } from "../src/store/settingsStore";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("settings storage", () => {
  it("falls back to defaults without storage", () => {
    expect(loadSettings()).toEqual(defaultSettings);
  });

  it("reads the new key", () => {
    vi.stubGlobal("localStorage", fakeStorage({ "railtally:settings": JSON.stringify({ language: "tr" }) }));
    expect(loadSettings()).toEqual({ ...defaultSettings, language: "tr" });
  });

  it("moves settings saved under the old app name to the new key", () => {
    const storage = fakeStorage({ "rotaray:settings": JSON.stringify({ theme: "dark", colorBlind: true }) });
    vi.stubGlobal("localStorage", storage);
    expect(loadSettings()).toEqual({ ...defaultSettings, theme: "dark", colorBlind: true });
    expect(storage.data.has("rotaray:settings")).toBe(false);
    expect(JSON.parse(storage.data.get("railtally:settings")!)).toMatchObject({ theme: "dark" });
  });
});
