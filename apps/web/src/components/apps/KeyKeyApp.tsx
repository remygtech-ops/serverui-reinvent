"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Copy, Eye, EyeOff, KeyRound, Lock, Plus, RefreshCw, Search, Trash2 } from "lucide-react";

import {
  bitwardenItems,
  bitwardenLock,
  bitwardenStatus,
  bitwardenUnlock,
} from "@/src/lib/keykey/bitwarden";
import {
  GENERATOR_DEFAULTS,
  WrongMasterPasswordError,
  createVault,
  generatePassword,
  hasVault,
  unlockVault,
  type VaultItem,
  type VaultSession,
} from "@/src/lib/keykey/vault";
import { useSecurityPrefs } from "@/src/lib/security-prefs";

const CLIPBOARD_CLEAR_MS = 30_000;
const MIN_MASTER_LENGTH = 8;

type Draft = Omit<VaultItem, "updatedAt"> & { updatedAt?: string };

const inputClass =
  "w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm sui-title outline-none focus-visible:ring-2 focus-visible:ring-sky-400";

/** KeyKey: the built-in encrypted password vault. Can read a Bitwarden vault instead. */
export function KeyKeyApp() {
  const { prefs } = useSecurityPrefs();
  return prefs.vaultProvider === "bitwarden" ? (
    <BitwardenVault base={prefs.bitwardenUrl} autoLockMinutes={prefs.autoLockMinutes} />
  ) : (
    <NativeVault autoLockMinutes={prefs.autoLockMinutes} />
  );
}

