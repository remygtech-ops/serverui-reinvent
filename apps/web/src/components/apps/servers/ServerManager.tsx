"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerGroups } from "@/src/lib/server-groups";
import {
  Copy,
  Globe,
  KeyRound,
  LayoutGrid,
  LayoutList,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Square,
  User,
  Wifi,
} from "lucide-react";
import { BrandMark } from "@/src/components/brand/BrandMark";
import { ServerIcon } from "@/src/components/servers/ServerIcon";
import { DEFAULT_SERVER_ICON } from "@/src/lib/server-icons";
import { MenuList, type MenuEntry } from "@/src/components/apps/files/FileContextMenu";
import { AddServerModal } from "@/src/components/server-selection/AddServerModal";
import type { ServerWindowActions } from "@/src/components/server-selection/ServerSelection";
import {
  PageLayer,
  TitlebarTrafficLights,
  useTitlebarProps,
} from "@/src/components/window/window-chrome";
import { ApiError } from "@/src/lib/api/client";
import { formatConnectionTestMessage, formatFriendly, friendlyError } from "@/src/lib/errors";
import { formatApiError, useSession } from "@/src/lib/session";
import {
  connectionStatus,
  type NewServerInput,
  type Server,
  type ServerStatus,
} from "@/src/lib/servers";

type SortKey = "name" | "status";
type ViewMode = "list" | "grid";
type DetailTab = "general" | "authentication";

const STATUS_RANK: Record<ServerStatus, number> = {
  online: 0,
  connecting: 1,
  reconnecting: 2,
  authentication_failed: 3,
  error: 4,
  unknown: 5,
  offline: 6,
};

