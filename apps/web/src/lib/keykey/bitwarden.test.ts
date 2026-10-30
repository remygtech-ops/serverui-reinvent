import { afterEach, describe, expect, it, vi } from "vitest";

import { bitwardenItems, bitwardenStatus, bitwardenUnlock } from "./bitwarden";

function reply(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

describe("bitwarden bw serve client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the vault status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => reply({ success: true, data: { template: { status: "locked" } } })),
    );
    expect(await bitwardenStatus("http://localhost:8087")).toBe("locked");
  });

  it("maps login items and skips other item types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        reply({
          success: true,
          data: {
            data: [
              {
                id: "a",
                type: 1,
                name: "NAS",
                notes: null,
                login: { username: "root", password: "pw", uris: [{ uri: "https://nas.lan" }] },
              },
              { id: "b", type: 2, name: "A secure note" },
            ],
          },
        }),
      ),
    );
    const items = await bitwardenItems("http://localhost:8087");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "NAS", username: "root", url: "https://nas.lan" });
  });

  it("explains how to start the CLI when it is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("refused"))),
    );
    await expect(bitwardenStatus("http://localhost:8087")).rejects.toThrow(/bw serve/);
  });

  it("surfaces the unlock error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        String(url).endsWith("/status")
          ? reply({ success: true, data: { template: { status: "locked" } } })
          : reply({ success: false, message: "Invalid master password." }, false),
      ),
    );
    await expect(bitwardenUnlock("http://localhost:8087", "x")).rejects.toThrow(
      "Invalid master password.",
    );
  });

  it("never sends the master password to something that does not look like bw serve", async () => {
    const fetchMock = vi.fn(() => reply({ hello: "world" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(bitwardenUnlock("http://localhost:8087", "secret-pw")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("secret-pw");
  });
});
