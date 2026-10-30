"use client";

import { useState, type FormEvent } from "react";

import { useAppLock, validateSecret, type LockKind } from "@/src/lib/app-lock";

import {
  AUTO_LOCK_CHOICES,
  isLocalUrl,
  useSecurityPrefs,
  type VaultProvider,
} from "@/src/lib/security-prefs";

const PROVIDERS: { id: VaultProvider; label: string; hint: string }[] = [
  {
    id: "keykey",
    label: "KeyKey (built in)",
    hint: "An encrypted vault stored on this device, protected by its own master password.",
  },
  {
    id: "bitwarden",
    label: "Bitwarden instance",
    hint: "Read your Bitwarden or Vaultwarden vault through the Bitwarden CLI running on this machine (bw serve).",
  },
];

/** Password vault choices and auto-lock. Never shows or stores any secret. */
export function SecuritySettings() {
  const { prefs, updatePrefs } = useSecurityPrefs();
  const [url, setUrl] = useState(prefs.bitwardenUrl);
  const urlValid = isLocalUrl(url);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto px-6 py-8">
      <h3 className="text-2xl font-semibold tracking-tight sui-title">Security</h3>

      <AppLockSection />

      <section
        className="sui-card mt-6 max-w-2xl space-y-3 rounded-[14px] p-4"
        aria-label="Password vault"
      >
        <h4 className="text-sm font-medium sui-title">Password vault</h4>
        <div className="space-y-2" role="radiogroup" aria-label="Password vault">
          {PROVIDERS.map((provider) => (
            <label key={provider.id} className="flex cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name="vault-provider"
                aria-label={provider.label}
                checked={prefs.vaultProvider === provider.id}
                onChange={() => updatePrefs({ vaultProvider: provider.id })}
                className="mt-1 size-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm sui-title">{provider.label}</span>
                <span className="mt-0.5 block text-[12px] leading-5 sui-muted">
                  {provider.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
        {prefs.vaultProvider === "bitwarden" ? (
          <div className="space-y-1.5 pt-1">
            <label htmlFor="bw-url" className="block text-[12px] sui-muted">
              Bitwarden CLI address
            </label>
            <input
              id="bw-url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                if (isLocalUrl(event.target.value))
                  updatePrefs({ bitwardenUrl: event.target.value });
              }}
              spellCheck={false}
              className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 font-mono text-sm sui-title outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            />
            {!urlValid ? (
              <p className="text-[12px] text-red-400" role="alert">
                Use a local address such as http://localhost:8087.
              </p>
            ) : null}
            <p className="text-[12px] leading-5 sui-muted">
              Run <code>bw config server https://your-instance</code>, <code>bw login</code> and{" "}
              <code>bw serve</code> on this machine. Items are read-only in KeyKey.
            </p>
          </div>
        ) : null}
      </section>

      <section
        className="sui-card mt-6 max-w-2xl space-y-3 rounded-[14px] p-4"
        aria-label="Auto-lock"
      >
        <h4 className="text-sm font-medium sui-title">Auto-lock</h4>
        <p className="text-sm leading-6 sui-muted">
          Locks the vault, and the app when App lock is on, after a period without keyboard or mouse
          activity.
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Auto-lock delay">
          {AUTO_LOCK_CHOICES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              role="radio"
              aria-checked={prefs.autoLockMinutes === minutes}
              onClick={() => updatePrefs({ autoLockMinutes: minutes })}
              className={`rounded-full px-4 py-1.5 text-sm outline-none ${
                prefs.autoLockMinutes === minutes
                  ? "bg-[var(--toggle-active)] text-[var(--toggle-active-fg)]"
                  : "sui-card sui-title"
              }`}
            >
              {minutes === 0 ? "Never" : `${minutes} min`}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

const fieldClass =
  "w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm sui-title outline-none focus-visible:ring-2 focus-visible:ring-sky-400";

type LockAction = "setup" | "change" | "disable" | null;

function AppLockSection() {
  const { enabled, kind, lock, enable, disable, change } = useAppLock();
  const [action, setAction] = useState<LockAction>(null);
  const [nextKind, setNextKind] = useState<LockKind>("pin");
  const [current, setCurrent] = useState("");
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function close() {
    setAction(null);
    setCurrent("");
    setSecret("");
    setConfirm("");
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (action === "disable") {
        if (!(await disable(current))) return setError("That is not your current secret.");
        setDone("App lock turned off.");
      } else {
        const problem = validateSecret(nextKind, secret);
        if (problem) return setError(problem);
        if (secret !== confirm) return setError("The two entries do not match.");
        if (action === "change") {
          if (!(await change(current, nextKind, secret))) {
            return setError("That is not your current secret.");
          }
          setDone("App lock updated.");
        } else {
          await enable(nextKind, secret);
          setDone("App lock turned on.");
        }
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <section className="sui-card mt-6 max-w-2xl space-y-3 rounded-[14px] p-4" aria-label="App lock">
      <h4 className="text-sm font-medium sui-title">App lock</h4>
      <p className="text-sm leading-6 sui-muted">
        Ask for a PIN or a passphrase when ServerUI starts, when you lock it, and after the idle
        delay below. It protects the open window; it does not encrypt your data.
      </p>
      {done ? (
        <p className="text-[12px] sui-muted" role="status">
          {done}
        </p>
      ) : null}
      {action === null ? (
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <LockButton onClick={lock}>Lock now</LockButton>
              <LockButton
                onClick={() => {
                  setDone(null);
                  setNextKind(kind ?? "pin");
                  setAction("change");
                }}
              >
                Change {kind === "pin" ? "PIN" : "passphrase"}
              </LockButton>
              <LockButton
                onClick={() => {
                  setDone(null);
                  setAction("disable");
                }}
              >
                Turn off
              </LockButton>
            </>
          ) : (
            <LockButton
              onClick={() => {
                setDone(null);
                setAction("setup");
              }}
            >
              Turn on app lock…
            </LockButton>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="max-w-sm space-y-2.5" aria-label="App lock setup">
          {action !== "disable" ? (
            <div className="flex gap-2" role="radiogroup" aria-label="Lock type">
              {(["pin", "phrase"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={nextKind === option}
                  onClick={() => {
                    setNextKind(option);
                    setSecret("");
                    setConfirm("");
                  }}
                  className={`rounded-full px-4 py-1.5 text-sm outline-none ${
                    nextKind === option
                      ? "bg-[var(--toggle-active)] text-[var(--toggle-active-fg)]"
                      : "sui-card sui-title"
                  }`}
                >
                  {option === "pin" ? "PIN" : "Passphrase"}
                </button>
              ))}
            </div>
          ) : null}
          {action !== "setup" ? (
            <input
              type="password"
              aria-label="Current PIN or passphrase"
              placeholder="Current PIN or passphrase"
              autoComplete="off"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              className={fieldClass}
            />
          ) : null}
          {action !== "disable" ? (
            <>
              <input
                type="password"
                inputMode={nextKind === "pin" ? "numeric" : "text"}
                aria-label={nextKind === "pin" ? "New PIN" : "New passphrase"}
                placeholder={nextKind === "pin" ? "New PIN (4 to 8 digits)" : "New passphrase"}
                autoComplete="off"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                className={fieldClass}
              />
              <input
                type="password"
                inputMode={nextKind === "pin" ? "numeric" : "text"}
                aria-label="Confirm"
                placeholder="Confirm"
                autoComplete="off"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className={fieldClass}
              />
            </>
          ) : null}
          {error ? (
            <p className="text-[12px] text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-[var(--toggle-active)] px-3 py-1.5 text-sm text-[var(--toggle-active-fg)]"
            >
              {action === "disable" ? "Turn off" : "Save"}
            </button>
            <LockButton onClick={close}>Cancel</LockButton>
          </div>
        </form>
      )}
    </section>
  );
}

function LockButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm sui-title hover:bg-white/10"
    >
      {children}
    </button>
  );
}
