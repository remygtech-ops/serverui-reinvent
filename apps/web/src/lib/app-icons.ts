"use client";

import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Braces,
  Code2,
  Database,
  Eye,
  Folder,
  Globe,
  Info,
  LayoutDashboard,
  Server,
  Settings,
  Terminal,
} from "lucide-react";
import type { AppId } from "@/src/data/apps";

export const APP_ICONS: Record<AppId, LucideIcon> = {
  servers: Server,
  dashboard: LayoutDashboard,
  files: Folder,
  terminal: Terminal,
  editor: Code2,
  applications: Boxes,
  domains: Globe,
  databases: Database,
  snippets: Braces,
  settings: Settings,
  about: Info,
  viewer: Eye,
};
