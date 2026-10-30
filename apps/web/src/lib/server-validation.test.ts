import { describe, expect, it } from "vitest";
import {
  hostError,
  nameError,
  portError,
  usernameError,
  validateServerForm,
  type ServerFormValues,
} from "@/src/lib/server-validation";

const valid: ServerFormValues = {
  name: "Production",
  host: "203.0.113.10",
  port: "22",
  username: "deploy",
  auth: "password",
  password: "secret",
  privateKey: "",
};

describe("hostError", () => {
  it.each([
    "203.0.113.10",
    "0.0.0.0",
    "example.com",
    "srv-1.example.co.uk",
    "localhost",
    "2001:db8::1",
    "::1",
    "bücher.example",
  ])("accepts %s", (host) => expect(hostError(host)).toBeNull());

  it.each([
    ["", "Host / IP is required."],
    ["203.0.113.300", "Enter a valid IPv4 address: four numbers from 0 to 255."],
    ["10.0.0", "Enter a valid IPv4 address: four numbers from 0 to 255."],
    ["12345", "Enter a valid IPv4 address: four numbers from 0 to 255."],
    ["my host", "Host can't contain spaces."],
    ["https://example.com", "Enter only the host name or IP, without http:// or a path."],
    ["example.com/admin", "Enter only the host name or IP, without http:// or a path."],
    ["203.0.113.10:22", "Put the port in the SSH Port field, not in the host."],
    ["[2001:db8::1]", "Enter the IPv6 address without brackets."],
    ["2001:db8:::1", "Enter a valid IPv6 address."],
    ["-bad.example", "Enter a valid IP address or host name."],
    ["bad_host.example", "Enter a valid IP address or host name."],
  ])("rejects %j", (host, message) => expect(hostError(host)).toBe(message));
});

describe("portError", () => {
  it("accepts 1 to 65535", () => {
    expect(portError("1")).toBeNull();
    expect(portError("65535")).toBeNull();
  });
  it.each([
    ["", "SSH port is required."],
    ["2a", "SSH port must be a whole number."],
    ["22.5", "SSH port must be a whole number."],
    ["0", "SSH port must be between 1 and 65535."],
    ["70000", "SSH port must be between 1 and 65535."],
  ])("rejects %j", (port, message) => expect(portError(port)).toBe(message));
});

describe("usernameError and nameError", () => {
  it("validates usernames", () => {
    expect(usernameError("deploy")).toBeNull();
    expect(usernameError("")).toBe("Username is required.");
    expect(usernameError("de ploy")).toBe("Username can't contain spaces.");
    expect(usernameError("root@host")).toBe("Username can't contain ':', '@' or '/'.");
  });
  it("limits server names", () => {
    expect(nameError("Prod")).toBeNull();
    expect(nameError("  ")).toBe("Server name is required.");
    expect(nameError("x".repeat(65))).toBe("Server name must be 64 characters or fewer.");
  });
});

describe("validateServerForm", () => {
  it("passes a valid form", () => {
    expect(validateServerForm(valid, { editing: false }, "save")).toEqual({});
  });

  it("skips the name when only testing the connection", () => {
    const errors = validateServerForm({ ...valid, name: "" }, { editing: false }, "connection");
    expect(errors).toEqual({});
  });

  it("requires a secret when adding", () => {
    expect(validateServerForm({ ...valid, password: "" }, { editing: false }, "save")).toEqual({
      secret: "Password is required.",
    });
  });

  it("keeps the saved secret when editing", () => {
    const ctx = { editing: true, savedAuth: "password" as const };
    expect(validateServerForm({ ...valid, password: "" }, ctx, "save")).toEqual({});
  });

  it("requires the secret again when the host, port or username change", () => {
    const ctx = {
      editing: true,
      savedAuth: "password" as const,
      saved: { host: valid.host, port: Number(valid.port), username: valid.username },
    };
    expect(validateServerForm({ ...valid, password: "" }, ctx, "save")).toEqual({});
    for (const change of [{ host: "198.51.100.7" }, { port: "2222" }, { username: "root" }]) {
      const errors = validateServerForm({ ...valid, ...change, password: "" }, ctx, "save");
      expect(errors.secret).toMatch(/Enter the password again/);
      expect(validateServerForm({ ...valid, ...change, password: "new" }, ctx, "save")).toEqual({});
    }
  });

  it("requires a new secret when switching auth method", () => {
    const ctx = { editing: true, savedAuth: "password" as const };
    expect(validateServerForm({ ...valid, auth: "private_key" }, ctx, "save")).toEqual({
      secret: "Paste a private key to switch to key authentication.",
    });
  });

  it("checks the private key shape", () => {
    const errors = validateServerForm(
      { ...valid, auth: "private_key", privateKey: "not a key" },
      { editing: false },
      "save",
    );
    expect(errors.secret).toMatch(/BEGIN and -----END/);
    const ok = validateServerForm(
      {
        ...valid,
        auth: "private_key",
        privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----",
      },
      { editing: false },
      "save",
    );
    expect(ok).toEqual({});
  });
});
