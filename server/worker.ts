/**
 * Cloudflare Worker + Durable Object: one room per game code, WebSocket in, `Room` (src/sync/room.ts) as the
 * authority. Not part of the app bundle or of `tsc -b`; deployed by hand with wrangler (see server/README.md).
 * The Workers types are declared minimally here so the repository needs no extra dependency to lint it.
 */
import { normalizeCode, type ClientMsg, type LogEntry, type ServerMsg } from "../src/sync/protocol";
import { Room } from "../src/sync/room";

interface DurableObjectStorage {
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
  put(key: string, value: unknown): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  getWebSockets(): WebSocketLike[];
  acceptWebSocket(ws: WebSocketLike): void;
  blockConcurrencyWhile(fn: () => Promise<void>): void;
}
interface WebSocketLike {
  send(data: string): void;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface Env {
  ROOMS: { idFromName(name: string): unknown; get(id: unknown): DurableObjectStub };
  /** optional: only accept sockets opened from this origin, for example https://onurcem.github.io */
  ALLOWED_ORIGIN?: string;
}
declare const WebSocketPair: new () => { 0: WebSocketLike; 1: WebSocketLike };

const key = (seq: number) => `e:${String(seq).padStart(8, "0")}`;

export class GameRoom {
  private room = new Room();

  constructor(private readonly state: DurableObjectState) {
    state.blockConcurrencyWhile(async () => {
      const stored = await state.storage.list<LogEntry>({ prefix: "e:" });
      this.room = new Room([...stored.values()]);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  async webSocketMessage(ws: WebSocketLike, data: string | ArrayBuffer) {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)) as ClientMsg;
    } catch {
      return ws.send(JSON.stringify({ t: "rejected", ref: "", code: "malformed" } satisfies ServerMsg));
    }
    const { reply, appended } = this.room.receive(msg);
    for (const entry of appended) await this.state.storage.put(key(entry.seq), entry);
    reply.forEach((r) => ws.send(JSON.stringify(r)));
    if (appended.length) {
      const out = JSON.stringify({ t: "entries", entries: appended } satisfies ServerMsg);
      this.state.getWebSockets().forEach((client) => client.send(out));
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/rooms\/([A-Za-z0-9]+)$/.exec(url.pathname);
    const code = match ? normalizeCode(match[1]) : null;
    if (!code) return new Response("Not found", { status: 404 });
    const origin = request.headers.get("Origin");
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};
