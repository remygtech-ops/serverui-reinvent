import type { IDisposable, IMarker, Terminal } from "@xterm/xterm";

export type PromptMatch = {
  /** Column range of `user@host:` (the colon is included). */
  user: { start: number; width: number };
  /** Column range of the working directory. Empty when the path is missing. */
  path: { start: number; width: number };
};

// Optional "(venv) " style prefix, then user@host:path followed by $, #, % or >.
const PROMPT = /^((?:\([^)\s]*\)\s*)?)([\w.\-+]+@[\w.\-]+:)([^\s$#%>]*)([$#%>])(?:\s|$)/;

/** Finds the `user@host:path$` part of a shell prompt line, or null. */
export function matchPrompt(line: string): PromptMatch | null {
  const match = PROMPT.exec(line);
  if (!match) return null;
  const [, prefix, user, path] = match;
  return {
    user: { start: prefix.length, width: user.length },
    path: { start: prefix.length + user.length, width: path.length },
  };
}

export type PromptColors = { user: string; path: string };

type Options = {
  enabled: () => boolean;
  colors: () => PromptColors;
};

/**
 * Colors the prompt line from the UI. The remote shell is never touched: no PS1
 * injection and nothing installed on the server. A line the shell already colored
 * (non-default foreground) is left alone.
 */
export function installPromptHighlight(terminal: Terminal, options: Options): IDisposable {
  let markers: IMarker[] = [];

  const subscription = terminal.onWriteParsed(() => {
    if (!options.enabled()) return;
    const buffer = terminal.buffer.active;
    if (buffer.type !== "normal") return;

    markers = markers.filter((marker) => !marker.isDisposed);
    const absolute = buffer.baseY + buffer.cursorY;
    if (markers.some((marker) => marker.line === absolute)) return;

    const line = buffer.getLine(absolute);
    if (!line) return;
    const match = matchPrompt(line.translateToString(true));
    if (!match) return;
    const first = line.getCell(match.user.start);
    if (first && !first.isFgDefault()) return;

    const marker = terminal.registerMarker(0);
    if (!marker) return;
    markers.push(marker);
    const colors = options.colors();
    terminal.registerDecoration({
      marker,
      x: match.user.start,
      width: match.user.width,
      foregroundColor: colors.user,
    });
    if (match.path.width > 0) {
      terminal.registerDecoration({
        marker,
        x: match.path.start,
        width: match.path.width,
        foregroundColor: colors.path,
      });
    }
  });

  return {
    dispose() {
      subscription.dispose();
      for (const marker of markers) marker.dispose();
      markers = [];
    },
  };
}
