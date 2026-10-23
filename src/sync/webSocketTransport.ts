import type { ClientMsg, ServerMsg } from "./protocol";
import type { Transport, TransportHandlers } from "./transport";

const MAX_DELAY = 15000;

/** WebSocket to `<baseUrl>/rooms/<code>`, reconnecting with a growing delay and whenever the browser is back online. */
export class WebSocketTransport implements Transport {
  private socket: WebSocket | null = null;
  private handlers: TransportHandlers | null = null;
  private closed = false;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly baseUrl: string, private readonly code: string) {}

  connect(handlers: TransportHandlers) {
    this.handlers = handlers;
    this.closed = false;
    window.addEventListener("online", this.retryNow);
    this.open();
  }

  private retryNow = () => {
    if (this.closed || this.socket?.readyState === WebSocket.OPEN) return;
    clearTimeout(this.timer);
    this.open();
  };

  private open() {
    this.socket?.close();
    const url = `${this.baseUrl.replace(/\/+$/, "")}/rooms/${this.code}`;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onopen = () => {
      this.attempts = 0;
      this.handlers?.onOpen();
    };
    socket.onmessage = (e) => {
      try {
        this.handlers?.onMessage(JSON.parse(String(e.data)) as ServerMsg);
      } catch {
        /* ignore garbage */
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.handlers?.onClose();
      if (this.closed) return;
      const delay = Math.min(MAX_DELAY, 500 * 2 ** this.attempts++);
      this.timer = setTimeout(() => this.open(), delay);
    };
    socket.onerror = () => socket.close();
  }

  send(msg: ClientMsg) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    window.removeEventListener("online", this.retryNow);
    this.socket?.close();
    this.socket = null;
  }
}
