import type { Action } from "../game/actions";
import type { RuleCode } from "../game/rules";

/** One line of a room's append-only log. `seq` is assigned by the server and is the only ordering that counts. */
export type LogEntry =
  | { seq: number; kind: "action"; action: Action }
  | { seq: number; kind: "revoke"; actionId: string };

/** Why the server refused a message: a rule code, or one of the protocol codes below. */
export type RejectCode = RuleCode | "private" | "unknownAction" | "setupLocked" | "malformed";

export type ClientMsg =
  /** (Re)connect: send every entry after `since`. */
  | { t: "hello"; since: number }
  | { t: "action"; action: Action }
  /** Undo of a public action: the log keeps it, but it no longer counts. */
  | { t: "revoke"; actionId: string };

export type ServerMsg =
  | { t: "entries"; entries: LogEntry[]; hello?: boolean }
  | { t: "rejected"; ref: string; code: RejectCode };

/** Room codes avoid look-alike characters (no 0/O, 1/I/L). */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 6;

export function makeRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

/** Accepts what a person types or pastes ("abc-def", " abcdef "). Returns null when it cannot be a code. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

export const formatCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`;
