import { MemoryHub } from "./memoryTransport";
import type { ClientMsg } from "./protocol";
import type { Transport } from "./transport";
import { WebSocketTransport } from "./webSocketTransport";

const OVERRIDE_KEY = "railtally:syncUrl";

/**
 * Where the realtime server lives: `VITE_SYNC_URL` at build time, or a value stored on this device
 * (`localStorage["railtally:syncUrl"]`, for testing). `memory:` means a fake in-page server. Null: not set up.
 */
export function getSyncUrl(): string | null {
  try {
    const stored = localStorage.getItem(OVERRIDE_KEY);
    if (stored) return stored;
  } catch {
    /* storage can be unavailable */
  }
  const env = import.meta.env?.VITE_SYNC_URL as string | undefined;
  return env || null;
}

let memoryHub: MemoryHub | null = null;
export const sharedMemoryHub = () => (memoryHub ??= new MemoryHub());

/** A transport that never connects: shared games opened without a server stay readable and editable offline. */
class OfflineTransport implements Transport {
  connect(handlers: { onClose: () => void }) {
    handlers.onClose();
  }
  send(msg: ClientMsg) {
    void msg;
  }
  close() {}
}

export function createTransport(code: string, url: string | null = getSyncUrl()): Transport {
  if (!url) return new OfflineTransport();
  if (url.startsWith("memory:")) return sharedMemoryHub().transport(code);
  return new WebSocketTransport(url, code);
}
