import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cities } from "../../data/cities";
import { MAP_HEIGHT, MAP_WIDTH } from "../../data/projection";
import type { GameState } from "../../game/state";
import { cityNear, routesNear, type Point } from "./geometry";
import { MapContent } from "./MapContent";

const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
const TAP_RADIUS_PX = 22; // 44px tap target
const MOVE_SLOP_PX = 8;
const LONG_PRESS_MS = 550;
const DOUBLE_TAP_MS = 320;
const PAN_MARGIN_PX = 40;
/** owner marks on claimed routes appear once one map unit covers this many screen px */
const MARKS_SCALE = 1.6;

interface View {
  k: number;
  /** pan offset from the centered position, in screen px */
  px: number;
  py: number;
}

interface Size {
  w: number;
  h: number;
}

interface Props {
  state: GameState;
  rotated: boolean;
  colorBlind: boolean;
  selectedRouteId: string | null;
  /** change this value to fit the map to the screen height again */
  resetSignal: number;
  onRoutesTap: (routeIds: string[]) => void;
  onCityLongPress: (cityId: string) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function MapView({ state, rotated, colorBlind, selectedRouteId, resetSignal, onRoutesTap, onCityLongPress }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ k: 1, px: 0, py: 0 });
  const [flash, setFlash] = useState<string[]>([]);

  const sizeRef = useRef(size);
  const viewRef = useRef(view);
  const rotatedRef = useRef(rotated);
  const handlersRef = useRef({ onRoutesTap, onCityLongPress });
  /** true once the user has zoomed or panned, so a resize no longer re-fits the map */
  const touchedRef = useRef(false);
  const flashTimer = useRef(0);
  const movingTimer = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sizeRef.current = size;
    rotatedRef.current = rotated;
    handlersRef.current = { onRoutesTap, onCityLongPress };
  });

  const base = size.w && size.h ? Math.min(size.w / MAP_WIDTH, size.h / MAP_HEIGHT) : 0;
  const contentW = MAP_WIDTH * base;
  const contentH = MAP_HEIGHT * base;

  const applyView = useCallback((next: View) => {
    const { w, h } = sizeRef.current;
    const b = Math.min(w / MAP_WIDTH, h / MAP_HEIGHT);
    const k = clamp(next.k, MIN_ZOOM, MAX_ZOOM);
    const kw = MAP_WIDTH * b * k;
    const kh = MAP_HEIGHT * b * k;
    const limit = (container: number, content: number) => Math.abs(container - content) / 2 + PAN_MARGIN_PX;
    const v = {
      k,
      px: clamp(next.px, -limit(w, kw), limit(w, kw)),
      py: clamp(next.py, -limit(h, kh), limit(h, kh)),
    };
    viewRef.current = v;
    setView(v);
    contentRef.current?.classList.add("moving");
    window.clearTimeout(movingTimer.current);
    movingTimer.current = window.setTimeout(() => contentRef.current?.classList.remove("moving"), 200);
  }, []);

  /** Zoom so the map fills the screen height (on a portrait phone) and center it. */
  const fit = useCallback(() => {
    const { w, h } = sizeRef.current;
    touchedRef.current = false;
    if (!w || !h) return;
    const contentHeight = MAP_HEIGHT * Math.min(w / MAP_WIDTH, h / MAP_HEIGHT);
    applyView({ k: h / contentHeight, px: 0, py: 0 });
  }, [applyView]);

  useEffect(() => {
    if (resetSignal > 0) fit();
  }, [resetSignal, fit]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
      setSize(sizeRef.current);
      if (!touchedRef.current) fit();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [fit]);

  useEffect(
    () => () => {
      window.clearTimeout(flashTimer.current);
      window.clearTimeout(movingTimer.current);
    },
    [],
  );

  /** Zoom keeping the screen point (sx, sy) fixed over the same map point. */
  const zoomAt = useCallback(
    (nextK: number, sx: number, sy: number, panDx = 0, panDy = 0) => {
      const { w, h } = sizeRef.current;
      const v = viewRef.current;
      const b = Math.min(w / MAP_WIDTH, h / MAP_HEIGHT);
      const k = clamp(nextK, MIN_ZOOM, MAX_ZOOM);
      const tx = (w - MAP_WIDTH * b * v.k) / 2 + v.px;
      const ty = (h - MAP_HEIGHT * b * v.k) / 2 + v.py;
      const ntx = sx - ((sx - tx) * k) / v.k + panDx;
      const nty = sy - ((sy - ty) * k) / v.k + panDy;
      applyView({ k, px: ntx - (w - MAP_WIDTH * b * k) / 2, py: nty - (h - MAP_HEIGHT * b * k) / 2 });
    },
    [applyView],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touchedRef.current = true;
      const rect = el.getBoundingClientRect();
      zoomAt(viewRef.current.k * Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const toMap = useCallback((clientX: number, clientY: number): Point => {
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    const { w, h } = sizeRef.current;
    const v = viewRef.current;
    const b = Math.min(w / MAP_WIDTH, h / MAP_HEIGHT);
    const cw = MAP_WIDTH * b;
    const ch = MAP_HEIGHT * b;
    const tx = (w - cw * v.k) / 2 + v.px;
    const ty = (h - ch * v.k) / 2 + v.py;
    let lx = (clientX - rect.left - tx) / v.k;
    let ly = (clientY - rect.top - ty) / v.k;
    if (rotatedRef.current) {
      lx = cw - lx;
      ly = ch - ly;
    }
    return [lx / b, ly / b];
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    moved: false,
    longPressed: false,
    timer: 0,
    pinchDist: 0,
    pinchK: 1,
    lastX: 0,
    lastY: 0,
    lastEmptyTap: 0,
  });

  const radiusInMap = (px: number) => {
    const { w, h } = sizeRef.current;
    const b = Math.min(w / MAP_WIDTH, h / MAP_HEIGHT);
    return px / (b * viewRef.current.k);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const g = gesture.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    window.clearTimeout(g.timer);
    if (pointers.current.size === 1) {
      Object.assign(g, {
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        startTime: Date.now(),
        moved: false,
        longPressed: false,
      });
      g.timer = window.setTimeout(() => {
        if (g.moved || pointers.current.size !== 1) return;
        const city = cityNear(toMap(g.startX, g.startY), radiusInMap(TAP_RADIUS_PX + 4));
        if (city) {
          g.longPressed = true;
          handlersRef.current.onCityLongPress(city);
        }
      }, LONG_PRESS_MS);
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.moved = true;
      touchedRef.current = true;
      g.pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      g.pinchK = viewRef.current.k;
      g.lastX = (a.x + b.x) / 2;
      g.lastY = (a.y + b.y) / 2;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = e.currentTarget.getBoundingClientRect();
    if (pointers.current.size === 1) {
      if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > MOVE_SLOP_PX) {
        g.moved = true;
        touchedRef.current = true;
        window.clearTimeout(g.timer);
        g.lastX = e.clientX;
        g.lastY = e.clientY;
      }
      if (g.moved) {
        const v = viewRef.current;
        applyView({ ...v, px: v.px + e.clientX - g.lastX, py: v.py + e.clientY - g.lastY });
        g.lastX = e.clientX;
        g.lastY = e.clientY;
      }
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      zoomAt((g.pinchK * dist) / g.pinchDist, cx - rect.left, cy - rect.top, cx - g.lastX, cy - g.lastY);
      g.lastX = cx;
      g.lastY = cy;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!pointers.current.has(e.pointerId)) return;
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    window.clearTimeout(g.timer);
    if (pointers.current.size === 1) {
      const [rest] = [...pointers.current.values()];
      g.lastX = rest.x;
      g.lastY = rest.y;
    }
    if (!wasSingle || g.moved || g.longPressed || e.type === "pointercancel") return;
    if (Date.now() - g.startTime > LONG_PRESS_MS) return;

    const hits = routesNear(toMap(e.clientX, e.clientY), radiusInMap(TAP_RADIUS_PX));
    if (hits.length > 0) {
      const ids = hits.map((h) => h.route.id);
      setFlash(ids);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash([]), 350);
      handlersRef.current.onRoutesTap(hits.map((h) => h.route.id));
      return;
    }
    const now = Date.now();
    if (now - g.lastEmptyTap < DOUBLE_TAP_MS) {
      fit();
      g.lastEmptyTap = 0;
    } else {
      g.lastEmptyTap = now;
    }
  };

  const cityLabels = useMemo(() => new Map(cities.map((c) => [c.id, c.name])), []);
  const tx = (size.w - contentW * view.k) / 2 + view.px;
  const ty = (size.h - contentH * view.k) / 2 + view.py;

  return (
    <div
      ref={containerRef}
      className="map-viewport"
      data-testid="map-viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={fit}
    >
      {base > 0 && (
        <div
          ref={contentRef}
          className="map-content"
          data-testid="map-content"
          data-rotated={rotated}
          data-zoom={view.k.toFixed(2)}
          style={{
            width: contentW,
            height: contentH,
            transform: `translate(${tx}px, ${ty}px) scale(${view.k}) translate(${contentW / 2}px, ${contentH / 2}px) rotate(${rotated ? 180 : 0}deg) translate(${-contentW / 2}px, ${-contentH / 2}px)`,
          }}
        >
          <MapContent
            state={state}
            colorBlind={colorBlind}
            selectedRouteId={selectedRouteId}
            flashRouteIds={flash}
            showMarks={view.k * base >= MARKS_SCALE}
            cityLabels={cityLabels}
          />
        </div>
      )}
    </div>
  );
}
