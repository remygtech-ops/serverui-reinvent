"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { KeyRound, X } from "lucide-react";

import { ServerIcon } from "@/src/components/servers/ServerIcon";
import type { Server } from "@/src/lib/servers";

export type SecretInput = {
  password?: string;
  privateKey?: string;
  passphrase?: string;
  remember?: boolean;
};

/**
 * Asked when a server has no usable password/key: saved without it (Save password off), or the
 * stored one can no longer be read. The value goes straight to the connect request and is never
 * stored by the browser; "Remember" asks the backend to store it (encrypted) after a good login.
 */
export function SecretPromptDialog({
  server,
  error,
  onSubmit,
  onCancel,
}: {
  server: Server;
  error?: string | null;
  onSubmit: (secret: SecretInput) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const lost = server.credentialsLost === true;
  // A lost secret is repaired by default; a password left out on purpose stays out.
  const [remember, setRemember] = useState(lost);
  const isKey = server.authType === "private_key";

  useEffect(() => {
    input.current?.focus();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const secret = value.trim();
    if (!secret) return;
    onSubmit(
      isKey
        ? { privateKey: secret, passphrase: passphrase || undefined, remember }
        : { password: secret, remember },
    );
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        className="sui-finder animate-sheet-in flex w-full max-w-[420px] flex-col overflow-hidden rounded-[12px] border border-[var(--finder-hairline)] bg-[var(--finder-toolbar)] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--finder-hairline)] px-4 py-3">
          <h2 id={titleId} className="flex items-center gap-2 text-[15px] font-semibold">
            <ServerIcon
              iconId={server.iconId}
              customIcon={server.customIcon}
              serverId={server.id}
              updatedAt={server.updatedAt}
              size={18}
            />
            Connect to {server.name}
          </h2>
          <button type="button" aria-label="Close" onClick={onCancel} className="rounded-md p-1">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="sui-finder-muted text-[13px] leading-5">
            {isKey ? "Private key" : "Password"} for{" "}
            <span className="font-medium">
              {server.username}@{server.address}
            </span>{" "}
            {lost
              ? "was saved by an older version and cannot be read any more. Enter it once more to fix it."
              : "is not saved. It is kept in memory only until ServerUI closes, unless you remember it."}
          </p>
          {isKey ? (
            <textarea
              ref={input}
              aria-label="Private key"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="sui-server-input min-h-[96px] resize-y font-mono text-[12px] leading-5"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              spellCheck={false}
              autoComplete="off"
            />
          ) : (
            <div className="relative">
              <KeyRound className="sui-finder-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                ref={input}
                type="password"
                aria-label="Password"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="sui-server-input pl-9"
                placeholder="Password"
                autoComplete="off"
              />
            </div>
          )}
          {isKey ? (
            <input
              type="password"
              aria-label="Key passphrase"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              className="sui-server-input"
              placeholder="Key passphrase (if any)"
              autoComplete="off"
            />
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="size-4"
            />
            Remember {isKey ? "this key" : "this password"} (stored encrypted)
          </label>
          {error ? (
            <p className="text-[12px] text-red-500" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--finder-hairline)] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="sui-finder-control rounded-[8px] px-3 py-1.5 text-[13px] font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-[8px] bg-[var(--finder-accent)] px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            Connect
          </button>
        </div>
      </form>
    </div>
  );
}
