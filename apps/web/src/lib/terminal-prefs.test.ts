import { afterEach, describe, expect, it } from "vitest";

import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  TERMINAL_DEFAULTS,
  clampFontSize,
  parseTerminalPrefs,
  writeTerminalPrefs,
} from "./terminal-prefs";
import { TERMINAL_THEMES, getTerminalTheme } from "./terminal-themes";

describe("terminal prefs", () => {
  afterEach(() => localStorage.removeItem("serverui-terminal"));

  it("falls back to defaults for empty or broken storage", () => {
    expect(parseTerminalPrefs("")).toEqual(TERMINAL_DEFAULTS);
    expect(parseTerminalPrefs("{nope")).toEqual(TERMINAL_DEFAULTS);
  });

  it("ignores unknown values and clamps the font size", () => {
    const prefs = parseTerminalPrefs(
      JSON.stringify({ themeId: "nope", fontSize: 500, fontFamily: "x", cursorStyle: "wide" }),
    );
    expect(prefs.themeId).toBe(TERMINAL_DEFAULTS.themeId);
    expect(prefs.fontSize).toBe(FONT_SIZE_MAX);
    expect(prefs.fontFamily).toBe(TERMINAL_DEFAULTS.fontFamily);
    expect(prefs.cursorStyle).toBe(TERMINAL_DEFAULTS.cursorStyle);
    expect(clampFontSize(1)).toBe(FONT_SIZE_MIN);
  });

  it("persists a patch and keeps the other values", () => {
    writeTerminalPrefs({ themeId: "dracula" });
    writeTerminalPrefs({ fontSize: 18 });
    const prefs = parseTerminalPrefs(localStorage.getItem("serverui-terminal") ?? "");
    expect(prefs.themeId).toBe("dracula");
    expect(prefs.fontSize).toBe(18);
  });

  it("ships unique themes and resolves unknown ids to the default", () => {
    const ids = TERMINAL_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(10);
    expect(getTerminalTheme("unknown").id).toBe("serverui");
  });
});
