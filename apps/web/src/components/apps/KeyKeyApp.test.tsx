import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { deleteVault } from "@/src/lib/keykey/vault";
import { KeyKeyApp } from "./KeyKeyApp";

describe("KeyKeyApp", () => {
  afterEach(() => {
    deleteVault();
    localStorage.removeItem("serverui-security");
  });

  it("creates a vault, stores an item, locks and unlocks again", async () => {
    const user = userEvent.setup();
    render(<KeyKeyApp />);

    await user.type(screen.getByLabelText("Master password"), "correct horse");
    await user.type(screen.getByLabelText("Confirm master password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Create vault" }));

    await user.click(await screen.findByRole("button", { name: /New item/ }));
    await user.type(screen.getByLabelText("Title"), "NAS");
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "NAS" })).toBeInTheDocument();
    expect(localStorage.getItem("serverui-keykey")).not.toContain("NAS");

    await user.click(screen.getByRole("button", { name: "Lock vault" }));
    expect(await screen.findByText("KeyKey is locked")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Master password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong master password.");

    await user.clear(screen.getByLabelText("Master password"));
    await user.type(screen.getByLabelText("Master password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await user.click(await screen.findByRole("button", { name: /NAS/ }));
    expect(screen.getByRole("heading", { name: "NAS" })).toBeInTheDocument();
  });

  it("refuses a short or mismatched master password", async () => {
    const user = userEvent.setup();
    render(<KeyKeyApp />);
    await user.type(screen.getByLabelText("Master password"), "short");
    await user.type(screen.getByLabelText("Confirm master password"), "short");
    await user.click(screen.getByRole("button", { name: "Create vault" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 8");
  });
});
