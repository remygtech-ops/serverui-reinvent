"use client";

import { useMemo, useSyncExternalStore } from "react";

const KEY = "serverui-server-groups";
const EVENT = "serverui-server-groups-changed";
const MAX_NAME = 40;

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** server id -> group name. Groups are a display choice kept in this browser. */
export function parseServerGroups(raw: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, name] of Object.entries(parsed)) {
      if (typeof name === "string" && name.trim()) out[id] = name.trim().slice(0, MAX_NAME);
    }
    return out;
  } catch {
    return {};
  }
}

export function useServerGroups() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const groups = useMemo(() => parseServerGroups(raw), [raw]);
  const names = useMemo(
    () => [...new Set(Object.values(groups))].sort((a, b) => a.localeCompare(b)),
    [groups],
  );

  function setGroup(id: string, name: string) {
    const next = { ...parseServerGroups(readRaw()) };
    const clean = name.trim().slice(0, MAX_NAME);
    if (clean) next[id] = clean;
    else delete next[id];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Ignore private-mode storage failures.
    }
    emit();
  }

  return { groups, names, setGroup };
}
