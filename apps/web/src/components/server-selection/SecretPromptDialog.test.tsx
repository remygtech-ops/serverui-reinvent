import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Server } from "@/src/lib/servers";
import { SecretPromptDialog } from "./SecretPromptDialog";

const server: Server = {
  id: "srv-1",
  name: "Lab",
  hostname: "203.0.113.5",
  address: "203.0.113.5",
  status: "offline",
  username: "me",
  authType: "password",
};

describe("SecretPromptDialog", () => {
  it("submits the typed password", async () => {
    const onSubmit = vi.fn();
    render(<SecretPromptDialog server={server} onSubmit={onSubmit} onCancel={() => undefined} />);
    const connect = screen.getByRole("button", { name: "Connect" });
    expect(connect).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Password"), "hunter2");
    await userEvent.click(connect);
    expect(onSubmit).toHaveBeenCalledWith({ password: "hunter2", remember: false });
  });

  it("asks for a key when the server uses one, and shows the last error", async () => {
    const onSubmit = vi.fn();
    render(
      <SecretPromptDialog
        server={{ ...server, authType: "private_key" }}
        error="unable to authenticate"
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("unable to authenticate");
    await userEvent.type(screen.getByLabelText("Private key"), "KEY");
    await userEvent.type(screen.getByLabelText("Key passphrase"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onSubmit).toHaveBeenCalledWith({
      privateKey: "KEY",
      passphrase: "pw",
      remember: false,
    });
  });

  it("cancels with Escape", async () => {
    const onCancel = vi.fn();
    render(<SecretPromptDialog server={server} onSubmit={() => undefined} onCancel={onCancel} />);
    await userEvent.type(screen.getByLabelText("Password"), "{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("remembers by default when the stored password can no longer be read", async () => {
    const onSubmit = vi.fn();
    render(
      <SecretPromptDialog
        server={{ ...server, credentialsLost: true }}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByText(/saved by an older version/)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /Remember this password/ })).toBeChecked();
    await userEvent.type(screen.getByLabelText("Password"), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onSubmit).toHaveBeenCalledWith({ password: "hunter2", remember: true });
  });

  it("lets you remember a password that was left out on purpose", async () => {
    const onSubmit = vi.fn();
    render(<SecretPromptDialog server={server} onSubmit={onSubmit} onCancel={() => undefined} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Remember this password/ }));
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onSubmit).toHaveBeenCalledWith({ password: "pw", remember: true });
  });
});
