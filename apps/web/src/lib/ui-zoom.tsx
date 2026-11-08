"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { inDesktopShell } from "@/src/lib/app-updater";

const KEY = "serverui-ui-zoom";
const EVENT = "serverui-ui-zoom";

export const UI_ZOOM_MIN = 0.5;
export const UI_ZOOM_MAX = 2;
export const UI_ZOOM_STEP = 0.1;
export const UI_ZOOM_DEFAULT = 1;

export function clampUiZoom(value: number): number {
  if (!Number.isFinite(value)) return UI_ZOOM_DEFAULT;
  const clamped = Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, value));
  return Math.round(clamped * 100) / 100;
}

function read(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? UI_ZOOM_DEFAULT : clampUiZoom(Number(raw));
  } catch {
    return UI_ZOOM_DEFAULT;
  }
}

export function writeUiZoom(value: number): void {
  const next = clampUiZoom(value);
  try {
    if (next === UI_ZOOM_DEFAULT) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(next));
  } catch {
    // Storage unavailable: the zoom still applies for this session through the event below.
  }
  memory = next;
  window.dispatchEvent(new Event(EVENT));
}

let memory: number | null = null;

function snapshot(): number {
  if (memory === null) memory = read();
  return memory;
}

function subscribe(onChange: () => void) {
  const sync = () => {
    memory = read();
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", sync);
  };
}

/** Whole-interface zoom (windows, dock, menus). 1 = 100%. */
export function useUiZoom(): number {
  return useSyncExternalStore(subscribe, snapshot, () => UI_ZOOM_DEFAULT);
}

export function useDesktopShell(): boolean | null {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void inDesktopShell().then((value) => {
      if (alive) setDesktop(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return desktop;
}

let nativeApplying = false;
let nativeWanted: number | null = null;

/** One native call at a time: while one is in flight only the latest wanted value is kept. */
async function applyNativeZoom(value: number): Promise<void> {
  nativeWanted = value;
  if (nativeApplying) return;
  nativeApplying = true;
  try {
    while (nativeWanted !== null) {
      const next = nativeWanted;
      nativeWanted = null;
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      await getCurrentWebview().setZoom(next);
    }
  } finally {
    nativeApplying = false;
  }
}

/**
 * Ctrl + mouse wheel (Cmd on macOS) zooms the whole desktop UI in the app shell, like a browser
 * does. In a browser tab nothing is intercepted: the browser's own zoom already does this.
 * A terminal handles its own Ctrl + wheel (font size) and marks the event as handled first.
 */
export function UiZoomController() {
  const zoom = useUiZoom();
  const [desktop, setDesktop] = useState(false);
  const [shown, setShown] = useState(false);
  const firstApply = useRef(true);

  useEffect(() => {
    let alive = true;
    void inDesktopShell().then((value) => {
      if (alive) setDesktop(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!desktop) return;
    void applyNativeZoom(zoom).catch(() => {});
    if (firstApply.current) {
      firstApply.current = false;
      return;
    }
    setShown(true);
    const timer = window.setTimeout(() => setShown(false), 1200);
    return () => window.clearTimeout(timer);
  }, [desktop, zoom]);

  useEffect(() => {
    if (!desktop) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (event.deltaY === 0) return;
      writeUiZoom(snapshot() + (event.deltaY < 0 ? UI_ZOOM_STEP : -UI_ZOOM_STEP));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [desktop]);

  if (!desktop || !shown) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-3.5 py-1.5 text-[13px] font-medium tabular-nums text-white shadow-lg backdrop-blur"
    >
      {Math.round(zoom * 100)}%
    </div>
  );
}
