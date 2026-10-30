"use client";

import { AboutApp } from "@/src/components/apps/AboutApp";
import { ApplicationsApp } from "@/src/components/apps/ApplicationsApp";
import { DashboardApp } from "@/src/components/apps/DashboardApp";
import { DatabasesApp } from "@/src/components/apps/DatabasesApp";
import { DomainsApp } from "@/src/components/apps/DomainsApp";
import { EditorApp } from "@/src/components/apps/EditorApp";
import { FileViewer } from "@/src/components/apps/files/viewers/FileViewer";
import { FilesApp } from "@/src/components/apps/FilesApp";
import { ServersApp } from "@/src/components/apps/ServersApp";
import { SettingsApp } from "@/src/components/apps/SettingsApp";
import { SnippetsApp } from "@/src/components/apps/SnippetsApp";
import { TerminalApp } from "@/src/components/apps/TerminalApp";
import { Window } from "@/src/components/window/Window";
import { WindowServerProvider } from "@/src/lib/window-server";
import { useWindowManager, type WindowPayload } from "@/src/components/window/window-context";
import type { AppId } from "@/src/data/apps";

export function WindowManager() {
  const { windows } = useWindowManager();

  return (
    <>
      {windows.map((item) => (
        <Window key={item.id} window={item}>
          <WindowServerProvider serverId={item.serverId}>
            <AppBody app={item.app} payload={item.payload} windowId={item.id} />
          </WindowServerProvider>
        </Window>
      ))}
    </>
  );
}

function AppBody({
  app,
  payload,
  windowId,
}: {
  app: AppId;
  payload?: WindowPayload;
  windowId: string;
}) {
  switch (app) {
    case "servers":
      return <ServersApp />;
    case "dashboard":
      return <DashboardApp />;
    case "files":
      return <FilesApp payload={payload} />;
    case "terminal":
      return <TerminalApp payload={payload} />;
    case "editor":
      return <EditorApp payload={payload} windowId={windowId} />;
    case "viewer":
      return <FileViewer payload={payload} windowId={windowId} />;
    case "applications":
      return <ApplicationsApp />;
    case "domains":
      return <DomainsApp />;
    case "databases":
      return <DatabasesApp />;
    case "snippets":
      return <SnippetsApp />;
    case "settings":
      return <SettingsApp />;
    case "about":
      return <AboutApp />;
  }
}
