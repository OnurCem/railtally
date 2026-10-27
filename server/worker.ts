/**
 * Cloudflare Worker + Durable Object: one room per game code, WebSocket in, `Room` (src/sync/room.ts) as the
 * authority. Not part of the app bundle or of `tsc -b`; deployed by hand with wrangler (see server/README.md).
 * The Workers types are declared minimally here so the repository needs no extra dependency to lint it.
 */
import { LIMITS, normalizeCode, type ClientMsg, type LogEntry, type ServerMsg } from "../src/sync/protocol";
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
  close(code?: number, reason?: string): void;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface Env {
  ROOMS: { idFromName(name: string): unknown; get(id: unknown): DurableObjectStub };
  /** optional, comma separated: only browsers on these origins may open sockets, for example https://onurcem.github.io */
  ALLOWED_ORIGIN?: string;
}
declare const WebSocketPair: new () => { 0: WebSocketLike; 1: WebSocketLike };

/** Per-socket token bucket. Lives in memory, so it resets when the object hibernates; that is fine for a flood guard. */
const buckets = new WeakMap<WebSocketLike, { tokens: number; at: number }>();

function allowed(ws: WebSocketLike, now = Date.now()): boolean {
  const b = buckets.get(ws) ?? { tokens: LIMITS.burst, at: now };
  b.tokens = Math.min(LIMITS.burst, b.tokens + ((now - b.at) / 1000) * LIMITS.perSecond);
  b.at = now;
  buckets.set(ws, b);
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

const refuse = (ws: WebSocketLike, code: "tooBig" | "rateLimited") => {
  ws.send(JSON.stringify({ t: "rejected", ref: "", code } satisfies ServerMsg));
  ws.close(1008, code);
};

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
    if (this.state.getWebSockets().length >= LIMITS.maxSocketsPerRoom) return new Response("Room is full", { status: 429 });
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  async webSocketMessage(ws: WebSocketLike, data: string | ArrayBuffer) {
    const size = typeof data === "string" ? new TextEncoder().encode(data).length : data.byteLength;
    if (size > LIMITS.maxMessageBytes) return refuse(ws, "tooBig");
    if (!allowed(ws)) return refuse(ws, "rateLimited");
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
    // browsers always send Origin; a script can fake or omit it, so this only stops other websites from using the server
    const allowedOrigins = env.ALLOWED_ORIGIN?.split(",").map((o) => o.trim());
    if (allowedOrigins && origin && !allowedOrigins.includes(origin)) return new Response("Forbidden", { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};