function NativeVault({ autoLockMinutes }: { autoLockMinutes: number }) {
  const [session, setSession] = useState<VaultSession | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [exists, setExists] = useState(() => hasVault());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [master, setMaster] = useState("");
  const [confirm, setConfirm] = useState("");

  const lock = useCallback(() => {
    setSession(null);
    setItems([]);
    setMaster("");
    setConfirm("");
  }, []);
  useIdleLock(Boolean(session), autoLockMinutes, lock);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!exists) {
      if (master.length < MIN_MASTER_LENGTH) {
        setError(`Use at least ${MIN_MASTER_LENGTH} characters.`);
        return;
      }
      if (master !== confirm) {
        setError("The two passwords do not match.");
        return;
      }
    }
    setBusy(true);
    try {
      const next = exists ? await unlockVault(master) : await createVault(master);
      setExists(true);
      setSession(next);
      setItems(next.items);
      setMaster("");
      setConfirm("");
    } catch (err) {
      setError(
        err instanceof WrongMasterPasswordError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to open the vault.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function persist(next: VaultItem[]) {
    if (!session) return;
    await session.save(next);
    setItems(next);
  }

  if (!session) {
    return (
      <LockPanel
        title={exists ? "KeyKey is locked" : "Create your KeyKey vault"}
        hint={
          exists
            ? "Enter your master password to open the vault."
            : "Your passwords are encrypted on this device with your master password. If you forget it, they cannot be recovered."
        }
        action={exists ? "Unlock" : "Create vault"}
        busy={busy}
        error={error}
        onSubmit={submit}
      >
        <input
          type="password"
          aria-label="Master password"
          autoFocus
          autoComplete={exists ? "current-password" : "new-password"}
          value={master}
          onChange={(event) => setMaster(event.target.value)}
          placeholder="Master password"
          className={inputClass}
        />
        {!exists ? (
          <input
            type="password"
            aria-label="Confirm master password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Confirm master password"
            className={inputClass}
          />
        ) : null}
      </LockPanel>
    );
  }

  return (
    <VaultView
      items={items}
      readOnly={false}
      onLock={lock}
      onSave={async (draft) => {
        const entry: VaultItem = {
          ...draft,
          updatedAt: new Date().toISOString(),
        };
        const exists = items.some((item) => item.id === entry.id);
        await persist(
          exists ? items.map((item) => (item.id === entry.id ? entry : item)) : [...items, entry],
        );
      }}
      onDelete={(id) => persist(items.filter((item) => item.id !== id))}
      onChangeMaster={async (next) => {
        if (next.length < MIN_MASTER_LENGTH)
          throw new Error(`Use at least ${MIN_MASTER_LENGTH} characters.`);
        await session.changeMaster(next);
      }}
    />
  );
}

function BitwardenVault({ base, autoLockMinutes }: { base: string; autoLockMinutes: number }) {
  const [state, setState] = useState<
    "loading" | "locked" | "unlocked" | "unauthenticated" | "error"
  >("loading");
  const [items, setItems] = useState<VaultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [master, setMaster] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const status = await bitwardenStatus(base);
      if (status === "unlocked") {
        setItems(await bitwardenItems(base));
        setState("unlocked");
      } else {
        setState(status);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bitwarden is not reachable.");
      setState("error");
    }
  }, [base]);

  useEffect(() => {
    // Initial status check; the setState calls happen after the async request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const lock = useCallback(() => {
    setItems([]);
    setState("locked");
    void bitwardenLock(base).catch(() => undefined);
  }, [base]);
  useIdleLock(state === "unlocked", autoLockMinutes, lock);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await bitwardenUnlock(base, master);
      setMaster("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to unlock.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "unlocked") {
    return <VaultView items={items} readOnly sourceLabel="Bitwarden" onLock={lock} />;
  }
  if (state === "locked") {
    return (
      <LockPanel
        title="Bitwarden is locked"
        hint={`Unlock your vault through the Bitwarden CLI at ${base}.`}
        action="Unlock"
        busy={busy}
        error={error}
        onSubmit={unlock}
      >
        <input
          type="password"
          aria-label="Bitwarden master password"
          autoFocus
          value={master}
          onChange={(event) => setMaster(event.target.value)}
          placeholder="Master password"
          className={inputClass}
        />
      </LockPanel>
    );
  }
  return (
    <div className="sui-app flex h-full items-center justify-center p-8">
      <div className="max-w-md space-y-3 text-center">
        <h3 className="text-lg font-semibold sui-title">
          {state === "loading" ? "Connecting to Bitwarden…" : "Bitwarden is not connected"}
        </h3>
        {state === "unauthenticated" ? (
          <p className="text-sm leading-6 sui-muted">
            The Bitwarden CLI is running but not logged in. Run <code>bw login</code> in a terminal,
            then try again.
          </p>
        ) : null}
        {state === "error" ? (
          <>
            <p className="text-sm leading-6 sui-muted" role="alert">
              {error}
            </p>
            <p className="text-sm leading-6 sui-muted">
              Point the CLI at your instance with <code>bw config server https://your-server</code>,
              run <code>bw login</code> and <code>bw serve</code>, then retry. You can change the
              address or go back to the built-in vault in Settings → Security.
            </p>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setState("loading");
            void load();
          }}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm sui-title hover:bg-white/10"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

/** Calls onIdle after `minutes` without input while active. 0 disables it. */
function useIdleLock(active: boolean, minutes: number, onIdle: () => void) {
  const callback = useRef(onIdle);
  useEffect(() => {
    callback.current = onIdle;
  }, [onIdle]);
  useEffect(() => {
    if (!active || minutes <= 0) return;
    let timer = window.setTimeout(() => callback.current(), minutes * 60_000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.current(), minutes * 60_000);
    };
    const events = ["pointerdown", "keydown", "wheel"] as const;
    for (const name of events) window.addEventListener(name, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, reset);
    };
  }, [active, minutes]);
}

