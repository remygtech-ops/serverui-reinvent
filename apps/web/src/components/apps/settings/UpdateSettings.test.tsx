import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/src/lib/app-updater", async () => {
  const actual =
    await vi.importActual<typeof import("@/src/lib/app-updater")>("@/src/lib/app-updater");
  return {
    ...actual,
    currentVersion: vi.fn(),
    checkForUpdate: vi.fn(),
    restartApp: vi.fn(),
  };
});

import * as updater from "@/src/lib/app-updater";
import { UpdateSettings } from "./UpdateSettings";

const mocked = vi.mocked(updater);

describe("UpdateSettings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("explains that updates are desktop-only in the web version", async () => {
    mocked.currentVersion.mockResolvedValue(null);
    render(<UpdateSettings />);
    expect(await screen.findByText(/only available in the ServerUI desktop app/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Check for updates/i })).not.toBeInTheDocument();
  });

  it("reports when the app is up to date", async () => {
    mocked.currentVersion.mockResolvedValue("0.3.3");
    mocked.checkForUpdate.mockResolvedValue({ kind: "up-to-date", current: "0.3.3" });
    render(<UpdateSettings />);
    expect(await screen.findByText("0.3.3")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("You are up to date.")).toBeVisible();
  });

  it("installs an available update with progress, then restarts", async () => {
    mocked.currentVersion.mockResolvedValue("0.3.3");
    const install = vi.fn(async (onProgress: (fraction: number | null) => void) => {
      onProgress(0.5);
      onProgress(1);
    });
    mocked.checkForUpdate.mockResolvedValue({
      kind: "available",
      current: "0.3.3",
      update: { version: "0.4.0", notes: "Faster terminal", install },
    });
    mocked.restartApp.mockResolvedValue();

    render(<UpdateSettings />);
    await screen.findByText("0.3.3");
    await userEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Version 0.4.0 is available.")).toBeVisible();
    expect(screen.getByText("Faster terminal")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Install 0.4.0 and restart" }));
    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocked.restartApp).toHaveBeenCalledTimes(1));
  });

  it("shows a readable error when the check fails", async () => {
    mocked.currentVersion.mockResolvedValue("0.3.3");
    mocked.checkForUpdate.mockRejectedValue(new Error("error sending request for url"));
    render(<UpdateSettings />);
    await screen.findByText("0.3.3");
    await userEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not reach GitHub/);
  });

  it("does not restart when the install fails", async () => {
    mocked.currentVersion.mockResolvedValue("0.3.3");
    mocked.checkForUpdate.mockResolvedValue({
      kind: "available",
      current: "0.3.3",
      update: {
        version: "0.4.0",
        notes: "",
        install: vi.fn().mockRejectedValue(new Error("signature verification failed")),
      },
    });
    render(<UpdateSettings />);
    await screen.findByText("0.3.3");
    await userEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await userEvent.click(await screen.findByRole("button", { name: /Install 0.4.0/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/signature/i);
    expect(mocked.restartApp).not.toHaveBeenCalled();
  });

  it("offers a restart when the install fails after the download", async () => {
    mocked.currentVersion.mockResolvedValue("0.3.3");
    mocked.restartApp.mockResolvedValue();
    mocked.checkForUpdate.mockResolvedValue({
      kind: "available",
      current: "0.3.3",
      update: {
        version: "0.4.0",
        notes: "",
        install: vi.fn(async (onProgress: (fraction: number | null) => void) => {
          onProgress(1);
          throw new Error("installer failed");
        }),
      },
    });
    render(<UpdateSettings />);
    await screen.findByText("0.3.3");
    await userEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await userEvent.click(await screen.findByRole("button", { name: /Install 0.4.0/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Restart ServerUI" }));
    expect(mocked.restartApp).toHaveBeenCalledTimes(1);
  });
});
