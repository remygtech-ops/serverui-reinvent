"use client";

import { useMemo, useSyncExternalStore } from "react";

import { TERMINAL_THEMES, type TerminalThemeId } from "@/src/lib/terminal-themes";

const PREFS_KEY = "serverui-terminal";
const EVENT = "serverui-terminal-prefs";

export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 32;

export const FONT_FAMILIES = {
  system: {
    name: "System mono",
    stack: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  consolas: { name: "Consolas", stack: "Consolas, 'Cascadia Mono', 'Courier New', monospace" },
  menlo: { name: "Menlo", stack: "Menlo, Monaco, 'DejaVu Sans Mono', monospace" },
  dejavu: { name: "DejaVu Sans Mono", stack: "'DejaVu Sans Mono', 'Liberation Mono', monospace" },
} as const;

export type FontFamilyId = keyof typeof FONT_FAMILIES;
export type CursorStyle = "block" | "bar" | "underline";

export const TERMINAL_DEFAULTS = {
  themeId: "serverui" as TerminalThemeId,
  fontSize: 13,
  fontFamily: "system" as FontFamilyId,
  cursorStyle: "block" as CursorStyle,
  cursorBlink: true,
  /** Colors `user@host:path` on the prompt line. Done in the UI, nothing is sent to the server. */
  highlightPrompt: true,
  copyOnSelect: false,
  rightClickPaste: false,
};

export type TerminalPrefs = typeof TERMINAL_DEFAULTS;

export function clampFontSize(value: number) {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)));
}

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readRaw() {
  try {
    return localStorage.getItem(PREFS_KEY) || "";
  } catch {
    return "";
  }
}

export function parseTerminalPrefs(raw: string): TerminalPrefs {
  const next = { ...TERMINAL_DEFAULTS };
  if (!raw) return next;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof TerminalPrefs, unknown>>;
    if (TERMINAL_THEMES.some((theme) => theme.id === parsed.themeId)) {
      next.themeId = parsed.themeId as TerminalThemeId;
    }
    if (typeof parsed.fontSize === "number" && Number.isFinite(parsed.fontSize)) {
      next.fontSize = clampFontSize(parsed.fontSize);
    }
    if (typeof parsed.fontFamily === "string" && parsed.fontFamily in FONT_FAMILIES) {
      next.fontFamily = parsed.fontFamily as FontFamilyId;
    }
    if (
      parsed.cursorStyle === "block" ||
      parsed.cursorStyle === "bar" ||
      parsed.cursorStyle === "underline"
    ) {
      next.cursorStyle = parsed.cursorStyle;
    }
    for (const key of [
      "cursorBlink",
      "highlightPrompt",
      "copyOnSelect",
      "rightClickPaste",
    ] as const) {
      if (typeof parsed[key] === "boolean") next[key] = parsed[key];
    }
  } catch {
    return { ...TERMINAL_DEFAULTS };
  }
  return next;
}

export function writeTerminalPrefs(patch: Partial<TerminalPrefs>) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...parseTerminalPrefs(readRaw()), ...patch }));
  } catch {
    // Ignore private-mode storage failures.
  }
  emit();
}

export function useTerminalPrefs() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const prefs = useMemo(() => parseTerminalPrefs(raw), [raw]);
  return {
    prefs,
    updatePrefs: writeTerminalPrefs,
    resetPrefs: () => writeTerminalPrefs({ ...TERMINAL_DEFAULTS }),
  };
}