function LockPanel({
  title,
  hint,
  action,
  busy,
  error,
  onSubmit,
  children,
}: {
  title: string;
  hint: string;
  action: string;
  busy: boolean;
  error: string | null;
  onSubmit: (event: FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="sui-app flex h-full items-center justify-center p-6">
      <form onSubmit={onSubmit} className="sui-card w-full max-w-sm space-y-3 rounded-[14px] p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 sui-title" />
          <h3 className="text-base font-semibold sui-title">{title}</h3>
        </div>
        <p className="text-[13px] leading-5 sui-muted">{hint}</p>
        {children}
        {error ? (
          <p className="text-[12px] text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-[var(--toggle-active)] px-3 py-2 text-sm text-[var(--toggle-active-fg)] disabled:opacity-50"
        >
          {busy ? "Working…" : action}
        </button>
      </form>
    </div>
  );
}

function VaultView({
  items,
  readOnly,
  sourceLabel,
  onLock,
  onSave,
  onDelete,
  onChangeMaster,
}: {
  items: VaultItem[];
  readOnly: boolean;
  sourceLabel?: string;
  onLock: () => void;
  onSave?: (draft: Draft) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onChangeMaster?: (next: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [newMaster, setNewMaster] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter(
        (item) =>
          !needle || `${item.title} ${item.username} ${item.url}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [items, query]);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied. The clipboard is cleared in 30 seconds.`);
      window.setTimeout(() => {
        void navigator.clipboard
          .readText()
          .then((current) => (current === value ? navigator.clipboard.writeText("") : undefined))
          .catch(() => undefined);
      }, CLIPBOARD_CLEAR_MS);
    } catch {
      setNotice("Copy is not available here.");
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !onSave || !draft.title.trim()) return;
    await onSave({ ...draft, title: draft.title.trim() });
    setSelectedId(draft.id);
    setDraft(null);
  }

  return (
    <div className="sui-app flex h-full min-h-0 overflow-hidden">
      <aside className="sui-sidebar flex w-[250px] shrink-0 flex-col gap-2 px-3 py-4">
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] sui-muted">
            {sourceLabel ?? "KeyKey"}
          </p>
          <button
            type="button"
            aria-label="Lock vault"
            title="Lock"
            onClick={onLock}
            className="flex size-6 items-center justify-center rounded-md sui-title hover:bg-white/10"
          >
            <Lock className="size-3.5" />
          </button>
        </div>
        <div className="relative">
          <Search className="sui-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <input
            aria-label="Search vault"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className={`${inputClass} pl-8`}
          />
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto" aria-label="Vault items">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.id === selectedId ? "true" : undefined}
                onClick={() => {
                  setSelectedId(item.id);
                  setDraft(null);
                  setReveal(false);
                }}
                className={`w-full rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  item.id === selectedId ? "sui-selected" : "sui-title hover:bg-white/8"
                }`}
              >
                <span className="block truncate text-[13px]">{item.title}</span>
                <span className="block truncate text-[11px] sui-muted">
                  {item.username || item.url}
                </span>
              </button>
            </li>
          ))}
          {visible.length === 0 ? (
            <li className="px-2 py-4 text-center text-[12px] sui-muted">No items.</li>
          ) : null}
        </ul>
        {!readOnly ? (
          <>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setReveal(false);
                setDraft({
                  id: crypto.randomUUID(),
                  title: "",
                  username: "",
                  password: generatePassword(GENERATOR_DEFAULTS),
                  url: "",
                  notes: "",
                });
              }}
              className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--toggle-active)] px-3 py-1.5 text-sm text-[var(--toggle-active-fg)]"
            >
              <Plus className="size-4" />
              New item
            </button>
            {newMaster === null ? (
              <button
                type="button"
                onClick={() => setNewMaster("")}
                className="text-left text-[12px] sui-muted underline"
              >
                Change master password
              </button>
            ) : (
              <form
                className="space-y-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void onChangeMaster?.(newMaster).then(
                    () => {
                      setNewMaster(null);
                      setNotice("Master password changed.");
                    },
                    (err: unknown) => setNotice(err instanceof Error ? err.message : "Failed."),
                  );
                }}
              >
                <input
                  type="password"
                  aria-label="New master password"
                  value={newMaster}
                  onChange={(event) => setNewMaster(event.target.value)}
                  className={inputClass}
                  placeholder="New master password"
                />
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    className="rounded-md border border-white/15 px-2 py-1 text-[12px] sui-title"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMaster(null)}
                    className="rounded-md px-2 py-1 text-[12px] sui-muted"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <p className="px-1 text-[11px] leading-4 sui-muted">
            Read-only. Edit items in Bitwarden.
          </p>
        )}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto px-6 py-6">
        {notice ? (
          <p className="mb-3 text-[12px] sui-muted" role="status">
            {notice}
          </p>
        ) : null}
        {draft ? (
          <form onSubmit={save} aria-label="Item editor" className="max-w-xl space-y-3">
            <h3 className="text-xl font-semibold sui-title">
              {items.some((item) => item.id === draft.id) ? "Edit item" : "New item"}
            </h3>
            <Field label="Title">
              <input
                autoFocus
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Username">
              <input
                value={draft.username}
                onChange={(event) => setDraft({ ...draft, username: event.target.value })}
                className={inputClass}
                autoComplete="off"
              />
            </Field>
            <Field label="Password">
              <div className="flex gap-2">
                <input
                  value={draft.password}
                  onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                  className={`${inputClass} font-mono`}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  aria-label="Generate password"
                  title="Generate"
                  onClick={() =>
                    setDraft({ ...draft, password: generatePassword(GENERATOR_DEFAULTS) })
                  }
                  className="flex size-9 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 sui-title hover:bg-white/10"
                >
                  <RefreshCw className="size-4" />
                </button>
              </div>
            </Field>
            <Field label="Address">
              <input
                value={draft.url}
                onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                className={inputClass}
                placeholder="ssh://host or https://…"
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                rows={3}
                className={inputClass}
              />
            </Field>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!draft.title.trim()}
                className="rounded-md bg-[var(--toggle-active)] px-3 py-1.5 text-sm text-[var(--toggle-active-fg)] disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm sui-title hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : selected ? (
          <div className="max-w-xl space-y-4">
            <h3 className="text-xl font-semibold sui-title">{selected.title}</h3>
            <Row
              label="Username"
              value={selected.username}
              onCopy={() => void copy(selected.username, "Username")}
            />
            <Row
              label="Password"
              value={
                reveal ? selected.password : "•".repeat(Math.min(selected.password.length, 16))
              }
              mono
              onCopy={() => void copy(selected.password, "Password")}
              extra={
                <button
                  type="button"
                  aria-label={reveal ? "Hide password" : "Show password"}
                  onClick={() => setReveal((value) => !value)}
                  className="flex size-7 items-center justify-center rounded-md border border-white/15 bg-white/5 sui-title hover:bg-white/10"
                >
                  {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              }
            />
            {selected.url ? (
              <Row
                label="Address"
                value={selected.url}
                onCopy={() => void copy(selected.url, "Address")}
              />
            ) : null}
            {selected.notes ? <Row label="Notes" value={selected.notes} /> : null}
            {!readOnly ? (
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDraft({ ...selected })}
                  className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm sui-title hover:bg-white/10"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onDelete?.(selected.id);
                    setSelectedId(null);
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm sui-muted">
            Select an item{readOnly ? "." : " or create a new one."}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[12px] sui-muted">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function Row({
  label,
  value,
  mono,
  onCopy,
  extra,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide sui-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className={`min-w-0 flex-1 break-all text-sm sui-title ${mono ? "font-mono" : ""}`}>
          {value || "—"}
        </p>
        {extra}
        {onCopy && value ? (
          <button
            type="button"
            aria-label={`Copy ${label.toLowerCase()}`}
            onClick={onCopy}
            className="flex size-7 items-center justify-center rounded-md border border-white/15 bg-white/5 sui-title hover:bg-white/10"
          >
            <Copy className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