export function ServerManager({ actions }: { actions: ServerWindowActions }) {
  const {
    servers,
    addServer,
    updateServer,
    deleteServer,
    testConnection,
    loadingServers,
    serversError,
    refreshServers,
  } = useSession();
  const titlebar = useTitlebarProps();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [groupFilter, setGroupFilter] = useState("");
  const { groups, names: groupNames, setGroup } = useServerGroups();
  const [view, setView] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("general");
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftIconId, setDraftIconId] = useState(DEFAULT_SERVER_ICON);
  const [draftPreview, setDraftPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<Server | null>(null);
  const [deleting, setDeleting] = useState<Server | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = servers.filter((server) => {
      if (groupFilter && (groups[server.id] ?? "") !== groupFilter) return false;
      if (!needle) return true;
      const host = `${server.username || ""}@${server.address} ${server.address} ${server.name}`;
      return host.toLowerCase().includes(needle);
    });
    return [...filtered].sort((a, b) => {
      // Grouped servers come first, by group name; ungrouped ones follow.
      const ga = groups[a.id] ?? "";
      const gb = groups[b.id] ?? "";
      if (ga !== gb) return ga === "" ? 1 : gb === "" ? -1 : ga.localeCompare(gb);
      if (sort === "status") {
        const rank = STATUS_RANK[connectionStatus(a)] - STATUS_RANK[connectionStatus(b)];
        if (rank !== 0) return rank;
      }
      return a.name.localeCompare(b.name);
    });
  }, [groupFilter, groups, query, servers, sort]);

  const selected = visible.find((server) => server.id === selectedId) ?? visible[0] ?? null;
  const selectedStatus = selected ? connectionStatus(selected) : "offline";

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  async function onAdd(input: NewServerInput, options?: { connect?: boolean }) {
    setFormBusy(true);
    setFormError(null);
    try {
      const created = await addServer(input);
      setAdding(false);
      setSelectedId(created.id);
      if (options?.connect) actions.connect(created);
    } catch (err) {
      setFormError(formatFriendly(friendlyError(err, "Unable to add server.")));
    } finally {
      setFormBusy(false);
    }
  }

  async function onEdit(input: NewServerInput) {
    if (!editing) return;
    setFormBusy(true);
    setFormError(null);
    try {
      await updateServer(editing.id, input);
      setEditing(null);
    } catch (err) {
      setFormError(
        err instanceof ApiError && err.status === 404
          ? "This server no longer exists. Close this form and refresh the list."
          : formatFriendly(friendlyError(err, "Unable to update server.")),
      );
    } finally {
      setFormBusy(false);
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteServer(deleting.id);
      if (selectedId === deleting.id) setSelectedId(null);
      setDeleting(null);
    } catch (err) {
      setDeleteError(formatApiError(err, "Unable to delete server."));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onTest(id: string) {
    setTestingId(id);
    setTestMessage((current) => ({ ...current, [id]: "Connecting…" }));
    try {
      const result = await testConnection(id);
      setTestMessage((current) => ({
        ...current,
        [id]: formatConnectionTestMessage(result.ok, result.latencyMs, result.error),
      }));
    } catch (err) {
      setTestMessage((current) => ({
        ...current,
        [id]: formatConnectionTestMessage(
          false,
          undefined,
          formatApiError(err, "Connection failed"),
        ),
      }));
    } finally {
      setTestingId(null);
    }
  }

  function openMenu(server: Server, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    setMenu({
      id: server.id,
      x: Math.min(rect.right - 180, window.innerWidth - 220),
      y: Math.min(rect.bottom + 6, window.innerHeight - 220),
    });
  }

  function selectServer(id: string) {
    setAdding(false);
    setEditing(null);
    setDraftName("");
    setDraftIconId(DEFAULT_SERVER_ICON);
    setDraftPreview(null);
    setFormError(null);
    setSelectedId(id);
    setTab("general");
  }

  function startAdd() {
    if (adding) return;
    setEditing(null);
    setFormError(null);
    setDraftName("");
    setDraftIconId(DEFAULT_SERVER_ICON);
    setDraftPreview(null);
    setView("list");
    setAdding(true);
  }

  function startEdit(server: Server) {
    if (editing?.id === server.id) return;
    setAdding(false);
    setFormError(null);
    setDraftName(server.name);
    setDraftIconId(server.iconId || DEFAULT_SERVER_ICON);
    setDraftPreview(null);
    setView("list");
    setEditing(server);
  }

  function cancelDraft() {
    setAdding(false);
    setEditing(null);
    setDraftName("");
    setDraftIconId(DEFAULT_SERVER_ICON);
    setDraftPreview(null);
    setFormError(null);
  }

  async function copyHost(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  const menuServer = servers.find((server) => server.id === menu?.id) ?? null;
  const menuActions: MenuEntry[] = menuServer
    ? [
        { label: "Open Files", run: () => actions.openFiles(menuServer) },
        { label: "Open Terminal", run: () => actions.openTerminal(menuServer) },
        { label: "View Metrics", run: () => actions.openMetrics(menuServer) },
        "separator",
        {
          label: "Delete",
          destructive: true,
          run: () => {
            setDeleteError(null);
            setDeleting(menuServer);
          },
        },
      ]
    : [];

  return (
    <div className="sui-finder relative flex h-full min-h-0 overflow-hidden">
      <aside className="sui-finder-sidebar flex w-[248px] shrink-0 flex-col select-none">
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 px-3.5" {...titlebar}>
          <TitlebarTrafficLights />
          <BrandMark size={22} alt="" />
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold leading-4 tracking-tight">Servers</h2>
            <p className="sui-finder-muted truncate text-[11px] leading-4">
              Manage your Linux servers
            </p>
          </div>
        </div>

        <div className="px-3 pb-2">
          <label className="relative block">
            <span className="sr-only">Search servers</span>
            <Search className="sui-finder-muted pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="sui-finder-search h-[28px] w-full rounded-[8px] pr-2 pl-8 text-[12px] outline-none"
            />
          </label>
          <div className="mt-2 flex items-center gap-1.5">
            <label className="sr-only" htmlFor="server-sort">
              Sort servers
            </label>
            <select
              id="server-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="sui-finder-control h-[28px] min-w-0 flex-1 rounded-[8px] px-2 text-[12px] outline-none"
            >
              <option value="name">Name</option>
              <option value="status">Status</option>
            </select>
            <div
              role="radiogroup"
              aria-label="View"
              className="sui-finder-segment flex shrink-0 rounded-[8px] p-px"
            >
              <ViewButton label="List" active={view === "list"} onClick={() => setView("list")}>
                <LayoutList className="size-3.5" />
              </ViewButton>
              <ViewButton label="Icons" active={view === "grid"} onClick={() => setView("grid")}>
                <LayoutGrid className="size-3.5" />
              </ViewButton>
            </div>
          </div>
          {groupNames.length > 0 ? (
            <div className="mt-2">
              <label className="sr-only" htmlFor="server-group-filter">
                Filter by group
              </label>
              <select
                id="server-group-filter"
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                className="sui-finder-control h-[28px] w-full rounded-[8px] px-2 text-[12px] outline-none"
              >
                <option value="">All groups</option>
                {groupNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2" role="listbox" aria-label="Servers">
          {loadingServers && servers.length === 0 ? (
            <p className="sui-finder-muted px-2 py-6 text-[13px]">Loading servers…</p>
          ) : null}
          {serversError && servers.length === 0 ? (
            <div className="px-2 py-4">
              <p className="text-[13px] font-medium">Unable to load servers.</p>
              <p className="sui-finder-muted mt-1 text-[12px]">
                {friendlyError(serversError, "Unable to load servers.").detail}
              </p>
              <button
                type="button"
                onClick={() => void refreshServers()}
                className="sui-finder-control mt-3 rounded-[8px] px-3 py-1.5 text-[12px]"
              >
                Retry
              </button>
            </div>
          ) : null}
          {!loadingServers && !serversError && servers.length === 0 ? (
            <p className="sui-finder-muted px-2 py-6 text-[13px] leading-5">
              No servers yet. Add one to connect over SSH.
            </p>
          ) : null}
          {!loadingServers && servers.length > 0 && visible.length === 0 ? (
            <p className="sui-finder-muted px-2 py-6 text-[13px]">No servers match that search.</p>
          ) : null}
          <ul className="space-y-px">
            {adding || editing ? (
              <li className="animate-pane-in">
                <div
                  role="option"
                  aria-selected="true"
                  data-active="true"
                  className="sui-finder-nav-item flex cursor-default items-center gap-2 rounded-[7px] px-2 py-[5px]"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center text-current">
                    <ServerIcon
                      iconId={draftIconId}
                      customIcon={Boolean(editing?.customIcon) && draftPreview == null}
                      serverId={editing?.id}
                      updatedAt={editing?.updatedAt}
                      preview={draftPreview}
                      size={22}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">
                      {draftName.trim() || (editing ? editing.name : "New Server")}
                    </span>
                    <span className="sui-finder-muted block truncate text-[11px]">
                      {editing ? "Editing" : "Not saved"}
                    </span>
                  </span>
                </div>
              </li>
            ) : null}
            {visible.map((server, index) => {
              const group = groups[server.id] ?? "";
              const previous = index > 0 ? (groups[visible[index - 1].id] ?? "") : null;
              const heading =
                groupNames.length > 0 && group !== previous ? group || "Ungrouped" : null;
              return (
                <li
                  key={server.id}
                  className="animate-pane-in"
                  style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
                >
                  {heading ? (
                    <p className="sui-finder-muted px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                      {heading}
                    </p>
                  ) : null}
                  <ServerRow
                    server={server}
                    selected={!adding && !editing && selected?.id === server.id}
                    onSelect={() => selectServer(server.id)}
                    onMenu={(anchor) => openMenu(server, anchor)}
                  />
                </li>
              );
            })}
          </ul>
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={startAdd}
            className="sui-finder-control flex h-[32px] w-full items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-medium"
          >
            <Plus className="size-3.5" />
            Add Server
          </button>
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--finder-content)]">
        <div
          className="sui-finder-toolbar flex h-[52px] shrink-0 items-center gap-2 px-4"
          {...titlebar}
        >
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold">
            {adding || editing
              ? draftName.trim() || (editing ? editing.name : "New Server")
              : (selected?.name ?? "Servers")}
          </h3>
          {selected && !adding && !editing ? (
            <>
              <button
                type="button"
                onClick={() => startEdit(selected)}
                className="sui-finder-control inline-flex h-[28px] items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-medium"
              >
                <Pencil className="size-3.5" />
                Edit
              </button>
              <button
                type="button"
                aria-label={`More actions for ${selected.name}`}
                onClick={(event) => openMenu(selected, event.currentTarget)}
                className="sui-finder-control inline-flex size-[28px] items-center justify-center rounded-[8px]"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </>
          ) : null}
        </div>

        <div
          className={`min-h-0 flex-1 p-5 ${
            adding || editing ? "flex flex-col overflow-hidden" : "overflow-auto"
          }`}
        >
          {adding || editing ? (
            <AddServerModal
              key={editing ? `edit-${editing.id}` : "add"}
              layout="pane"
              server={editing}
              busy={formBusy}
              error={formError}
              connectAfterSave={adding && servers.length === 0}
              onNameChange={setDraftName}
              onAppearanceChange={({ iconId: nextId, preview }) => {
                setDraftIconId(nextId);
                setDraftPreview(preview);
              }}
              onClose={cancelDraft}
              onSubmit={editing ? onEdit : onAdd}
            />
          ) : selected && view === "grid" ? (
            <div
              key="icons"
              className="animate-pane-in grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3"
            >
              {visible.map((server) => (
                <IconTile
                  key={server.id}
                  server={server}
                  selected={selected.id === server.id}
                  onSelect={() => selectServer(server.id)}
                />
              ))}
            </div>
          ) : selected ? (
            <div
              key={`${selected.id}:${tab}`}
              className="animate-pane-in mx-auto flex max-w-3xl flex-col"
            >
              <header className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center">
                  <ServerIcon
                    iconId={selected.iconId}
                    customIcon={selected.customIcon}
                    serverId={selected.id}
                    updatedAt={selected.updatedAt}
                    size={36}
                  />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <StatusPill status={selectedStatus} />
                  <p className="sui-finder-muted mt-1 truncate text-[13px]">{selected.address}</p>
                  {selectedStatus === "online" ? (
                    <p className="sui-finder-muted mt-1 text-[12px]">
                      {selected.metricsError
                        ? selected.metricsError
                        : `CPU ${pct(selected.cpuUsage)} · Memory ${pct(selected.memoryUsage)} · Disk ${pct(selected.diskUsage)}`}
                      {typeof selected.latencyMs === "number" ? ` · ${selected.latencyMs} ms` : ""}
                    </p>
                  ) : selected.error ? (
                    <p className="mt-1 text-[12px] text-red-500">{selected.error}</p>
                  ) : null}
                </div>
              </header>

              <div
                className="sui-finder-segment mt-5 inline-flex w-fit rounded-[8px] p-px"
                role="tablist"
                aria-label="Server details"
              >
                <TabButton active={tab === "general"} onClick={() => setTab("general")}>
                  General
                </TabButton>
                <TabButton
                  active={tab === "authentication"}
                  onClick={() => setTab("authentication")}
                >
                  Authentication
                </TabButton>
              </div>

              <div className="mt-4">
                {tab === "general" ? (
                  <>
                    <div className="overflow-hidden rounded-[10px] border border-[var(--finder-hairline)] bg-[color-mix(in_srgb,var(--finder-toolbar)_86%,transparent)]">
                      <Field
                        icon={<User className="size-4" />}
                        label="Server Name"
                        value={selected.name}
                      />
                      <Field
                        icon={<Globe className="size-4" />}
                        label="Host / IP"
                        value={selected.address}
                        action={
                          <button
                            type="button"
                            aria-label="Copy host"
                            onClick={() => void copyHost(selected.address)}
                            className="sui-finder-plain-button rounded-[6px] p-1.5"
                          >
                            <Copy className="size-3.5" />
                            <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
                          </button>
                        }
                      />
                      <Field
                        label="SSH Port"
                        value={String(selected.sshPort || 22)}
                        icon={<Wifi className="size-4" />}
                      />
                      <Field
                        icon={<User className="size-4" />}
                        label="Username"
                        value={selected.username || "—"}
                      />
                      <Field
                        icon={<KeyRound className="size-4" />}
                        label="Authentication"
                        value={authLabel(selected.authType)}
                        last
                      />
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <label htmlFor="server-group" className="sui-finder-muted w-24 text-[12px]">
                        Group
                      </label>
                      <input
                        id="server-group"
                        key={selected.id}
                        list="server-group-names"
                        defaultValue={groups[selected.id] ?? ""}
                        onBlur={(event) => setGroup(selected.id, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                        placeholder="No group"
                        className="sui-finder-search h-[28px] w-56 rounded-[8px] px-2.5 text-[12px] outline-none"
                      />
                      <datalist id="server-group-names">
                        {groupNames.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                    </div>
                  </>
                ) : (
                  <div className="rounded-[10px] border border-[var(--finder-hairline)] bg-[color-mix(in_srgb,var(--finder-toolbar)_86%,transparent)] px-4 py-4">
                    <p className="text-[13px]">
                      Method: <span className="font-medium">{authLabel(selected.authType)}</span>
                    </p>
                    <p className="sui-finder-muted mt-2 max-w-md text-[13px] leading-5">
                      The password or private key is encrypted and is not shown here. Enter it again
                      only when you want to replace it.
                    </p>
                    <button
                      type="button"
                      onClick={() => startEdit(selected)}
                      className="sui-finder-control mt-4 rounded-[8px] px-3 py-1.5 text-[12px] font-medium"
                    >
                      Change credentials
                    </button>
                  </div>
                )}
                {testMessage[selected.id] ? (
                  <p className="sui-finder-muted mt-3 text-[12px]" role="status">
                    {testMessage[selected.id]}
                  </p>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {selectedStatus === "online" ? (
                  <button
                    type="button"
                    onClick={() => actions.disconnect(selected)}
                    className="inline-flex h-[32px] items-center justify-center gap-2 rounded-[8px] border border-red-500/35 px-3 text-[13px] font-medium text-red-500 transition hover:bg-red-500/10"
                  >
                    <Square className="size-3.5 fill-current" />
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={selectedStatus === "connecting" || selectedStatus === "reconnecting"}
                    onClick={() => actions.connect(selected)}
                    className="inline-flex h-[32px] items-center justify-center gap-2 rounded-[8px] bg-[var(--finder-accent)] px-3.5 text-[13px] font-medium text-white transition hover:brightness-110 disabled:opacity-60"
                  >
                    {selectedStatus === "connecting" || selectedStatus === "reconnecting"
                      ? "Connecting…"
                      : "Connect"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => actions.reconnect(selected)}
                  disabled={selectedStatus === "connecting" || selectedStatus === "reconnecting"}
                  className="sui-finder-control inline-flex h-[32px] items-center justify-center gap-2 rounded-[8px] px-3 text-[13px] disabled:opacity-60"
                >
                  <RefreshCw className="size-3.5" />
                  Reconnect
                </button>
                <button
                  type="button"
                  onClick={() => void onTest(selected.id)}
                  disabled={testingId === selected.id}
                  className="sui-finder-control inline-flex h-[32px] items-center justify-center gap-2 rounded-[8px] px-3 text-[13px] disabled:opacity-60"
                >
                  <Wifi className="size-3.5" />
                  {testingId === selected.id ? "Testing…" : "Test Connection"}
                </button>
              </div>
            </div>
          ) : (
            <div className="sui-finder-muted flex h-full items-center justify-center rounded-[12px] border border-dashed border-[var(--finder-hairline)] text-[13px]">
              Select a server, or add your first one.
            </div>
          )}
        </div>
      </section>

      {menu && menuServer ? (
        <PageLayer>
          <div onPointerDown={(event) => event.stopPropagation()}>
            <MenuList
              label={`${menuServer.name} actions`}
              actions={menuActions}
              onClose={() => setMenu(null)}
              className="fixed"
              style={{ left: menu.x, top: menu.y }}
            />
          </div>
        </PageLayer>
      ) : null}

      {deleting ? (
        <div
          className="animate-overlay-in absolute inset-0 z-[30] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleteBusy) setDeleting(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="sui-finder animate-sheet-in w-full max-w-[400px] rounded-[12px] border border-[var(--finder-hairline)] bg-[var(--finder-toolbar)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
          >
            <h2 className="text-[15px] font-semibold">Delete “{deleting.name}”?</h2>
            <p className="sui-finder-muted mt-2 text-[13px] leading-6">
              This removes the saved server and its encrypted credentials. The remote machine is not
              changed.
            </p>
            {deleteError ? (
              <p className="mt-3 text-[12px] text-red-500" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="sui-finder-plain-button rounded-[8px] px-3 py-1.5 text-[13px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={deleteBusy}
                className="rounded-[8px] bg-red-500 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {deleteBusy ? "Deleting…" : "Delete Server"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ServerRow({
  server,
  selected,
  onSelect,
  onMenu,
}: {
  server: Server;
  selected: boolean;
  onSelect: () => void;
  onMenu: (anchor: HTMLElement) => void;
}) {
  const status = connectionStatus(server);
  return (
    <div
      role="option"
      aria-selected={selected}
      data-active={selected}
      onClick={onSelect}
      className="sui-finder-nav-item group flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-[5px]"
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="flex size-7 shrink-0 items-center justify-center text-current">
          <ServerIcon
            iconId={server.iconId}
            customIcon={server.customIcon}
            serverId={server.id}
            updatedAt={server.updatedAt}
            size={22}
          />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <StatusDot status={status} />
            <span className="truncate text-[13px]">{server.name}</span>
          </span>
          <span className="sui-finder-muted mt-px block truncate pl-3 text-[11px]">
            {server.address}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`More actions for ${server.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onMenu(event.currentTarget);
        }}
        className="sui-finder-plain-button rounded-[6px] p-1 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
      >
        <MoreHorizontal className="size-3.5" />
      </button>
    </div>
  );
}

function IconTile({
  server,
  selected,
  onSelect,
}: {
  server: Server;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-active={selected}
      className="flex flex-col items-center gap-2 rounded-[12px] px-3 py-4 text-center outline-none transition hover:bg-[var(--finder-nav-hover)] focus-visible:ring-2 focus-visible:ring-[var(--finder-accent)] data-[active=true]:bg-[var(--finder-nav-active)]"
    >
      <span className="flex size-12 items-center justify-center">
        <ServerIcon
          iconId={server.iconId}
          customIcon={server.customIcon}
          serverId={server.id}
          updatedAt={server.updatedAt}
          size={44}
        />
      </span>
      <span className="w-full truncate text-[12px] font-medium">{server.name}</span>
      <span className="sui-finder-muted w-full truncate text-[11px]">{server.address}</span>
    </button>
  );
}

function StatusDot({ status }: { status: ServerStatus }) {
  const color =
    status === "online"
      ? "bg-emerald-500"
      : status === "connecting" || status === "reconnecting"
        ? "bg-amber-400"
        : status === "authentication_failed" || status === "error"
          ? "bg-red-500"
          : "bg-zinc-400";
  return <span className={`size-1.5 shrink-0 rounded-full ${color}`} aria-hidden />;
}

function StatusPill({ status }: { status: ServerStatus }) {
  const label =
    status === "online"
      ? "Connected"
      : status === "connecting"
        ? "Connecting"
        : status === "reconnecting"
          ? "Reconnecting"
          : status === "authentication_failed"
            ? "Authentication failed"
            : status === "error"
              ? "Connection error"
              : "Disconnected";
  const tone =
    status === "online"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
      : status === "connecting" || status === "reconnecting"
        ? "bg-amber-400/15 text-amber-700 dark:text-amber-200"
        : status === "authentication_failed" || status === "error"
          ? "bg-red-500/12 text-red-600 dark:text-red-300"
          : "bg-black/6 text-[var(--finder-muted)] dark:bg-white/8";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      <StatusDot status={status} />
      {label}
    </span>
  );
}

function Field({
  icon,
  label,
  value,
  action,
  last,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  action?: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 ${last ? "" : "border-b border-[var(--finder-hairline)]"}`}
    >
      <span className="sui-finder-muted">{icon}</span>
      <span className="sui-finder-muted w-36 shrink-0 text-[13px]">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[13px]">{value}</span>
      {action}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active}
      onClick={onClick}
      className="sui-finder-segment-button rounded-[6px] px-3 py-1 text-[12px] font-medium transition"
    >
      {children}
    </button>
  );
}

function ViewButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-label={label}
      aria-checked={active}
      data-active={active}
      onClick={onClick}
      className="sui-finder-segment-button flex size-[26px] items-center justify-center rounded-[6px] transition"
    >
      {children}
    </button>
  );
}

function authLabel(authType: Server["authType"]) {
  return authType === "private_key" ? "SSH Key" : "Password";
}

function pct(value: number | undefined) {
  return typeof value === "number" ? `${Math.round(value)}%` : "—";
}
