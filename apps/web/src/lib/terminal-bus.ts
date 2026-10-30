/**
 * Lets other apps (Snippets, the vault) type into the active terminal session.
 * The Terminal listens while a session is on screen. If nothing handles the event the
 * sender opens a Terminal window and the text waits here until a session is ready.
 */
const EVENT = "serverui-terminal-input";

export type TerminalInput = {
  text: string;
  /** Press Enter after the text. */
  run?: boolean;
  /** Set by a Terminal session that accepted the text. */
  handled?: boolean;
};

let pending: TerminalInput | null = null;

/** Returns true when an open terminal took the text, false when it is queued for the next one. */
export function sendToTerminal(input: Omit<TerminalInput, "handled">): boolean {
  const detail: TerminalInput = { ...input, handled: false };
  window.dispatchEvent(new CustomEvent<TerminalInput>(EVENT, { detail }));
  if (detail.handled) return true;
  pending = detail;
  return false;
}

export function takePendingTerminalInput(): TerminalInput | null {
  const next = pending;
  pending = null;
  return next;
}

export function listenForTerminalInput(handler: (input: TerminalInput) => boolean) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<TerminalInput>).detail;
    if (detail.handled) return;
    if (handler(detail)) detail.handled = true;
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
