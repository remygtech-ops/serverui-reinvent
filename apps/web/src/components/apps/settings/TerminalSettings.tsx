"use client";

import { Minus, Plus } from "lucide-react";

import {
  FONT_FAMILIES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  clampFontSize,
  useTerminalPrefs,
  type CursorStyle,
  type FontFamilyId,
} from "@/src/lib/terminal-prefs";
import { TERMINAL_THEMES, getTerminalTheme } from "@/src/lib/terminal-themes";

const CURSORS: { id: CursorStyle; label: string }[] = [
  { id: "block", label: "Block" },
  { id: "bar", label: "Bar" },
  { id: "underline", label: "Underline" },
];

/** Terminal-only preferences. Everything here applies live to open terminals. */
export function TerminalSettings() {
  const { prefs, updatePrefs, resetPrefs } = useTerminalPrefs();
  const def = getTerminalTheme(prefs.themeId);
  const colors = def.theme;
  const transparent = colors.background === "#00000000";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto px-6 py-8">
      <h3 className="text-2xl font-semibold tracking-tight sui-title">Terminal</h3>

      <section
        className="sui-card mt-6 max-w-2xl space-y-3 rounded-[14px] p-4"
        aria-label="Preview"
      >
        <h4 className="text-sm font-medium sui-title">Preview</h4>
        <div
          data-testid="terminal-preview"
          className="overflow-hidden rounded-xl border border-white/15 p-3 leading-snug"
          style={{
            background: transparent ? "rgba(0,0,0,0.55)" : colors.background,
            color: colors.foreground,
            fontFamily: FONT_FAMILIES[prefs.fontFamily].stack,
            fontSize: prefs.fontSize,
          }}
        >
          <PreviewPrompt prefs={prefs.highlightPrompt} user={def.promptUser} path={def.promptPath}>
            {" ls -la"}
          </PreviewPrompt>
          <div style={{ color: colors.blue ?? def.promptPath }}>drwxr-xr-x 4 dasysil Scripts</div>
          <div style={{ color: colors.green ?? def.promptUser }}>-rwxr-xr-x 1 dasysil run.sh</div>
          <div style={{ color: colors.red ?? colors.foreground }}>
            permission denied: secrets.env
          </div>
          <PreviewPrompt prefs={prefs.highlightPrompt} user={def.promptUser} path={def.promptPath}>
            {" "}
            <span
              aria-hidden
              className="inline-block h-[1em] w-[0.6em] translate-y-[0.15em]"
              style={{
                background: prefs.cursorStyle === "block" ? colors.cursor : "transparent",
                borderLeft: prefs.cursorStyle === "bar" ? `2px solid ${colors.cursor}` : undefined,
                borderBottom:
                  prefs.cursorStyle === "underline" ? `2px solid ${colors.cursor}` : undefined,
              }}
            />
          </PreviewPrompt>
        </div>
      </section>

      <section
        className="sui-card mt-6 max-w-2xl space-y-3 rounded-[14px] p-4"
        aria-label="Color theme"
      >
        <h4 className="text-sm font-medium sui-title">Color theme</h4>
        <p className="text-sm leading-6 sui-muted">
          Applies to the Terminal app only. The desktop theme is not affected.
        </p>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          role="listbox"
          aria-label="Terminal theme"
        >
          {TERMINAL_THEMES.map((option) => {
            const selected = option.id === prefs.themeId;
            const bg =
              option.theme.background === "#00000000" ? "#0b0f0c" : option.theme.background;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={option.name}
                onClick={() => updatePrefs({ themeId: option.id })}
                className={`overflow-hidden rounded-xl border text-left outline-none transition ${
                  selected
                    ? "border-sky-400 ring-2 ring-sky-400/50"
                    : "border-white/15 hover:border-white/35"
                }`}
              >
                <span
                  className="block px-2.5 py-2 font-mono text-[11px] leading-4"
                  style={{ background: bg, color: option.theme.foreground }}
                >
                  <span style={{ color: option.promptUser }}>user@host:</span>
                  <span style={{ color: option.promptPath }}>~/dir</span>$ ls
                </span>
                <span className="block px-2.5 py-2 text-[12px] sui-title">{option.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sui-card mt-6 max-w-2xl space-y-4 rounded-[14px] p-4" aria-label="Text">
        <h4 className="text-sm font-medium sui-title">Text</h4>
        <div className="flex items-center gap-3">
          <span className="w-24 text-sm sui-muted">Size</span>
          <button
            type="button"
            aria-label="Smaller text"
            className="flex size-7 items-center justify-center rounded-md border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => updatePrefs({ fontSize: clampFontSize(prefs.fontSize - 1) })}
          >
            <Minus className="size-3.5" />
          </button>
          <input
            type="range"
            aria-label="Font size"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            value={prefs.fontSize}
            onChange={(event) =>
              updatePrefs({ fontSize: clampFontSize(Number(event.target.value)) })
            }
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            aria-label="Larger text"
            className="flex size-7 items-center justify-center rounded-md border border-white/15 bg-white/5 hover:bg-white/10"
            onClick={() => updatePrefs({ fontSize: clampFontSize(prefs.fontSize + 1) })}
          >
            <Plus className="size-3.5" />
          </button>
          <span className="w-12 text-right text-sm tabular-nums sui-title">{prefs.fontSize}px</span>
        </div>
        <p className="text-[12px] sui-muted">
          In a terminal: Ctrl + or Ctrl − to zoom, Ctrl 0 to reset, or Ctrl + mouse wheel.
        </p>
        <div className="flex items-center gap-3">
          <label htmlFor="terminal-font" className="w-24 text-sm sui-muted">
            Font
          </label>
          <select
            id="terminal-font"
            value={prefs.fontFamily}
            onChange={(event) => updatePrefs({ fontFamily: event.target.value as FontFamilyId })}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm sui-title"
          >
            {Object.entries(FONT_FAMILIES).map(([id, font]) => (
              <option key={id} value={id}>
                {font.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-24 text-sm sui-muted">Cursor</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Cursor style">
            {CURSORS.map((cursor) => (
              <button
                key={cursor.id}
                type="button"
                role="radio"
                aria-checked={prefs.cursorStyle === cursor.id}
                onClick={() => updatePrefs({ cursorStyle: cursor.id })}
                className={`rounded-full px-4 py-1.5 text-sm outline-none ${
                  prefs.cursorStyle === cursor.id
                    ? "bg-[var(--toggle-active)] text-[var(--toggle-active-fg)]"
                    : "sui-card sui-title"
                }`}
              >
                {cursor.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section
        className="sui-card mt-6 max-w-2xl space-y-3 rounded-[14px] p-4"
        aria-label="Behavior"
      >
        <h4 className="text-sm font-medium sui-title">Behavior</h4>
        <ToggleRow
          label="Highlight the prompt"
          hint="Colors user@host: and the folder on the line where you type. Only the display changes, nothing is sent to the server."
          checked={prefs.highlightPrompt}
          onChange={(value) => updatePrefs({ highlightPrompt: value })}
        />
        <ToggleRow
          label="Blinking cursor"
          checked={prefs.cursorBlink}
          onChange={(value) => updatePrefs({ cursorBlink: value })}
        />
        <ToggleRow
          label="Copy on select"
          hint="Selecting text copies it to the clipboard."
          checked={prefs.copyOnSelect}
          onChange={(value) => updatePrefs({ copyOnSelect: value })}
        />
        <ToggleRow
          label="Right-click to paste"
          hint="Right-click copies the selection if there is one, otherwise it pastes."
          checked={prefs.rightClickPaste}
          onChange={(value) => updatePrefs({ rightClickPaste: value })}
        />
        <button
          type="button"
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm sui-title hover:bg-white/10"
          onClick={resetPrefs}
        >
          Reset terminal settings
        </button>
      </section>
    </div>
  );
}

function PreviewPrompt({
  prefs: highlight,
  user,
  path,
  children,
}: {
  prefs: boolean;
  user: string;
  path: string;
  children: React.ReactNode;
}) {
  return (
    <div className="whitespace-pre">
      <span style={highlight ? { color: user } : undefined}>dasysil@city:</span>
      <span style={highlight ? { color: path } : undefined}>~/Scripts</span>${children}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm sui-title">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] leading-5 sui-muted">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 shrink-0"
      />
    </label>
  );
}
