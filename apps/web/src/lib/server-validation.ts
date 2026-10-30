/** Add/Edit Server form validation, mirroring apps/server/internal/servers/validate.go. */

export type AuthMethod = "password" | "private_key";

export type ServerField = "name" | "host" | "port" | "username" | "secret";

export type ServerFormValues = {
  name: string;
  host: string;
  port: string;
  username: string;
  auth: AuthMethod;
  password: string;
  privateKey: string;
};

export type ValidationContext = {
  editing: boolean;
  /** Auth method of the saved server; switching it requires a new secret. */
  savedAuth?: AuthMethod;
  /** Destination the saved secret belongs to. Changing it requires a new secret. */
  saved?: { host: string; port: number; username: string };
};

/** "save" checks every field; "connection" skips the name (Test Connection). */
export type ValidationScope = "save" | "connection";

export type FieldErrors = Partial<Record<ServerField, string>>;

export const FIELD_ORDER: ServerField[] = ["name", "host", "port", "username", "secret"];

const NAME_MAX = 64;
const USERNAME_MAX = 64;

const NUMERIC_HOST_RE = /^[\d.]+$/;
const HOST_LABEL_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u;

function validIPv4(value: string) {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function validIPv6(value: string) {
  if (!/^[0-9a-fA-F:.]+$/.test(value) || (value.match(/::/g) ?? []).length > 1) return false;
  try {
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

export function hostError(raw: string): string | null {
  const host = raw.trim();
  if (!host) return "Host / IP is required.";
  if (/\s/.test(host)) return "Host can't contain spaces.";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(host) || host.includes("/")) {
    return "Enter only the host name or IP, without http:// or a path.";
  }
  if (host.startsWith("[") || host.endsWith("]")) {
    return "Enter the IPv6 address without brackets.";
  }
  if (/^[^:]+:\d+$/.test(host)) return "Put the port in the SSH Port field, not in the host.";
  if (host.includes(":")) return validIPv6(host) ? null : "Enter a valid IPv6 address.";
  if (NUMERIC_HOST_RE.test(host)) {
    return validIPv4(host) ? null : "Enter a valid IPv4 address: four numbers from 0 to 255.";
  }
  const name = host.endsWith(".") ? host.slice(0, -1) : host;
  if (
    name.length > 253 ||
    !name.split(".").every((label) => label.length <= 63 && HOST_LABEL_RE.test(label))
  ) {
    return "Enter a valid IP address or host name.";
  }
  return null;
}

export function portError(raw: string): string | null {
  const port = raw.trim();
  if (!port) return "SSH port is required.";
  if (!/^\d+$/.test(port)) return "SSH port must be a whole number.";
  const value = Number(port);
  if (value < 1 || value > 65535) return "SSH port must be between 1 and 65535.";
  return null;
}

export function usernameError(raw: string): string | null {
  const username = raw.trim();
  if (!username) return "Username is required.";
  if (/\s/.test(username)) return "Username can't contain spaces.";
  if (/[:@/]/.test(username)) return "Username can't contain ':', '@' or '/'.";
  if (username.length > USERNAME_MAX)
    return `Username must be ${USERNAME_MAX} characters or fewer.`;
  return null;
}

export function nameError(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "Server name is required.";
  if (name.length > NAME_MAX) return `Server name must be ${NAME_MAX} characters or fewer.`;
  return null;
}

const MOVED_MESSAGE = {
  password:
    "Enter the password again: the host, port or username changed, and a saved password is only used for the original destination.",
  private_key:
    "Paste the private key again: the host, port or username changed, and a saved key is only used for the original destination.",
} as const;

function secretError(values: ServerFormValues, ctx: ValidationContext): string | null {
  const password = values.password.trim();
  const key = values.privateKey.trim();
  const switching = ctx.editing && ctx.savedAuth !== values.auth;
  const moved =
    ctx.editing &&
    !switching &&
    ctx.saved !== undefined &&
    (values.host.trim().toLowerCase() !== ctx.saved.host.toLowerCase() ||
      Number(values.port) !== ctx.saved.port ||
      values.username.trim() !== ctx.saved.username);
  // A new secret is needed when adding, when changing the auth method, or when the host, port
  // or username change: a saved secret is only ever used for the destination it was saved for.
  const required = !ctx.editing || switching || moved;
  if (values.auth === "password") {
    if (password || !required) return null;
    if (moved) return MOVED_MESSAGE.password;
    return switching
      ? "Enter a password to switch to password authentication."
      : "Password is required.";
  }
  if (!key) {
    if (!required) return null;
    if (moved) return MOVED_MESSAGE.private_key;
    return switching
      ? "Paste a private key to switch to key authentication."
      : "Private key is required.";
  }
  if (
    !/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(key) ||
    !/-----END [A-Z0-9 ]*PRIVATE KEY-----/.test(key)
  ) {
    return "Paste the full private key, including the -----BEGIN and -----END lines.";
  }
  return null;
}

export function validateServerForm(
  values: ServerFormValues,
  ctx: ValidationContext,
  scope: ValidationScope,
): FieldErrors {
  const errors: FieldErrors = {};
  const checks: [ServerField, string | null][] = [
    ["name", scope === "save" ? nameError(values.name) : null],
    ["host", hostError(values.host)],
    ["port", portError(values.port)],
    ["username", usernameError(values.username)],
    ["secret", secretError(values, ctx)],
  ];
  for (const [field, message] of checks) {
    if (message) errors[field] = message;
  }
  return errors;
}
