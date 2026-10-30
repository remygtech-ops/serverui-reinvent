import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServerManager } from "@/src/components/apps/servers/ServerManager";
import type { Server } from "@/src/lib/servers";

const servers: Server[] = [
  {
    id: "prod",
    name: "Production",
    hostname: "prod",
    address: "prod.example.com",
    username: "root",
    sshPort: 22,
    authType: "private_key",
    status: "online",
    connected: true,
    cpuUsage: 12,
    memoryUsage: 40,
    diskUsage: 55,
  },
  {
    id: "home",
    name: "Homelab",
    hostname: "home",
    address: "203.0.113.10",
    username: "deploy",
    sshPort: 22,
    authType: "password",
    status: "offline",
    connected: false,
  },
];

vi.mock("@/src/lib/session", () => ({
  useSession: () => ({
    servers,
    addServer: vi.fn(),
    updateServer: vi.fn(),
    deleteServer: vi.fn(),
    testConnection: vi.fn(),
    loadingServers: false,
    serversError: null,
    refreshServers: vi.fn(),
  }),
  formatApiError: (err: unknown) => (err instanceof Error ? err.message : "request failed"),
}));

describe("ServerManager", () => {
  it("shows the selected server details and keeps the other server in the list", async () => {
    const user = userEvent.setup();
    const disconnect = vi.fn();
    render(
      <ServerManager
        actions={{
          connect: vi.fn(),
          disconnect,
          reconnect: vi.fn(),
          openFiles: vi.fn(),
          openTerminal: vi.fn(),
          openMetrics: vi.fn(),
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Servers" })).toBeInTheDocument();
    expect(screen.getByText("Manage your Linux servers")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Homelab" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Production/ }));

    expect(screen.getByRole("heading", { name: "Production" })).toBeInTheDocument();
    expect(screen.getByText("SSH Key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("opens add server as a temporary sidebar tab with the form beside it", async () => {
    const user = userEvent.setup();
    render(
      <ServerManager
        actions={{
          connect: vi.fn(),
          disconnect: vi.fn(),
          reconnect: vi.fn(),
          openFiles: vi.fn(),
          openTerminal: vi.fn(),
          openMetrics: vi.fn(),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add Server" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /New Server/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { name: "New Server" })).toBeInTheDocument();
    expect(screen.getByLabelText("Server Name")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Server Name"), "Edge Lab");
    expect(screen.getByRole("option", { name: /Edge Lab/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Edge Lab" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("option", { name: /New Server|Edge Lab/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Homelab" })).toBeInTheDocument();
  });

  it("opens edit as a temporary sidebar tab with the form beside it", async () => {
    const user = userEvent.setup();
    render(
      <ServerManager
        actions={{
          connect: vi.fn(),
          disconnect: vi.fn(),
          reconnect: vi.fn(),
          openFiles: vi.fn(),
          openTerminal: vi.fn(),
          openMetrics: vi.fn(),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Editing/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Server Name")).toHaveValue("Homelab");
    expect(screen.getByRole("button", { name: "Choose Image" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Server" })).toHaveAttribute("aria-checked", "true");
    expect(
      within(screen.getByRole("radiogroup", { name: "Server icon" })).getAllByRole("radio"),
    ).toHaveLength(16);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("option", { name: /Editing/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });
});

describe("ServerManager groups", () => {
  it("groups servers under headings and filters by group", async () => {
    const user = userEvent.setup();
    render(
      <ServerManager
        actions={{
          connect: vi.fn(),
          disconnect: vi.fn(),
          reconnect: vi.fn(),
          openFiles: vi.fn(),
          openTerminal: vi.fn(),
          openMetrics: vi.fn(),
        }}
      />,
    );
    await user.click(screen.getByRole("option", { name: /Homelab/ }));
    const field = screen.getByLabelText("Group");
    await user.type(field, "Home");
    await user.tab();
    expect(await screen.findByText("Home", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Ungrouped")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Filter by group"), "Home");
    expect(screen.queryByRole("option", { name: /Production/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Homelab/ })).toBeInTheDocument();
    localStorage.removeItem("serverui-server-groups");
  });
});
