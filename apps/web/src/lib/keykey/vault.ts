/**
 * KeyKey vault: items are encrypted in the browser with AES-256-GCM. The key comes from
 * the master password through PBKDF2-SHA256, so the master password and the decrypted
 * items never leave this device and are never sent to the ServerUI backend.
 */

export type VaultItem = {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  updatedAt: string;
};

type Envelope = {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  data: string;
};

export const VAULT_KEY = "serverui-keykey";
export const PBKDF2_ITERATIONS = 310_000;
/** Accepted range for a stored envelope: weaker or absurdly heavy settings mean it was tampered with. */
const MAX_ITERATIONS = 5_000_000;

export class WrongMasterPasswordError extends Error {
  constructor() {
    super("Wrong master password.");
    this.name = "WrongMasterPasswordError";
  }
}

function subtle() {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error("Secure storage is not available in this browser.");
  return api;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(master: string, salt: Uint8Array, iterations: number) {
  const material = await subtle().importKey(
    "raw",
    new TextEncoder().encode(master),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function readEnvelope(): Envelope | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Envelope>;
    if (
      parsed.v !== 1 ||
      typeof parsed.salt !== "string" ||
      typeof parsed.iv !== "string" ||
      typeof parsed.data !== "string" ||
      typeof parsed.iterations !== "number"
    ) {
      return null;
    }
    return parsed as Envelope;
  } catch {
    return null;
  }
}

export function hasVault() {
  return readEnvelope() !== null;
}

export function deleteVault() {
  try {
    localStorage.removeItem(VAULT_KEY);
  } catch {
    // Ignore private-mode storage failures.
  }
}

async function seal(key: CryptoKey, items: VaultItem[], salt: Uint8Array, iterations: number) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(items));
  const cipher = await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plain);
  const envelope: Envelope = {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(cipher)),
  };
  localStorage.setItem(VAULT_KEY, JSON.stringify(envelope));
}

export type VaultSession = {
  items: VaultItem[];
  /** Encrypts and stores the new list. */
  save: (items: VaultItem[]) => Promise<void>;
  /** Re-encrypts the vault under a new master password. */
  changeMaster: (next: string) => Promise<void>;
};

function session(
  items: VaultItem[],
  key: CryptoKey,
  salt: Uint8Array,
  iterations: number,
): VaultSession {
  let current = { key, salt, iterations };
  const self: VaultSession = {
    items,
    async save(next) {
      await seal(current.key, next, current.salt, current.iterations);
      self.items = next;
    },
    async changeMaster(master) {
      const nextSalt = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const nextKey = await deriveKey(master, nextSalt, PBKDF2_ITERATIONS);
      await seal(nextKey, self.items, nextSalt, PBKDF2_ITERATIONS);
      current = { key: nextKey, salt: nextSalt, iterations: PBKDF2_ITERATIONS };
    },
  };
  return self;
}

export async function createVault(master: string): Promise<VaultSession> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(master, salt, PBKDF2_ITERATIONS);
  await seal(key, [], salt, PBKDF2_ITERATIONS);
  return session([], key, salt, PBKDF2_ITERATIONS);
}

export async function unlockVault(master: string): Promise<VaultSession> {
  const envelope = readEnvelope();
  if (!envelope) throw new Error("No vault yet.");
  if (envelope.iterations < PBKDF2_ITERATIONS || envelope.iterations > MAX_ITERATIONS) {
    throw new Error("The vault has unexpected key derivation settings and was not opened.");
  }
  const salt = fromBase64(envelope.salt);
  const key = await deriveKey(master, salt, envelope.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv) as BufferSource },
      key,
      fromBase64(envelope.data) as BufferSource,
    );
  } catch {
    throw new WrongMasterPasswordError();
  }
  const items = JSON.parse(new TextDecoder().decode(plain)) as VaultItem[];
  return session(items, key, salt, envelope.iterations);
}

export type GeneratorOptions = {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
};

export const GENERATOR_DEFAULTS: GeneratorOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
};

const SETS = {
  lower: "abcdefghijkmnopqrstuvwxyz",
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  digits: "23456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?",
} as const;

/** Unbiased random integer in [0, max) from the system generator. */
function randomInt(max: number) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

/** Random password with at least one character from every enabled set. */
export function generatePassword(options: GeneratorOptions = GENERATOR_DEFAULTS): string {
  const enabled = (Object.keys(SETS) as (keyof typeof SETS)[]).filter((name) => options[name]);
  const pools = enabled.length ? enabled.map((name) => SETS[name]) : [SETS.lower];
  const length = Math.min(128, Math.max(pools.length, Math.round(options.length)));
  const all = pools.join("");
  const pick = (chars: string) => chars[randomInt(chars.length)];
  const out = pools.map(pick);
  while (out.length < length) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}
