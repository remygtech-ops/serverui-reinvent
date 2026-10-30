import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppLockProvider } from "@/src/lib/app-lock";
import { WallpaperProvider } from "@/src/lib/wallpaper";
import { SettingsApp } from "./SettingsApp";

describe("SettingsApp", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem("serverui-wallpaper");
    localStorage.removeItem("serverui-wallpaper-light");
  });

  it("shows the General tab with wallpaper selection", async () => {
    render(
      <WallpaperProvider>
        <SettingsApp />
      </WallpaperProvider>,
    );
    expect(screen.getByRole("button", { name: "General" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wallpaper" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Crescent" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Valley" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Orbit" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Upload wallpaper" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload wallpaper…" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dock" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Check for updates/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "Valley" }));
    expect(screen.getByRole("option", { name: "Valley" })).toHaveAttribute("aria-selected", "true");
  });

  it("changes the terminal theme and size from the Terminal tab", async () => {
    render(
      <WallpaperProvider>
        <SettingsApp />
      </WallpaperProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(screen.getByRole("button", { name: "Terminal" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("option", { name: "Dracula" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "Dracula" }));
    expect(screen.getByRole("option", { name: "Dracula" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("terminal-preview")).toHaveStyle({ fontSize: "13px" });
    await userEvent.click(screen.getByRole("button", { name: "Larger text" }));
    expect(screen.getByTestId("terminal-preview")).toHaveStyle({ fontSize: "14px" });
    localStorage.removeItem("serverui-terminal");
  });

  it("switches the password vault to a Bitwarden instance in Security", async () => {
    render(
      <AppLockProvider>
        <WallpaperProvider>
          <SettingsApp />
        </WallpaperProvider>
      </AppLockProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByRole("radio", { name: "KeyKey (built in)" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Bitwarden instance" }));
    expect(screen.getByLabelText("Bitwarden CLI address")).toHaveValue("http://localhost:8087");
    await userEvent.click(screen.getByRole("radio", { name: "15 min" }));
    expect(screen.getByRole("radio", { name: "15 min" })).toBeChecked();
    localStorage.removeItem("serverui-security");
  });

  it("swaps the built-in scenes for the light set", () => {
    document.documentElement.dataset.theme = "light";
    render(
      <WallpaperProvider>
        <SettingsApp />
      </WallpaperProvider>,
    );
    expect(screen.getByRole("option", { name: "Fjord" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sunrise" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: "Alpine" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Crescent" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Fjord" }).querySelector("span")).toHaveStyle({
      backgroundImage: 'url("/wallpapers/fjord.png")',
    });
  });
});
