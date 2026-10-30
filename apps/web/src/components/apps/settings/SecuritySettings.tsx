"use client";

import { useState } from "react";

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
          Locks the vault after a period without keyboard or mouse activity.
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
