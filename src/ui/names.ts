import type { TFunction } from "i18next";
import type { Player } from "../game/state";

export function playerName(player: Pick<Player, "name" | "isMe">, index: number, t: TFunction): string {
  if (player.name) return player.name;
  return player.isMe ? t("common.me") : t("common.player", { n: index + 1 });
}

/** Players with "me" first, keeping their original index for default names. */
export function orderedPlayers<T extends { isMe: boolean }>(players: T[]): { player: T; index: number }[] {
  return players
    .map((player, index) => ({ player, index }))
    .sort((a, b) => Number(b.player.isMe) - Number(a.player.isMe) || a.index - b.index);
}
