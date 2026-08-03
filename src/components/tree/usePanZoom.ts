"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Pan, pinch and zoom for a tree canvas.
 *
 * Lifted out of TreeViewer so the builder canvas gets the same gestures rather
 * than a second, worse implementation of them. The behaviour it carries is not
 * incidental: a pinch that keeps the midpoint between the fingers fixed, a
 * pinch that degrades back into a pan when one finger lifts, a wheel that pans
 * and a ctrl-wheel that zooms about the cursor. Somebody entering forty people
 * on a phone lives inside these gestures, and getting them subtly wrong reads
 * as the drawing fighting back.
 */

export const MIN_ZOOM = 0.12;
export const MAX_ZOOM = 2.6;

export interface Transform {
  x: number;
  y: number;
  k: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function usePanZoom(initialZoom = 0.75) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<Transform>({
    x: 0,
    y: 0,
    k: initialZoom,
  });
  const [panning, setPanning] = useState(false);
  // Starts at zero so the first fit waits for a real measurement rather than
  // framing the drawing against a size the container never had.
  const [size, setSize] = useState({ w: 0, h: 0 });

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{ dist: number; k: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const transformRef = useRef(transform);
  transformRef.current = transform;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // React attaches wheel passively, which forbids preventDefault, so the pinch
  // path is registered directly on the element instead.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      setTransform((t) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
        const scale = k / t.k;
        return {
          k,
          // Keep the point under the cursor fixed while the scale changes.
          x: px - (px - t.x) * scale,
          y: py - (py - t.y) * scale,
        };
      });
    },
    [],
  );

  /** Zoom about the middle of the viewport — what the +/− buttons do. */
  const zoomBy = useCallback((factor: number) => {
    setTransform((t) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
      const scale = k / t.k;
      const { w, h } = { w: wrapRef.current?.clientWidth ?? 0, h: wrapRef.current?.clientHeight ?? 0 };
      return {
        k,
        x: w / 2 - (w / 2 - t.x) * scale,
        y: h / 2 - (h / 2 - t.y) * scale,
      };
    });
  }, []);

  const fitTo = useCallback(
    (bounds: Bounds, maxZoom = MAX_ZOOM) => {
      const bw = Math.max(1, bounds.maxX - bounds.minX);
      const bh = Math.max(1, bounds.maxY - bounds.minY);
      if (size.w < 10 || size.h < 10) return;
      const k = Math.min(
        maxZoom,
        Math.max(MIN_ZOOM, Math.min(size.w / bw, size.h / bh)),
      );
      setTransform({
        k,
        x: size.w / 2 - ((bounds.minX + bounds.maxX) / 2) * k,
        y: size.h / 2 - ((bounds.minY + bounds.maxY) / 2) * k,
      });
    },
    [size.w, size.h],
  );

  /** Put a point in the drawing at a chosen fraction of the viewport. */
  const centreOn = useCallback(
    (worldX: number, worldY: number, zoom?: number, yFraction = 0.5) => {
      setTransform((t) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom ?? t.k));
        return {
          k,
          x: (wrapRef.current?.clientWidth ?? 0) / 2 - worldX * k,
          y: (wrapRef.current?.clientHeight ?? 0) * yFraction - worldY * k,
        };
      });
    },
    [],
  );

  const startDrag = (x: number, y: number) => {
    dragRef.current = {
      startX: x,
      startY: y,
      origX: transformRef.current.x,
      origY: transformRef.current.y,
      moved: false,
    };
    setPanning(true);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2) {
      // A second touch has landed: this is a pinch, not a pan.
      dragRef.current = null;
      setPanning(false);
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        k: transformRef.current.k,
      };
      return;
    }

    startDrag(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [p1, p2] = [...pointersRef.current.values()];
      const rect = wrapRef.current?.getBoundingClientRect();
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (rect && pinchRef.current.dist > 0 && dist > 0) {
        const midX = (p1.x + p2.x) / 2 - rect.left;
        const midY = (p1.y + p2.y) / 2 - rect.top;
        const k = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, pinchRef.current.k * (dist / pinchRef.current.dist)),
        );
        setTransform((t) => {
          const scale = k / t.k;
          return {
            k,
            x: midX - (midX - t.x) * scale,
            y: midY - (midY - t.y) * scale,
          };
        });
      }
      return;
    }

    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    setTransform((t) => ({ ...t, x: d.origX + dx, y: d.origY + dy }));
  };

  const endDrag = (e?: React.PointerEvent) => {
    if (e) pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size >= 2) {
      // Still pinching on the remaining fingers — re-baseline rather than
      // stopping, so a stray third contact does not end the gesture.
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        k: transformRef.current.k,
      };
      return;
    }

    pinchRef.current = null;

    if (pointersRef.current.size === 1) {
      const [p] = [...pointersRef.current.values()];
      startDrag(p.x, p.y);
      return;
    }

    dragRef.current = null;
    setPanning(false);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel; so does an explicit zoom gesture.
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    } else {
      setTransform((t) => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }));
    }
  };

  /** True when the pointer actually moved — a drag must not count as a click. */
  const dragged = () => !!dragRef.current?.moved;

  return {
    wrapRef,
    size,
    transform,
    setTransform,
    panning,
    zoomAt,
    zoomBy,
    fitTo,
    centreOn,
    dragged,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerLeave: endDrag,
      onPointerCancel: endDrag,
      onWheel,
    },
  };
}
