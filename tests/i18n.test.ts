import type { RejectCode } from "../src/sync/protocol";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/en.json";
import tr from "../src/i18n/tr.json";
import { detectLanguage } from "../src/i18n";
import type { RuleCode } from "../src/game/rules";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("translations", () => {
  it("English and Turkish have exactly the same keys", () => {
    expect(keys(tr).sort()).toEqual(keys(en).sort());
  });
  it("has no empty strings", () => {
    for (const k of [...keys(en), ...keys(tr)]) expect(k).not.toBe("");
    const flat = (o: Record<string, unknown>): string[] =>
      Object.values(o).flatMap((v) => (typeof v === "object" ? flat(v as Record<string, unknown>) : [String(v)]));
    for (const text of [...flat(en), ...flat(tr)]) expect(text.trim().length).toBeGreaterThan(0);
  });
  it("translates every rule error code", () => {
    const codes: (RuleCode | RejectCode)[] = [
      "gameEnded", "unknownRoute", "unknownCity", "unknownPlayer", "unknownTicket", "ticketHeld", "ticketMissing", "routeTaken", "routeNotClaimed", "noTrains",
      "twinOwn", "twinBlocked", "stationTaken", "stationMissing", "noStations", "colorTaken", "tooManyPlayers",
      "tooManyMe", "invalidPlayerCount", "invalidPoints", "gameExists", "noGame",
      "private", "unknownAction", "setupLocked", "malformed", "roomFull", "tooBig", "rateLimited",
    ];
    for (const code of codes) {
      expect(en.errors).toHaveProperty(code);
      expect(tr.errors).toHaveProperty(code);
    }
    expect(Object.keys(en.errors)).toHaveLength(codes.length);
  });
  it("detects the phone language", () => {
    expect(detectLanguage(["tr-TR", "en-US"])).toBe("tr");
    expect(detectLanguage(["de-DE", "en-GB"])).toBe("en");
    expect(detectLanguage(["fr"])).toBe("en");
    expect(detectLanguage()).toBe("en");
  });
});
