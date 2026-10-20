import { entries, set } from "idb-keyval";
import type { Action } from "../game/actions";
import { replay } from "../game/reducer";
import { GAME_KEY_PREFIX, gameKey } from "../sync/LocalAdapter";

interface BackupFile {
  app: "rotaray";
  version: 1;
  exportedAt: number;
  games: { gameId: string; actions: Action[] }[];
}

export async function exportAll(): Promise<string> {
  const all = await entries<string, Action[]>();
  const games = all
    .filter(([key]) => typeof key === "string" && key.startsWith(GAME_KEY_PREFIX))
    .map(([key, actions]) => ({ gameId: (key as string).slice(GAME_KEY_PREFIX.length), actions }));
  const file: BackupFile = { app: "rotaray", version: 1, exportedAt: Date.now(), games };
  return JSON.stringify(file, null, 2);
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

/** Imports a backup. Games that do not replay cleanly are skipped; existing games are overwritten. */
export async function importAll(json: string): Promise<ImportResult> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("invalidFile");
  }
  const file = data as Partial<BackupFile>;
  if (file?.app !== "rotaray" || file.version !== 1 || !Array.isArray(file.games)) {
    throw new Error("invalidFile");
  }
  let imported = 0;
  let skipped = 0;
  for (const game of file.games) {
    try {
      const state = replay(game.actions);
      if (!state.gameId || state.gameId !== game.gameId) throw new Error("mismatch");
      await set(gameKey(game.gameId), game.actions);
      imported++;
    } catch {
      skipped++;
    }
  }
  return { imported, skipped };
}
