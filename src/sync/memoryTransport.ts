import type { ClientMsg, ServerMsg } from "./protocol";
import { Room } from "./room";
import type { Transport, TransportHandlers } from "./transport";

/**
 * A whole "server" in memory: rooms by code and the clients connected to them. Used by the tests and by the
 * `memory:` sync URL (one browser tab, no network), never in production.
 */
export class MemoryHub {
  readonly rooms = new Map<string, Room>();
  private queue: (() => void)[] = [];
  private draining = false;
  private clients = new Map<string, Set<MemoryTransport>>();

  room(code: string): Room {
    let room = this.rooms.get(code);
    if (!room) this.rooms.set(code, (room = new Room()));
    return room;
  }

  transport(code: string): MemoryTransport {
    return new MemoryTransport(this, code);
  }

  /** @internal */
  enqueue(task: () => void) {
    this.queue.push(task);
    if (this.draining) return;
    this.draining = true;
    queueMicrotask(() => {
      while (this.queue.length) this.queue.shift()!();
      this.draining = false;
    });
  }

  /** @internal */
  join(code: string, t: MemoryTransport) {
    this.clients.set(code, (this.clients.get(code) ?? new Set()).add(t));
  }

  /** @internal */
  leave(code: string, t: MemoryTransport) {
    this.clients.get(code)?.delete(t);
  }

  /** @internal */
  deliver(code: string, from: MemoryTransport, msg: ClientMsg) {
    const { reply, appended } = this.room(code).receive(msg);
    reply.forEach((r) => from.receive(r));
    if (appended.length) this.clients.get(code)?.forEach((c) => c.receive({ t: "entries", entries: appended }));
  }

  /** Resolves once all queued deliveries are done. */
  async settle() {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  }
}

export class MemoryTransport implements Transport {
  private handlers: TransportHandlers | null = null;
  private online = false;
  private wanted = false;

  constructor(private readonly hub: MemoryHub, private readonly code: string) {}

  connect(handlers: TransportHandlers) {
    this.handlers = handlers;
    this.wanted = true;
    this.goOnline();
  }

  send(msg: ClientMsg) {
    if (!this.online) return;
    this.hub.enqueue(() => this.online && this.hub.deliver(this.code, this, msg));
  }

  close() {
    this.wanted = false;
    this.goOffline();
  }

  /** @internal */
  receive(msg: ServerMsg) {
    if (this.online) this.handlers?.onMessage(msg);
  }

  /** Test helper: the network drops. */
  goOffline() {
    if (!this.online) return;
    this.online = false;
    this.hub.leave(this.code, this);
    this.handlers?.onClose();
  }

  /** Test helper: the network is back (only after connect()). */
  goOnline() {
    if (this.online || !this.wanted) return;
    this.online = true;
    this.hub.join(this.code, this);
    this.handlers?.onOpen();
  }
}
