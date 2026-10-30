export const APP_IDS = [
  "servers",
  "dashboard",
  "files",
  "terminal",
  "editor",
  "applications",
  "domains",
  "databases",
  "snippets",
  "settings",
] as const;

export type DockAppId = (typeof APP_IDS)[number];
export type AppId = DockAppId | "about" | "viewer";

/** Apps that stay in the catalog but are not shown on the dock. */
export const DOCK_HIDDEN_IDS: ReadonlySet<DockAppId> = new Set([
  "applications",
  "domains",
  "databases",
]);

export function visibleDockOrder(order: readonly DockAppId[]): DockAppId[] {
  return order.filter((id) => !DOCK_HIDDEN_IDS.has(id));
}

export type WindowChrome = "light" | "dark";

export const APP_META: Record<
  AppId,
  {
    title: string;
    width: number;
    height: number;
    available: boolean;
    chrome: WindowChrome;
    /** The app draws the traffic lights and drag region itself (Finder style). */
    unifiedTitlebar?: boolean;
  }
> = {
  servers: {
    title: "Servers",
    width: 1080,
    height: 700,
    available: true,
    chrome: "light",
    unifiedTitlebar: true,
  },
  dashboard: {
    title: "System Monitor",
    width: 1120,
    height: 720,
    available: true,
    chrome: "dark",
  },
  files: {
    title: "Files",
    width: 900,
    height: 600,
    available: true,
    chrome: "light",
    unifiedTitlebar: true,
  },
  terminal: {
    title: "Terminal",
    width: 800,
    height: 480,
    available: true,
    chrome: "dark",
  },
  editor: {
    title: "Editor",
    width: 760,
    height: 560,
    available: false,
    chrome: "dark",
  },
  applications: {
    title: "Applications",
    width: 480,
    height: 520,
    available: false,
    chrome: "light",
  },
  domains: {
    title: "Domains",
    width: 850,
    height: 550,
    available: false,
    chrome: "light",
  },
  databases: {
    title: "Databases",
    width: 950,
    height: 600,
    available: false,
    chrome: "light",
  },
  snippets: {
    title: "Snippets",
    width: 820,
    height: 540,
    available: true,
    chrome: "light",
  },
  settings: {
    title: "Settings",
    width: 750,
    height: 550,
    available: true,
    chrome: "light",
  },
  about: {
    title: "About",
    width: 740,
    height: 680,
    available: true,
    chrome: "dark",
  },
  viewer: {
    title: "Viewer",
    width: 880,
    height: 620,
    available: true,
    chrome: "light",
  },
};
