"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Copy, CornerDownLeft, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";

import { useWindowManager } from "@/src/components/window/window-context";
import { useSnippets, type Snippet } from "@/src/lib/snippets";
import { sendToTerminal } from "@/src/lib/terminal-bus";

type Draft = { id?: string; title: string; command: string; group: string };

const EMPTY: Draft = { title: "", command: "", group: "" };

/** Saved shell commands. Insert types into the open terminal; Run also presses Enter. */
export function SnippetsApp() {
  const { snippets, save, remove, reset } = useSnippets();
  const { openWindow } = useWindowManager();
  const [group, setGroup] = useState<string>("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const groups = useMemo(
    () => [...new Set(snippets.map((item) => item.group).filter(Boolean))].sort(),
    [snippets],
  );
  const visible = snippets.filter((item) => {
    if (group && item.group !== group) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${item.title} ${item.command}`.toLowerCase().includes(needle);
  });

  function toTerminal(snippet: Snippet, run: boolean) {
    const accepted = sendToTerminal({ text: snippet.command, run });
    if (!accepted) openWindow("terminal");
    setNotice(
      accepted
        ? run
          ? `Ran “${snippet.title}” in the terminal.`
          : `Inserted “${snippet.title}” in the terminal.`
        : "Opening a terminal. The command is sent once the session is ready.",
    );
  }

  async function copy(snippet: Snippet) {
    try {
      await navigator.clipboard.writeText(snippet.command);
      setNotice(`Copied “${snippet.title}”.`);
    } catch {
      setNotice("Copy is not available here.");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !draft.title.trim() || !draft.command.trim()) return;
    save(draft);
    setDraft(null);
  }

  return (
    <div className="sui-app flex h-full min-h-0 overflow-hidden">
      <aside className="sui-sidebar flex w-[176px] shrink-0 flex-col gap-0.5 px-3 py-4 text-[13px]">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] sui-muted">
          Snippets
        </p>
        {[["", "All"], ...groups.map((name) => [name, name])].map(([id, label]) => (
          <button
            key={id || "all"}
            type="button"
            aria-current={group === id ? "page" : undefined}
            onClick={() => setGroup(id)}
            className={`truncate rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              group === id ? "sui-selected" : "sui-title hover:bg-white/8"
            }`}
          >
            {label}
          </button>
        ))}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="sui-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <input
              aria-label="Search snippets"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="w-full rounded-md border border-white/15 bg-white/5 py-1.5 pr-3 pl-8 text-sm sui-title outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            />
          </div>
          <button
            type="button"
            onClick={() => setDraft({ ...EMPTY, group })}
            className="flex items-center gap-1.5 rounded-md bg-[var(--toggle-active)] px-3 py-1.5 text-sm text-[var(--toggle-active-fg)]"
          >
            <Plus className="size-4" />
            New snippet
          </button>
        </div>

        {notice ? (
          <p className="sui-muted mt-2 text-[12px]" role="status">
            {notice}
          </p>
        ) : null}

        {draft ? (
          <form
            onSubmit={submit}
            aria-label="Snippet editor"
            className="sui-card mt-4 space-y-3 rounded-[14px] p-4"
          >
            <div className="flex gap-3">
              <label className="min-w-0 flex-1 text-[12px] sui-muted">
                Title
                <input
                  autoFocus
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  className="mt-1 w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm sui-title outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                />
              </label>
              <label className="w-40 text-[12px] sui-muted">
                Group
                <input
                  value={draft.group}
                  list="snippet-groups"
                  onChange={(event) => setDraft({ ...draft, group: event.target.value })}
                  className="mt-1 w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm sui-title outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                />
                <datalist id="snippet-groups">
                  {groups.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>
            </div>
            <label className="block text-[12px] sui-muted">
              Command
              <textarea
                value={draft.command}
                onChange={(event) => setDraft({ ...draft, command: event.target.value })}
                rows={3}
                spellCheck={false}
                className="mt-1 w-full resize-y rounded-md border border-white/15 bg-white/5 px-2 py-1.5 font-mono text-[12px] sui-title outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm sui-title hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!draft.title.trim() || !draft.command.trim()}
                className="rounded-md bg-[var(--toggle-active)] px-3 py-1.5 text-sm text-[var(--toggle-active-fg)] disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        ) : null}

        <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto" aria-label="Snippets">
          {visible.map((snippet) => (
            <li
              key={snippet.id}
              className="sui-card flex items-center gap-3 rounded-[12px] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium sui-title">{snippet.title}</p>
                <code className="sui-muted block truncate font-mono text-[12px]">
                  {snippet.command}
                </code>
              </div>
              <RowButton
                label={`Insert ${snippet.title}`}
                onClick={() => toTerminal(snippet, false)}
              >
                <CornerDownLeft className="size-3.5" />
              </RowButton>
              <RowButton label={`Run ${snippet.title}`} onClick={() => toTerminal(snippet, true)}>
                <Play className="size-3.5" />
              </RowButton>
              <RowButton label={`Copy ${snippet.title}`} onClick={() => void copy(snippet)}>
                <Copy className="size-3.5" />
              </RowButton>
              <RowButton label={`Edit ${snippet.title}`} onClick={() => setDraft({ ...snippet })}>
                <Pencil className="size-3.5" />
              </RowButton>
              <RowButton label={`Delete ${snippet.title}`} onClick={() => remove(snippet.id)}>
                <Trash2 className="size-3.5" />
              </RowButton>
            </li>
          ))}
          {visible.length === 0 ? (
            <li className="sui-muted py-8 text-center text-sm">
              No snippets here.{" "}
              <button type="button" className="underline" onClick={reset}>
                Restore the starter set
              </button>
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function RowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 sui-title outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      {children}
    </button>
  );
}
