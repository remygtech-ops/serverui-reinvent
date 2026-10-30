import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { parseSnippets } from "@/src/lib/snippets";

const openWindow = vi.fn();
vi.mock("@/src/components/window/window-context", () => ({
  useWindowManager: () => ({ openWindow }),
}));

import { SnippetsApp } from "./SnippetsApp";
import { listenForTerminalInput, takePendingTerminalInput } from "@/src/lib/terminal-bus";

describe("SnippetsApp", () => {
  afterEach(() => {
    localStorage.removeItem("serverui-snippets");
    openWindow.mockClear();
    takePendingTerminalInput();
  });

  it("starts with the starter set and filters by search", async () => {
    render(<SnippetsApp />);
    expect(screen.getByText("Disk usage")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Search snippets"), "docker");
    expect(screen.getByText("Running containers")).toBeInTheDocument();
    expect(screen.queryByText("Disk usage")).not.toBeInTheDocument();
  });

  it("creates, edits and deletes a snippet", async () => {
    render(<SnippetsApp />);
    await userEvent.click(screen.getByRole("button", { name: /New snippet/ }));
    await userEvent.type(screen.getByLabelText("Title"), "Restart nginx");
    await userEvent.type(screen.getByLabelText("Command"), "sudo systemctl restart nginx");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Restart nginx")).toBeInTheDocument();
    expect(parseSnippets(localStorage.getItem("serverui-snippets") ?? "")).toContainEqual(
      expect.objectContaining({ command: "sudo systemctl restart nginx" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete Restart nginx" }));
    expect(screen.queryByText("Restart nginx")).not.toBeInTheDocument();
  });

  it("sends a command to an open terminal, or opens one and queues it", async () => {
    render(<SnippetsApp />);
    const received: string[] = [];
    const stop = listenForTerminalInput((input) => {
      received.push(`${input.text}|${input.run ? "run" : "insert"}`);
      return true;
    });
    await userEvent.click(screen.getByRole("button", { name: "Run Disk usage" }));
    expect(received).toEqual(["df -h|run"]);
    expect(openWindow).not.toHaveBeenCalled();
    stop();

    await userEvent.click(screen.getByRole("button", { name: "Insert Memory usage" }));
    expect(openWindow).toHaveBeenCalledWith("terminal");
    expect(takePendingTerminalInput()).toEqual(
      expect.objectContaining({ text: "free -h", run: false }),
    );
  });
});
