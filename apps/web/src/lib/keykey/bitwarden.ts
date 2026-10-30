import type { VaultItem } from "@/src/lib/keykey/vault";

/**
 * Read-only access to a Bitwarden (or Vaultwarden) vault through the Bitwarden CLI local API.
 * Run `bw config server <your instance>`, `bw login`, then `bw serve` on this machine.
 * ServerUI only talks to that local process; the master password goes to it, not to ServerUI.
 */
export type BitwardenState = "unlocked" | "locked" | "unauthenticated";

type Json = Record<string, unknown>;

async function call(base: string, path: string, init?: RequestInit): Promise<Json> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, init);
  } catch {
    throw new Error("Cannot reach the Bitwarden CLI. Start it with: bw serve");
  }
  const body = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok || body.success === false) {
    throw new Error(typeof body.message === "string" ? body.message : "Bitwarden request failed.");
  }
  return body;
}

export async function bitwardenStatus(base: string): Promise<BitwardenState> {
  const body = await call(base, "/status");
  const data = body.data as { template?: { status?: string } } | undefined;
  const status = data?.template?.status;
  if (status === "unlocked" || status === "locked" || status === "unauthenticated") return status;
  throw new Error("Unexpected answer from the Bitwarden CLI.");
}

export async function bitwardenUnlock(base: string, master: string) {
  // Only send the master password to something that answers like the Bitwarden CLI. Any local
  // process can listen on the port, and a wrong answer here means it is not bw serve.
  const state = await bitwardenStatus(base);
  if (state === "unauthenticated") {
    throw new Error("The Bitwarden CLI is not logged in. Run: bw login");
  }
  await call(base, "/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: master }),
  });
}

export async function bitwardenLock(base: string) {
  await call(base, "/lock", { method: "POST" });
}

type BwItem = {
  id?: string;
  type?: number;
  name?: string;
  notes?: string | null;
  revisionDate?: string;
  login?: { username?: string | null; password?: string | null; uris?: { uri?: string | null }[] };
};

export async function bitwardenItems(base: string): Promise<VaultItem[]> {
  const body = await call(base, "/list/object/items");
  const list = ((body.data as { data?: BwItem[] } | undefined)?.data ?? []).filter(
    (item) => item.type === 1 && item.id,
  );
  return list.map((item) => ({
    id: item.id as string,
    title: item.name ?? "(no name)",
    username: item.login?.username ?? "",
    password: item.login?.password ?? "",
    url: item.login?.uris?.[0]?.uri ?? "",
    notes: item.notes ?? "",
    updatedAt: item.revisionDate ?? "",
  }));
}
