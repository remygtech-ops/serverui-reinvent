/**
 * Thin wrapper around the Tauri updater so the UI can be tested and so the web build
 * (no Tauri shell) never imports the native plugins.
 *
 * Updates are signed with the project's minisign key; the public key and the release
 * feed live in tauri.conf.json. Settings and saved servers stay in the user's profile
 * (SQLite + OS keychain), so installing an update never asks to configure anything again.
 */

export type UpdateInfo = {
  version: string;
  notes: string;
  /** Downloads and installs the update, reporting 0..1 progress (null when the size is unknown). */
  install: (onProgress: (fraction: number | null) => void) => Promise<void>;
};

export type UpdateCheck =
  | { kind: "unavailable" }
  | { kind: "up-to-date"; current: string }
  | { kind: "available"; current: string; update: UpdateInfo };

export async function inDesktopShell(): Promise<boolean> {
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    return isTauri();
  } catch {
    return false;
  }
}

export async function currentVersion(): Promise<string | null> {
  if (!(await inDesktopShell())) return null;
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return null;
  }
}

/** Asks the release feed whether a newer signed version exists. Throws on network/signature errors. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!(await inDesktopShell())) return { kind: "unavailable" };
  const current = (await currentVersion()) ?? "";
  const { check } = await import("@tauri-apps/plugin-updater");
  const found = await check();
  if (!found) return { kind: "up-to-date", current };

  return {
    kind: "available",
    current,
    update: {
      version: found.version,
      notes: (found.body ?? "").trim(),
      install: async (onProgress) => {
        let total = 0;
        let received = 0;
        await found.download((event) => {
          if (event.event === "Started") {
            total = event.data.contentLength ?? 0;
            onProgress(total > 0 ? 0 : null);
          } else if (event.event === "Progress") {
            received += event.data.chunkLength;
            onProgress(total > 0 ? Math.min(1, received / total) : null);
          } else if (event.event === "Finished") {
            onProgress(1);
          }
        });
        // The installer cannot overwrite serverui-server.exe while it runs, so stop the backend
        // only now that the download succeeded (a failed download leaves the app fully working).
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("stop_backend");
        await found.install();
      },
    },
  };
}

export async function restartApp(): Promise<void> {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

/** Turns plugin errors into something a person can act on. */
export function describeUpdateError(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err ?? "")).trim();
  const text = raw.toLowerCase();
  if (text.includes("404") || text.includes("not found") || text.includes("valid release json")) {
    return "No update information was found yet. Try again after the next release is published.";
  }
  if (text.includes("signature")) {
    return "The update was refused because its signature could not be verified.";
  }
  if (
    text.includes("network") ||
    text.includes("error sending request") ||
    text.includes("dns") ||
    text.includes("connect") ||
    text.includes("timed out")
  ) {
    return "Could not reach GitHub. Check your internet connection and try again.";
  }
  return raw || "The update check failed.";
}
