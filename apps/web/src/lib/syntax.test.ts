import { describe, expect, it } from "vitest";

import { HIGHLIGHT_LIMIT, languageForFile, tokenize } from "./syntax";

const kinds = (text: string, language: Parameters<typeof tokenize>[1]) =>
  tokenize(text, language)
    .filter((token) => token.kind)
    .map((token) => [token.kind, token.text]);

describe("languageForFile", () => {
  it("maps extensions and well-known names", () => {
    expect(languageForFile("/etc/nginx/nginx.conf")).toBe("ini");
    expect(languageForFile("deploy.sh")).toBe("shell");
    expect(languageForFile("/home/me/.bashrc")).toBe("shell");
    expect(languageForFile("docker-compose.yml")).toBe("yaml");
    expect(languageForFile("notes.txt")).toBe("plain");
    expect(languageForFile("README")).toBe("plain");
  });
});

describe("tokenize", () => {
  it("round-trips the exact text", () => {
    const text = 'if [ -f "$HOME/x" ]; then # check\n  echo 42\nfi\n';
    expect(
      tokenize(text, "shell")
        .map((token) => token.text)
        .join(""),
    ).toBe(text);
  });

  it("finds shell comments, strings, keywords and numbers", () => {
    expect(kinds('if true; then echo "hi" # note\nexit 1', "shell")).toEqual([
      ["keyword", "if"],
      ["keyword", "then"],
      ["keyword", "echo"],
      ["string", '"hi"'],
      ["comment", "# note"],
      ["keyword", "exit"],
      ["number", "1"],
    ]);
  });

  it("marks keys in config files and does not color words inside identifiers", () => {
    expect(kinds("worker_processes 4;\nlisten=80 # port", "ini")).toEqual([
      ["number", "4"],
      ["key", "listen"],
      ["number", "80"],
      ["comment", "# port"],
    ]);
    expect(kinds("return_value = 1", "python")).toEqual([["number", "1"]]);
  });

  it("does not highlight hash signs inside strings", () => {
    expect(kinds('url: "http://x/#frag"', "yaml")).toEqual([
      ["key", "url"],
      ["string", '"http://x/#frag"'],
    ]);
  });

  it("skips very large files and plain text", () => {
    expect(tokenize("x".repeat(HIGHLIGHT_LIMIT + 1), "shell")).toHaveLength(1);
    expect(tokenize("# not a comment", "plain")).toEqual([{ text: "# not a comment", kind: null }]);
  });
});
