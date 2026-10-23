import type { ClientMsg, ServerMsg } from "./protocol";

export interface TransportHandlers {
  onMessage: (msg: ServerMsg) => void;
  /** the connection is usable; the adapter answers with "hello" and resends what is pending */
  onOpen: () => void;
  onClose: () => void;
}

/** A connection to one room. It reconnects by itself; messages sent while it is down are dropped (the adapter resends). */
export interface Transport {
  connect(handlers: TransportHandlers): void;
  send(msg: ClientMsg): void;
  close(): void;
}
