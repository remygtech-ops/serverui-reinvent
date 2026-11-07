"use client";

import { useEffect, useRef, useState } from "react";

import {
  checkForUpdate,
  currentVersion,
  describeUpdateError,
  restartApp,
  type UpdateInfo,
} from "@/src/lib/app-updater";

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "available"; update: UpdateInfo }
  | { kind: "installing"; update: UpdateInfo; progress: number | null }
  | { kind: "restarting" }
  | { kind: "error"; message: string };

/** Desktop self-update: check the signed release feed, install, restart. */
export function UpdateSettings() {
  const [version, setVersion] = useState<string | null>(null);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void currentVersion().then((value) => {
      if (!alive.current) return;
      setVersion(value);
      setDesktop(value !== null);
    });
    return () => {
      alive.current = false;
    };
  }, []);

  async function check() {
    setState({ kind: "checking" });
    try {
      const result = await checkForUpdate();
      if (!alive.current) return;
      if (result.kind === "available") setState({ kind: "available", update: result.update });
      else if (result.kind === "up-to-date") setState({ kind: "up-to-date" });
      else setDesktop(false);
    } catch (err) {
      if (alive.current) setState({ kind: "error", message: describeUpdateError(err) });
    }
  }

  async function install(update: UpdateInfo) {
    setState({ kind: "installing", update, progress: null });
    try {
      await update.install((progress) => {
        if (alive.current) setState({ kind: "installing", update, progress });
      });
      if (!alive.current) return;
      setState({ kind: "restarting" });
      await restartApp();
    } catch (err) {
      if (alive.current) setState({ kind: "error", message: describeUpdateError(err) });
    }
  }

  const busy =
    state.kind === "checking" || state.kind === "installing" || state.kind === "restarting";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto px-6 py-8">
      <h3 className="text-2xl font-semibold tracking-tight sui-title">Updates</h3>

      <section
        className="sui-card mt-6 max-w-2xl space-y-3 rounded-[14px] p-4"
        aria-label="Software update"
      >
        <h4 className="text-sm font-medium sui-title">Software update</h4>

        {desktop === false ? (
          <p className="text-sm leading-6 sui-muted">
            In-app updates are only available in the ServerUI desktop app. The web version is
            updated by redeploying it.
          </p>
        ) : (
          <>
            <p className="text-sm leading-6 sui-muted">
              Installed version: <span className="font-medium sui-title">{version ?? "…"}</span>.
              Updates are downloaded from GitHub and verified with a signature before they are
              installed. Your servers, passwords and settings are kept.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || desktop === null}
                onClick={() => void check()}
                className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm sui-title hover:bg-white/10 disabled:opacity-50"
              >
                {state.kind === "checking" ? "Checking…" : "Check for updates"}
              </button>
              {state.kind === "available" ? (
                <button
                  type="button"
                  onClick={() => void install(state.update)}
                  className="rounded-md bg-[var(--toggle-active)] px-3 py-1.5 text-sm text-[var(--toggle-active-fg)] hover:opacity-90"
                >
                  Install {state.update.version} and restart
                </button>
              ) : null}
            </div>

            {state.kind === "up-to-date" ? (
              <p className="text-sm text-emerald-300/90" role="status">
                You are up to date.
              </p>
            ) : null}

            {state.kind === "available" ? (
              <div className="space-y-1.5" role="status">
                <p className="text-sm sui-title">Version {state.update.version} is available.</p>
                {state.update.notes ? (
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-2.5 text-[12px] leading-5 sui-muted">
                    {state.update.notes}
                  </pre>
                ) : null}
              </div>
            ) : null}

            {state.kind === "installing" ? (
              <div className="space-y-1.5" role="status">
                <p className="text-sm sui-title">
                  Downloading {state.update.version}
                  {state.progress !== null ? ` (${Math.round(state.progress * 100)}%)` : "…"}
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-sky-400 transition-[width]"
                    style={{ width: `${Math.round((state.progress ?? 0.05) * 100)}%` }}
                  />
                </div>
                <p className="text-[12px] sui-muted">
                  ServerUI will close and reopen by itself when the install is done.
                </p>
              </div>
            ) : null}

            {state.kind === "restarting" ? (
              <p className="text-sm sui-title" role="status">
                Restarting ServerUI…
              </p>
            ) : null}

            {state.kind === "error" ? (
              <p className="text-sm text-red-300/90" role="alert">
                {state.message}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
