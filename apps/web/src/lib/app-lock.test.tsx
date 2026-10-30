import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LockGate } from "@/src/components/app/LockScreen";
import { SecuritySettings } from "@/src/components/apps/settings/SecuritySettings";
import { AppLockProvider, validateSecret } from "./app-lock";

function renderApp() {
  return render(
    <AppLockProvider>
      <LockGate>
        <p>Desktop</p>
      </LockGate>
      <SecuritySettings />
    </AppLockProvider>,
  );
}

describe("app lock", () => {
  afterEach(() => {
    localStorage.removeItem("serverui-lock");
    localStorage.removeItem("serverui-security");
  });

  it("validates PINs and passphrases", () => {
    expect(validateSecret("pin", "1234")).toBeNull();
    expect(validateSecret("pin", "12ab")).toMatch(/digits/);
    expect(validateSecret("pin", "123")).toMatch(/digits/);
    expect(validateSecret("phrase", "short")).toMatch(/at least/);
    expect(validateSecret("phrase", "long enough")).toBeNull();
  });

  it("turns on with a PIN, locks, rejects a wrong PIN and unlocks with the right one", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Turn on app lock…" }));
    await user.type(screen.getByLabelText("New PIN"), "4821");
    await user.type(screen.getByLabelText("Confirm"), "4821");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("App lock turned on.")).toBeInTheDocument();
    expect(localStorage.getItem("serverui-lock")).not.toContain("4821");

    await user.click(screen.getByRole("button", { name: "Lock now" }));
    const dialog = await screen.findByRole("dialog", { name: "ServerUI is locked" });
    expect(dialog).toBeInTheDocument();

    await user.type(screen.getByLabelText("PIN"), "0000");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong PIN.");

    await user.type(screen.getByLabelText("PIN"), "4821");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "ServerUI is locked" })).not.toBeInTheDocument(),
    );
  });

  it("needs the current secret to turn the lock off", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Turn on app lock…" }));
    await user.click(screen.getByRole("radio", { name: "Passphrase" }));
    await user.type(screen.getByLabelText("New passphrase"), "open sesame");
    await user.type(screen.getByLabelText("Confirm"), "open sesame");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Turn off" });

    await user.click(screen.getByRole("button", { name: "Turn off" }));
    await user.type(screen.getByLabelText("Current PIN or passphrase"), "nope nope");
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not your current secret");

    await user.clear(screen.getByLabelText("Current PIN or passphrase"));
    await user.type(screen.getByLabelText("Current PIN or passphrase"), "open sesame");
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    expect(await screen.findByText("App lock turned off.")).toBeInTheDocument();
    expect(localStorage.getItem("serverui-lock")).toBeNull();
  });
});
