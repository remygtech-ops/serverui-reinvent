"use client";

import { useMemo, useSyncExternalStore } from "react";

const KEY = "serverui-security";
const EVENT = "serverui-security-prefs";

export type VaultProvider = "keykey" | "bitwarden";

export const SECURITY_DEFAULTS = {
  /** Where the password vault lives: the built-in KeyKey vault or a Bitwarden instance. */
  vaultProvider: "keykey" as VaultProvider,
  /** Address of the Bitwarden CLI local API (`bw serve`) connected to your instance. */
  bitwardenUrl: "http://localhost:8087",
  /** Locks the vault after this many idle minutes. 0 turns it off. */
  autoLockMinutes: 5,
};

export type SecurityPrefs = typeof SECURITY_DEFAULTS;

export const AUTO_LOCK_CHOICES = [0, 1, 5, 15, 30] as const;

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

/** Only local addresses: the vault API must never be pointed at a remote host by mistake. */
export function isLocalUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function parseSecurityPrefs(raw: string): SecurityPrefs {
  const next = { ...SECURITY_DEFAULTS };
  if (!raw) return next;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof SecurityPrefs, unknown>>;
    if (parsed.vaultProvider === "keykey" || parsed.vaultProvider === "bitwarden") {
      next.vaultProvider = parsed.vaultProvider;
    }
    if (typeof parsed.bitwardenUrl === "string" && isLocalUrl(parsed.bitwardenUrl)) {
      next.bitwardenUrl = parsed.bitwardenUrl.replace(/\/+$/, "");
    }
    if (
      typeof parsed.autoLockMinutes === "number" &&
      (AUTO_LOCK_CHOICES as readonly number[]).includes(parsed.autoLockMinutes)
    ) {
      next.autoLockMinutes = parsed.autoLockMinutes;
    }
  } catch {
    return { ...SECURITY_DEFAULTS };
  }
  return next;
}

export function writeSecurityPrefs(patch: Partial<SecurityPrefs>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...parseSecurityPrefs(readRaw()), ...patch }));
  } catch {
    // Ignore private-mode storage failures.
  }
  emit();
}

export function useSecurityPrefs() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const prefs = useMemo(() => parseSecurityPrefs(raw), [raw]);
  return { prefs, updatePrefs: writeSecurityPrefs };
}
