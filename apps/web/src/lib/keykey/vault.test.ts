import { afterEach, describe, expect, it } from "vitest";

import {
  VAULT_KEY,
  WrongMasterPasswordError,
  createVault,
  deleteVault,
  generatePassword,
  hasVault,
  unlockVault,
  type VaultItem,
} from "./vault";

const item: VaultItem = {
  id: "1",
  title: "Router",
  username: "admin",
  password: "p@ss-W0rd!",
  url: "http://192.168.1.1",
  notes: "",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("KeyKey vault", () => {
  afterEach(() => deleteVault());

  it("stores items encrypted and reopens them with the master password", async () => {
    const created = await createVault("correct horse");
    await created.save([item]);
    expect(hasVault()).toBe(true);
    const stored = localStorage.getItem(VAULT_KEY) ?? "";
    expect(stored).not.toContain("p@ss-W0rd!");
    expect(stored).not.toContain("Router");

    const reopened = await unlockVault("correct horse");
    expect(reopened.items).toEqual([item]);
  });

  it("rejects a wrong master password", async () => {
    await createVault("correct horse");
    await expect(unlockVault("wrong")).rejects.toBeInstanceOf(WrongMasterPasswordError);
  });

  it("refuses an envelope whose key derivation was weakened or inflated", async () => {
    await createVault("correct horse");
    const envelope = JSON.parse(localStorage.getItem(VAULT_KEY) ?? "{}");
    for (const iterations of [1, 1_000, 50_000_000]) {
      localStorage.setItem(VAULT_KEY, JSON.stringify({ ...envelope, iterations }));
      await expect(unlockVault("correct horse")).rejects.toThrow(/key derivation settings/);
    }
  });

  it("re-encrypts under a new master password", async () => {
    const session = await createVault("old master");
    await session.save([item]);
    await session.changeMaster("new master");
    await expect(unlockVault("old master")).rejects.toBeInstanceOf(WrongMasterPasswordError);
    expect((await unlockVault("new master")).items).toEqual([item]);
  });
});

describe("generatePassword", () => {
  it("honors the length and includes every enabled set", () => {
    for (let i = 0; i < 25; i += 1) {
      const value = generatePassword({
        length: 12,
        lower: true,
        upper: true,
        digits: true,
        symbols: true,
      });
      expect(value).toHaveLength(12);
      expect(value).toMatch(/[a-z]/);
      expect(value).toMatch(/[A-Z]/);
      expect(value).toMatch(/[0-9]/);
      expect(value).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it("only uses the enabled sets and never returns an empty password", () => {
    const digits = generatePassword({
      length: 30,
      lower: false,
      upper: false,
      digits: true,
      symbols: false,
    });
    expect(digits).toMatch(/^[0-9]{30}$/);
    expect(
      generatePassword({ length: 8, lower: false, upper: false, digits: false, symbols: false }),
    ).toHaveLength(8);
  });
});
