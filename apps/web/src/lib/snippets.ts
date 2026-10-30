"use client";

import { useMemo, useSyncExternalStore } from "react";

export type Snippet = {
  id: string;
  title: string;
  command: string;
  group: string;
};

const KEY = "serverui-snippets";
const EVENT = "serverui-snippets-changed";

/** Starter set so the app is useful on first launch. Deleting them is fine. */
export const DEFAULT_SNIPPETS: Snippet[] = [
  { id: "d-df", title: "Disk usage", command: "df -h", group: "System" },
  { id: "d-free", title: "Memory usage", command: "free -h", group: "System" },
  { id: "d-uptime", title: "Uptime and load", command: "uptime", group: "System" },
  {
    id: "d-top",
    title: "Top processes by CPU",
    command: "ps aux --sort=-%cpu | head -n 15",
    group: "System",
  },
  { id: "d-ports", title: "Listening ports", command: "ss -tulpn", group: "Network" },
  { id: "d-ip", title: "IP addresses", command: "ip -br a", group: "Network" },
  { id: "d-failed", title: "Failed services", command: "systemctl --failed", group: "Services" },
  {
    id: "d-journal",
    title: "Recent errors",
    command: "journalctl -p err -n 50 --no-pager",
    group: "Services",
  },
  { id: "d-dps", title: "Running containers", command: "docker ps", group: "Docker" },
  {
    id: "d-dlogs",
    title: "Container logs",
    command: "docker logs --tail 100 -f CONTAINER",
    group: "Docker",
  },
];

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

export function parseSnippets(raw: string): Snippet[] {
  if (!raw) return DEFAULT_SNIPPETS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_SNIPPETS;
    const out: Snippet[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Partial<Snippet>;
      if (typeof row.id !== "string" || typeof row.title !== "string") continue;
      if (typeof row.command !== "string") continue;
      out.push({
        id: row.id,
        title: row.title.slice(0, 80),
        command: row.command.slice(0, 4000),
        group: typeof row.group === "string" ? row.group.slice(0, 40) : "",
      });
    }
    return out;
  } catch {
    return DEFAULT_SNIPPETS;
  }
}

function write(next: Snippet[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Ignore private-mode storage failures.
  }
  emit();
}

export function useSnippets() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const snippets = useMemo(() => parseSnippets(raw), [raw]);

  return {
    snippets,
    save(input: Omit<Snippet, "id"> & { id?: string }) {
      const current = parseSnippets(readRaw());
      const snippet: Snippet = {
        id: input.id ?? crypto.randomUUID(),
        title: input.title.trim(),
        command: input.command,
        group: input.group.trim(),
      };
      const exists = current.some((item) => item.id === snippet.id);
      write(
        exists
          ? current.map((item) => (item.id === snippet.id ? snippet : item))
          : [...current, snippet],
      );
      return snippet;
    },
    remove(id: string) {
      write(parseSnippets(readRaw()).filter((item) => item.id !== id));
    },
    reset() {
      write(DEFAULT_SNIPPETS);
    },
  };
}
