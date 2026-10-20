import { useEffect } from "react";

type WakeLockSentinelLike = { release: () => Promise<void> };

/** Keeps the screen awake while `active` is true (Wake Lock API, where supported). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    if (!active || !nav.wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await nav.wakeLock!.request("screen");
        if (cancelled) void lock.release();
        else sentinel = lock;
      } catch {
        /* denied or not allowed right now */
      }
    };
    // The lock is released when the page is hidden; take it again when visible.
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [active]);
}
