import { describe, expect, it } from "vitest";

import { matchPrompt } from "./terminal-prompt";

describe("matchPrompt", () => {
  it("splits user@host: and the working directory", () => {
    const line = "dasysil@city:~/downloads/Scripts/cross-seed-reverse$ ls";
    expect(matchPrompt(line)).toEqual({
      user: { start: 0, width: "dasysil@city:".length },
      path: {
        start: "dasysil@city:".length,
        width: "~/downloads/Scripts/cross-seed-reverse".length,
      },
    });
  });

  it("handles root prompts and a bare home directory", () => {
    expect(matchPrompt("root@web-01:~# ")).toEqual({
      user: { start: 0, width: 12 },
      path: { start: 12, width: 1 },
    });
  });

  it("skips a virtualenv prefix", () => {
    const match = matchPrompt("(venv) pi@raspberry:/etc$ ");
    expect(match?.user.start).toBe(7);
    expect(match?.path.width).toBe("/etc".length);
  });

  it("returns null for ordinary output", () => {
    expect(matchPrompt("total 12")).toBeNull();
    expect(matchPrompt("mail me at a@b.com: please")).toBeNull();
    expect(matchPrompt("user@host:path")).toBeNull();
  });
});
