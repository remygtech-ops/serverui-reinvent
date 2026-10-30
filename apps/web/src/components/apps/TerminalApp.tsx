"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { Plus, X } from "lucide-react";
import type { WindowPayload } from "@/src/components/window/window-context";
import { wsUrl } from "@/src/lib/api/origin";
import { getInjectedDesktopConfig, localAuthWSProtocols } from "@/src/lib/runtime/config";
import { ServerIcon } from "@/src/components/servers/ServerIcon";
import { useSession } from "@/src/lib/session";
import { isSampleServer } from "@/src/lib/sample-servers";
import type { Server } from "@/src/lib/servers";

function quotePath(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

const MAX_AUTO_RETRIES = 4;

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
  const termRef = useRef<{ cols: number; rows: number } | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const retries = useRef(0);
  const serverId = server.id;
  const serverName = server.name;

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
    let retryTimer: number | undefined;
    let socket: WebSocket | null = null;
    let terminal: import("@xterm/xterm").Terminal | null = null;
    let observer: ResizeObserver | null = null;

    // A dropped session reconnects on its own a few times (1.5s, 3s, 4.5s...) before asking the user.
    function scheduleRetry() {
      if (disposed || retryTimer !== undefined || retries.current >= MAX_AUTO_RETRIES) return false;
      retries.current += 1;
      const attempt = retries.current;
      setStatus("connecting");
      setError(`Connection lost. Reconnecting (${attempt}/${MAX_AUTO_RETRIES})…`);
      retryTimer = window.setTimeout(() => setNonce((value) => value + 1), 1500 * attempt);
      return true;
    }

    async function connect() {
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
        if (disposed || !host.current) return;

        terminal = new Terminal({
          cursorBlink: true,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          theme: {
            background: "#00000000",
            foreground: "#d7ffd9",
            cursor: "#5fff6a",
          },
        });
        const fitAddon = new FitAddon();
        fitRef.current = fitAddon;
        termRef.current = terminal;
        terminal.loadAddon(fitAddon);
        terminal.open(host.current);
        fitAddon.fit();

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
          retries.current = 0;
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
          if (scheduleRetry()) return;
          setError("Terminal disconnected. Reconnect when the server is available.");
          setStatus("disconnected");
        };
        socket.onclose = () => {
          window.clearTimeout(timeout);
          if (disposed) return;
          if (scheduleRetry()) return;
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
      window.clearTimeout(retryTimer);
      observer?.disconnect();
      socket?.close();
      socketRef.current = null;
      fitRef.current = null;
      termRef.current = null;
      terminal?.dispose();
    };
  }, [nonce, server.connected, serverId]);

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

  return (
    <div className={active ? "absolute inset-0 flex flex-col text-[#5fff6a]" : "hidden"}>
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-white/70">
        <span>
          {status === "connecting"
            ? error || `Connecting to ${serverName}…`
            : status === "connected"
              ? `Connected to ${serverName}`
              : error || "Terminal disconnected"}
        </span>
        {status !== "connected" ? (
          <button
            type="button"
            className="rounded-md bg-white/10 px-2 py-1 text-white outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-emerald-400"
            onClick={() => {
              retries.current = 0;
              setStatus("connecting");
              setError(null);
              setNonce((value) => value + 1);
            }}
          >
            Reconnect
          </button>
        ) : null}
      </div>
      <div ref={host} className="min-h-0 flex-1 px-2 pb-2" />
    </div>
  );
}
