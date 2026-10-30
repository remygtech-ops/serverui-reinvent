"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useSecurityPrefs } from "@/src/lib/security-prefs";

/**
 * Screen lock for the ServerUI window: a PIN or a passphrase asked at start-up, on demand and
 * after the idle delay set in Settings > Security. Only a salted PBKDF2 hash is kept, never the
 * PIN itself. This protects the open interface; it does not encrypt data on disk.
 */
export type LockKind = "pin" | "phrase";

type LockConfig = {
  kind: LockKind;
  salt: string;
  hash: string;
  iterations: number;
};

const KEY = "serverui-lock";
const EVENT = "serverui-lock-config";
const ITERATIONS = 200_000;

export const PIN_PATTERN = /^\d{4,8}$/;
export const MIN_PHRASE_LENGTH = 6;
const MAX_FAILURES = 5;
const COOLDOWN_MS = 30_000;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hashSecret(secret: string, salt: Uint8Array, iterations: number) {
  const crypto = globalThis.crypto.subtle;
  const material = await crypto.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

export function validateSecret(kind: LockKind, secret: string): string | null {
  if (kind === "pin") return PIN_PATTERN.test(secret) ? null : "Use 4 to 8 digits.";
  return secret.length >= MIN_PHRASE_LENGTH
    ? null
    : `Use at least ${MIN_PHRASE_LENGTH} characters.`;
}

function readConfig(): LockConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LockConfig>;
    if (
      (parsed.kind === "pin" || parsed.kind === "phrase") &&
      typeof parsed.salt === "string" &&
      typeof parsed.hash === "string" &&
      typeof parsed.iterations === "number"
    ) {
      return parsed as LockConfig;
    }
  } catch {
    // Treated as no lock.
  }
  return null;
}

async function verify(config: LockConfig, secret: string) {
  const hash = await hashSecret(secret, fromBase64(config.salt), config.iterations);
  return hash === config.hash;
}

type AppLockValue = {
  enabled: boolean;
  kind: LockKind | null;
  locked: boolean;
  lock: () => void;
  /** Resolves false when the secret is wrong. Throws while the retry cooldown is active. */
  unlock: (secret: string) => Promise<boolean>;
  enable: (kind: LockKind, secret: string) => Promise<void>;
  disable: (currentSecret: string) => Promise<boolean>;
  change: (currentSecret: string, kind: LockKind, secret: string) => Promise<boolean>;
  /** Seconds left before another attempt is allowed. */
  cooldownSeconds: number;
};

const AppLockContext = createContext<AppLockValue | null>(null);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<LockConfig | null>(() => readConfig());
  const [locked, setLocked] = useState(() => readConfig() !== null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const failures = useRef(0);
  const { prefs } = useSecurityPrefs();

  useEffect(() => {
    const sync = () => setConfig(readConfig());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= cooldownUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  // Lock after the idle delay while the lock is on.
  useEffect(() => {
    if (!config || locked || prefs.autoLockMinutes <= 0) return;
    const delay = prefs.autoLockMinutes * 60_000;
    let timer = window.setTimeout(() => setLocked(true), delay);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setLocked(true), delay);
    };
    const events = ["pointerdown", "keydown", "wheel", "pointermove"] as const;
    for (const name of events) window.addEventListener(name, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, reset);
    };
  }, [config, locked, prefs.autoLockMinutes]);

  const lock = useCallback(() => {
    if (readConfig()) setLocked(true);
  }, []);

  const unlock = useCallback(
    async (secret: string) => {
      const current = readConfig();
      if (!current) {
        setLocked(false);
        return true;
      }
      if (Date.now() < cooldownUntil) throw new Error("Too many attempts. Wait a moment.");
      if (await verify(current, secret)) {
        failures.current = 0;
        setLocked(false);
        return true;
      }
      failures.current += 1;
      if (failures.current >= MAX_FAILURES) {
        failures.current = 0;
        const until = Date.now() + COOLDOWN_MS;
        setCooldownUntil(until);
        setNow(Date.now());
      }
      return false;
    },
    [cooldownUntil],
  );

  const enable = useCallback(async (kind: LockKind, secret: string) => {
    const problem = validateSecret(kind, secret);
    if (problem) throw new Error(problem);
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const next: LockConfig = {
      kind,
      salt: toBase64(salt),
      hash: await hashSecret(secret, salt, ITERATIONS),
      iterations: ITERATIONS,
    };
    localStorage.setItem(KEY, JSON.stringify(next));
    setConfig(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const disable = useCallback(async (currentSecret: string) => {
    const current = readConfig();
    if (!current) return true;
    if (!(await verify(current, currentSecret))) return false;
    localStorage.removeItem(KEY);
    setConfig(null);
    setLocked(false);
    window.dispatchEvent(new Event(EVENT));
    return true;
  }, []);

  const change = useCallback(
    async (currentSecret: string, kind: LockKind, secret: string) => {
      const current = readConfig();
      if (current && !(await verify(current, currentSecret))) return false;
      await enable(kind, secret);
      return true;
    },
    [enable],
  );

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const value = useMemo<AppLockValue>(
    () => ({
      enabled: config !== null,
      kind: config?.kind ?? null,
      locked: config !== null && locked,
      lock,
      unlock,
      enable,
      disable,
      change,
      cooldownSeconds,
    }),
    [config, locked, lock, unlock, enable, disable, change, cooldownSeconds],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (!context) throw new Error("useAppLock must be used within AppLockProvider");
  return context;
}
