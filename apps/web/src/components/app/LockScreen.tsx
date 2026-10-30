"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Lock } from "lucide-react";

import { useAppLock } from "@/src/lib/app-lock";

/** Covers the desktop while locked. The apps underneath keep running (terminals stay open). */
export function LockGate({ children }: { children: ReactNode }) {
  const { locked } = useAppLock();
  return (
    <>
      <div className="contents" inert={locked}>
        {children}
      </div>
      {locked ? <LockScreen /> : null}
    </>
  );
}

function LockScreen() {
  const { kind, unlock, cooldownSeconds } = useAppLock();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!secret || busy || cooldownSeconds > 0) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await unlock(secret);
      if (!ok) {
        setError(kind === "pin" ? "Wrong PIN." : "Wrong passphrase.");
        setSecret("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to unlock.");
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ServerUI is locked"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-6 backdrop-blur-xl"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-xs space-y-4 rounded-2xl border border-white/15 bg-zinc-950/80 p-6 text-center text-white shadow-2xl"
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-white/10">
          <Lock className="size-5" />
        </span>
        <h2 className="text-base font-semibold">ServerUI is locked</h2>
        <input
          ref={input}
          type="password"
          inputMode={kind === "pin" ? "numeric" : "text"}
          aria-label={kind === "pin" ? "PIN" : "Passphrase"}
          autoComplete="off"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder={kind === "pin" ? "PIN" : "Passphrase"}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center text-lg tracking-widest outline-none placeholder:tracking-normal placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-sky-400"
        />
        {cooldownSeconds > 0 ? (
          <p className="text-[12px] text-amber-300" role="alert">
            Too many attempts. Try again in {cooldownSeconds}s.
          </p>
        ) : error ? (
          <p className="text-[12px] text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!secret || busy || cooldownSeconds > 0}
          className="w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
