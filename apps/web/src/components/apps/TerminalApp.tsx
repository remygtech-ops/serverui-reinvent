"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";
import type { WindowPayload } from "@/src/components/window/window-context";
import { wsUrl } from "@/src/lib/api/origin";
import { getInjectedDesktopConfig, localAuthWSProtocols } from "@/src/lib/runtime/config";
import { ServerIcon } from "@/src/components/servers/ServerIcon";
import { useSession } from "@/src/lib/session";
import { listenForTerminalInput, takePendingTerminalInput } from "@/src/lib/terminal-bus";
import { isSampleServer } from "@/src/lib/sample-servers";
import type { Server } from "@/src/lib/servers";
import {
  FONT_FAMILIES,
  clampFontSize,
  useTerminalPrefs,
  writeTerminalPrefs,
  type TerminalPrefs,
} from "@/src/lib/terminal-prefs";
import { getTerminalTheme } from "@/src/lib/terminal-themes";
import { installPromptHighlight } from "@/src/lib/terminal-prompt";

function quotePath(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

type Tab = {
  id: string;
  serverId: string;
  cwd?: string;
};

function makeTab(serverId: string, cwd?: string): Tab {
  return { id: `${serverId}:${crypto.randomUUID()}`, serverId, cwd };
}

/** Live SSH sessions first, then preview hosts that the app marks connected. */
function openableServers(servers: Server[]) {
  const live = servers.filter((server) => server.connected === true && !isSampleServer(server.id));
  const preview = servers.filter(
    (server) => server.connected === true && isSampleServer(server.id),
  );
  return [...live, ...preview];
}

export function TerminalApp({ payload }: { payload?: WindowPayload }) {
  const { servers, connectServer } = useSession();
  const connected = openableServers(servers);
  const payloadKey = `${payload?.serverId ?? ""}:${payload?.cwd ?? ""}`;
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  if (openedKey === null && connected.length > 0) {
    const preferred = connected.find((server) => server.id === payload?.serverId) ?? connected[0];
    const tab = makeTab(
      preferred.id,
      preferred.id === payload?.serverId ? payload?.cwd : undefined,
    );
    setTabs([tab]);
    setActiveId(tab.id);
    setOpenedKey(payloadKey);
  } else if (openedKey !== null && payloadKey !== openedKey && payload?.serverId) {
    if (connected.some((server) => server.id === payload.serverId)) {
      const tab = makeTab(payload.serverId, payload.cwd);
      setTabs((current) => [...current, tab]);
      setActiveId(tab.id);
    }
    setOpenedKey(payloadKey);
  }

  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  function addTab(serverId: string) {
    const tab = makeTab(serverId);
    setTabs((current) => [...current, tab]);
    setActiveId(tab.id);
    setPickerOpen(false);
  }

  function closeTab(id: string) {
    setTabs((current) => current.filter((tab) => tab.id !== id));
    setActiveId((active) => {
      if (active !== id) return active;
      const index = tabs.findIndex((tab) => tab.id === id);
      const next = tabs.filter((tab) => tab.id !== id);
      return next[Math.min(index, next.length - 1)]?.id ?? null;
    });
  }

  return (
    <div className="sui-terminal flex h-full min-h-0 flex-col text-[#d7ffd9]">
      <div className="relative z-20 flex h-10 shrink-0 items-end gap-1 overflow-visible border-b border-white/10 bg-black/30 px-2">
        <div className="flex min-w-0 items-end gap-0.5 overflow-x-auto">
          {tabs.map((tab) => {
            const server = servers.find((item) => item.id === tab.serverId);
            const active = tab.id === activeId;
            const name = server?.name || "Server";
            return (
              <div
                key={tab.id}
                className={`group flex h-8 max-w-[180px] min-w-[108px] items-center gap-1 rounded-t-[8px] px-2 ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/55 hover:bg-white/6 hover:text-white/80"
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setActiveId(tab.id)}
                >
                  {server ? (
                    <ServerIcon
                      iconId={server.iconId}
                      customIcon={server.customIcon}
                      serverId={server.id}
                      updatedAt={server.updatedAt}
                      size={14}
                    />
                  ) : null}
                  <span className="truncate text-[12px]">{name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Close ${name}`}
                  className="flex size-4 shrink-0 items-center justify-center rounded-full text-white/50 outline-none hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400"
                  onClick={() => closeTab(tab.id)}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
        <div ref={pickerRef} className="relative z-30 mb-1 shrink-0">
          <button
            type="button"
            aria-label="New tab"
            aria-expanded={pickerOpen}
            disabled={connected.length === 0}
            className="flex size-6 items-center justify-center rounded-md text-white/70 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40"
            onClick={() => setPickerOpen((open) => !open)}
          >
            <Plus className="size-3.5" />
          </button>
          {pickerOpen ? (
            <div
              role="menu"
              aria-label="Connected servers"
              className="absolute left-0 top-[calc(100%+6px)] z-30 w-56 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 py-1 shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
            >
              {connected.map((server) => (
                <button
                  key={server.id}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-white/90 outline-none hover:bg-white/8 focus-visible:bg-white/8"
                  onClick={() => addTab(server.id)}
                >
                  <ServerIcon
                    iconId={server.iconId}
                    customIcon={server.customIcon}
                    serverId={server.id}
                    updatedAt={server.updatedAt}
                    size={16}
                  />
                  <span className="truncate">{server.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => {
          const server = servers.find((item) => item.id === tab.serverId);
          if (!server) return null;
          return (
            <TerminalSession
              key={tab.id}
              server={server}
              cwd={tab.cwd}
              active={tab.id === activeId}
              onConnect={() => void connectServer(server.id).catch(() => {})}
            />
          );
        })}
        {tabs.length === 0 ? (
          <div className="flex h-full items-center justify-center px-8 text-center text-[13px] leading-5 text-white/60">
            {connected.length === 0
              ? "Connect a server to open a terminal."
              : "No open sessions. Use + to open a connected server."}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TerminalSession({
  server,
  cwd,
  active,
  onConnect,
}: {
  server: Server;
  cwd?: string;
  active: boolean;
  onConnect: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<{ fit: () => void } | null>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const searchRef = useRef<import("@xterm/addon-search").SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { prefs } = useTerminalPrefs();
  const prefsRef = useRef<TerminalPrefs>(prefs);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const themeDef = getTerminalTheme(prefs.themeId);
  const light = themeDef.id === "solarized-light";
  const transparent = themeDef.theme.background === "#00000000";
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const serverId = server.id;
  const serverName = server.name;

  // Live-apply preference changes (settings preview, zoom) to the open terminal.
  useEffect(() => {
    prefsRef.current = prefs;
    const terminal = termRef.current;
    if (!terminal) return;
    const def = getTerminalTheme(prefs.themeId);
    terminal.options.theme = { ...def.theme };
    terminal.options.fontSize = prefs.fontSize;
    terminal.options.fontFamily = FONT_FAMILIES[prefs.fontFamily].stack;
    terminal.options.cursorStyle = prefs.cursorStyle;
    terminal.options.cursorBlink = prefs.cursorBlink;
    fitRef.current?.fit();
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
    }
  }, [prefs]);

  useEffect(() => {
    if (!active) return;
    const fit = fitRef.current;
    const terminal = termRef.current;
    const socket = socketRef.current;
    if (!fit || !terminal || socket?.readyState !== WebSocket.OPEN) return;
    fit.fit();
    socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
  }, [active]);

  useEffect(() => {
    if (isSampleServer(serverId) || server.connected === false) return;
    const container = host.current;
    if (!container) return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let terminal: import("@xterm/xterm").Terminal | null = null;
    let observer: ResizeObserver | null = null;
    let promptHighlight: { dispose: () => void } | null = null;
    let removeListeners: (() => void) | null = null;

    async function connect() {
      try {
        const [{ Terminal }, { FitAddon }, { SearchAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
          import("@xterm/addon-search"),
        ]);
        if (disposed || !host.current) return;

        const initial = prefsRef.current;
        terminal = new Terminal({
          cursorBlink: initial.cursorBlink,
          cursorStyle: initial.cursorStyle,
          fontFamily: FONT_FAMILIES[initial.fontFamily].stack,
          fontSize: initial.fontSize,
          theme: { ...getTerminalTheme(initial.themeId).theme },
          allowTransparency: true,
        });
        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        fitRef.current = fitAddon;
        searchRef.current = searchAddon;
        termRef.current = terminal;
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(searchAddon);
        terminal.open(host.current);
        fitAddon.fit();
        promptHighlight = installPromptHighlight(terminal, {
          enabled: () => prefsRef.current.highlightPrompt,
          colors: () => {
            const def = getTerminalTheme(prefsRef.current.themeId);
            return { user: def.promptUser, path: def.promptPath };
          },
        });

        const term = terminal;
        const copySelection = () => {
          const text = term.getSelection();
          if (text) void navigator.clipboard?.writeText(text).catch(() => {});
        };
        const pasteClipboard = () => {
          void navigator.clipboard
            ?.readText()
            .then((text) => text && term.paste(text))
            .catch(() => {});
        };
        term.attachCustomKeyEventHandler((event) => {
          if (event.type !== "keydown") return true;
          const mod = event.ctrlKey || event.metaKey;
          if (!mod) return true;
          const size = prefsRef.current.fontSize;
          if (!event.shiftKey || event.key === "+") {
            if (event.key === "=" || event.key === "+") {
              event.preventDefault();
              writeTerminalPrefs({ fontSize: clampFontSize(size + 1) });
              return false;
            }
            if (event.key === "-" || event.key === "_") {
              event.preventDefault();
              writeTerminalPrefs({ fontSize: clampFontSize(size - 1) });
              return false;
            }
            if (event.key === "0" && !event.shiftKey) {
              event.preventDefault();
              writeTerminalPrefs({ fontSize: 13 });
              return false;
            }
          }
          if (event.shiftKey && event.key.toLowerCase() === "f") {
            event.preventDefault();
            setSearchOpen(true);
            window.setTimeout(() => searchInputRef.current?.focus(), 0);
            return false;
          }
          if (event.shiftKey && event.key.toLowerCase() === "c") {
            event.preventDefault();
            copySelection();
            return false;
          }
          return true;
        });
        const onWheel = (event: WheelEvent) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          const next = prefsRef.current.fontSize + (event.deltaY < 0 ? 1 : -1);
          writeTerminalPrefs({ fontSize: clampFontSize(next) });
        };
        const onContextMenu = (event: MouseEvent) => {
          if (!prefsRef.current.rightClickPaste) return;
          event.preventDefault();
          if (term.hasSelection()) {
            copySelection();
            term.clearSelection();
          } else {
            pasteClipboard();
          }
        };
        const hostEl = host.current;
        hostEl.addEventListener("wheel", onWheel, { passive: false });
        hostEl.addEventListener("contextmenu", onContextMenu);
        removeListeners = () => {
          hostEl.removeEventListener("wheel", onWheel);
          hostEl.removeEventListener("contextmenu", onContextMenu);
        };
        term.onSelectionChange(() => {
          if (prefsRef.current.copyOnSelect && term.hasSelection()) copySelection();
        });

        socket = new WebSocket(
          wsUrl(`/ws/terminal?serverId=${encodeURIComponent(serverId)}`),
          localAuthWSProtocols(getInjectedDesktopConfig()?.localAuthToken),
        );
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;

        const timeout = window.setTimeout(() => {
          if (disposed || socket?.readyState === WebSocket.OPEN) return;
          setError(
            "ServerUI could not open a terminal session. Check the server connection and retry.",
          );
          setStatus("disconnected");
          socket?.close();
        }, 12000);

        socket.onopen = () => {
          window.clearTimeout(timeout);
          if (!terminal) return;
          setStatus("connected");
          setError(null);
          fitAddon.fit();
          socket?.send(
            JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }),
          );
        };

        socket.onmessage = (event) => {
          if (!terminal) return;
          if (typeof event.data === "string") {
            try {
              const message = JSON.parse(event.data) as { type?: string; message?: string };
              if (message.type === "error") {
                setError(
                  message.message
                    ? "Terminal session ended. Reconnect to continue."
                    : "Terminal disconnected",
                );
                setStatus("disconnected");
                return;
              }
            } catch {
              terminal.write(event.data);
            }
            return;
          }
          terminal.write(new Uint8Array(event.data as ArrayBuffer));
        };

        socket.onerror = () => {
          window.clearTimeout(timeout);
          if (disposed) return;
          setError("Terminal disconnected. Reconnect when the server is available.");
          setStatus("disconnected");
        };
        socket.onclose = () => {
          window.clearTimeout(timeout);
          if (disposed) return;
          setStatus("disconnected");
        };

        terminal.onData((data) => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(new TextEncoder().encode(data));
        });

        observer = new ResizeObserver(() => {
          if (!terminal || socket?.readyState !== WebSocket.OPEN) return;
          fitAddon.fit();
          socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
        });
        observer.observe(host.current);
      } catch {
        if (!disposed) {
          setError("Unable to start the terminal. Retry or reopen the window.");
          setStatus("disconnected");
        }
      }
    }

    void connect();

    return () => {
      disposed = true;
      observer?.disconnect();
      removeListeners?.();
      promptHighlight?.dispose();
      socket?.close();
      socketRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      termRef.current = null;
      terminal?.dispose();
    };
  }, [nonce, server.connected, serverId]);

  // Text sent by other apps (Snippets...) goes to the visible session only.
  useEffect(() => {
    if (!active || status !== "connected") return;
    const send = (text: string, run?: boolean) => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(new TextEncoder().encode(run ? `${text}\n` : text));
      return true;
    };
    const queued = takePendingTerminalInput();
    if (queued) send(queued.text, queued.run);
    return listenForTerminalInput((input) => send(input.text, input.run));
  }, [active, status]);

  useEffect(() => {
    if (status !== "connected" || !cwd || !socketRef.current) return;
    socketRef.current.send(new TextEncoder().encode(`cd ${quotePath(cwd)}\n`));
  }, [cwd, status]);

  if (isSampleServer(serverId)) {
    return (
      <div className={active ? "absolute inset-0 flex items-center justify-center p-8" : "hidden"}>
        <p className="max-w-sm text-center text-[13px] leading-5 text-white/60">
          {serverName} is preview data and has no shell. Open a tab on a server with a live SSH
          session.
        </p>
      </div>
    );
  }

  if (server.connected === false) {
    return (
      <div
        className={
          active ? "absolute inset-0 flex flex-col items-start justify-center gap-3 p-8" : "hidden"
        }
      >
        <h2 className="flex items-center gap-2 text-[18px] font-semibold tracking-tight text-white">
          <ServerIcon
            iconId={server.iconId}
            customIcon={server.customIcon}
            serverId={server.id}
            updatedAt={server.updatedAt}
            size={20}
          />
          {serverName} is disconnected
        </h2>
        <button
          type="button"
          onClick={onConnect}
          className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-zinc-900"
        >
          Connect
        </button>
      </div>
    );
  }

  const statusButton = light
    ? "bg-black/10 text-zinc-900 hover:bg-black/15"
    : "bg-white/10 text-white hover:bg-white/15";

  function runSearch(direction: "next" | "previous", term = searchTerm) {
    const addon = searchRef.current;
    if (!addon || !term) return;
    if (direction === "next") addon.findNext(term);
    else addon.findPrevious(term);
  }

  return (
    <div
      className={active ? "absolute inset-0 flex flex-col" : "hidden"}
      style={{
        color: themeDef.theme.foreground,
        background: transparent ? undefined : themeDef.theme.background,
      }}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] opacity-75">
        <span>
          {status === "connecting"
            ? `Connecting to ${serverName}…`
            : status === "connected"
              ? `Connected to ${serverName}`
              : error || "Terminal disconnected"}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="tabular-nums" title="Ctrl +, Ctrl −, Ctrl 0 or Ctrl + mouse wheel">
            {prefs.fontSize}px
          </span>
          <button
            type="button"
            aria-label="Search in terminal"
            title="Search (Ctrl+Shift+F)"
            className={`flex size-6 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${statusButton}`}
            onClick={() => {
              setSearchOpen((open) => !open);
              window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
          >
            <Search className="size-3.5" />
          </button>
          {status !== "connected" ? (
            <button
              type="button"
              className={`rounded-md px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${statusButton}`}
              onClick={() => {
                setStatus("connecting");
                setError(null);
                setNonce((value) => value + 1);
              }}
            >
              Reconnect
            </button>
          ) : null}
        </div>
      </div>
      {searchOpen ? (
        <div
          role="search"
          className="absolute top-10 right-3 z-10 flex items-center gap-1 rounded-lg border border-white/15 bg-zinc-950/90 p-1 text-white shadow-lg"
        >
          <input
            ref={searchInputRef}
            aria-label="Search terminal output"
            value={searchTerm}
            placeholder="Find…"
            className="h-6 w-40 rounded-md bg-white/10 px-2 text-[12px] outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-emerald-400"
            onChange={(event) => {
              setSearchTerm(event.target.value);
              runSearch("next", event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") runSearch(event.shiftKey ? "previous" : "next");
              if (event.key === "Escape") {
                setSearchOpen(false);
                searchRef.current?.clearDecorations();
                termRef.current?.focus();
              }
            }}
          />
          <button
            type="button"
            aria-label="Previous match"
            className="flex size-6 items-center justify-center rounded-md hover:bg-white/10"
            onClick={() => runSearch("previous")}
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next match"
            className="flex size-6 items-center justify-center rounded-md hover:bg-white/10"
            onClick={() => runSearch("next")}
          >
            <ChevronDown className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Close search"
            className="flex size-6 items-center justify-center rounded-md hover:bg-white/10"
            onClick={() => {
              setSearchOpen(false);
              searchRef.current?.clearDecorations();
              termRef.current?.focus();
            }}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      <div ref={host} className="min-h-0 flex-1 px-2 pb-2" />
    </div>
  );
}
