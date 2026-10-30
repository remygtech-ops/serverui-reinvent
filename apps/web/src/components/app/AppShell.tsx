"use client";

import { LockGate } from "@/src/components/app/LockScreen";
import { Desktop } from "@/src/components/desktop/Desktop";
import { AppLockProvider } from "@/src/lib/app-lock";
import { AppearanceEffects } from "@/src/lib/appearance";
import { RuntimeProvider } from "@/src/lib/runtime";
import { SessionProvider } from "@/src/lib/session";
import { ThemeProvider } from "@/src/lib/theme";
import { WallpaperProvider } from "@/src/lib/wallpaper";

export function AppShell() {
  return (
    <ThemeProvider>
      <AppearanceEffects />
      <WallpaperProvider>
        <RuntimeProvider>
          <SessionProvider>
            <AppLockProvider>
              <LockGate>
                <AppScreens />
              </LockGate>
            </AppLockProvider>
          </SessionProvider>
        </RuntimeProvider>
      </WallpaperProvider>
    </ThemeProvider>
  );
}

function AppScreens() {
  return (
    <div className="h-dvh w-full">
      <Desktop />
    </div>
  );
}
