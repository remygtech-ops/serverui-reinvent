"use client";

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";

export type MacIconProps = { className?: string; style?: CSSProperties; cpuUsage?: number };

function uid(prefix: string, raw: string) {
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
}

/** Shared macOS plate. Pass `fill` for a flat vector tile; `from`/`to` for a shaded plate. */
export function MacIconPlate({
  className,
  from,
  to,
  fill,
  children,
}: {
  className?: string;
  from?: string;
  to?: string;
  fill?: string;
  children: ReactNode;
}) {
  const raw = useId();
  const plate = uid("plate", raw);
  const sheen = uid("sheen", raw);
  const flat = Boolean(fill);

  return (
    <span className={`sui-mac-app-icon ${className ?? ""}`} aria-hidden>
      <svg
        viewBox="0 0 128 128"
        className="block size-full"
        focusable="false"
        shapeRendering="geometricPrecision"
      >
        {flat ? null : (
          <defs>
            <linearGradient id={plate} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={from} />
              <stop offset="100%" stopColor={to} />
            </linearGradient>
            <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
              <stop offset="22%" stopColor="#ffffff" stopOpacity="0.06" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
            </linearGradient>
          </defs>
        )}
        <rect width="128" height="128" fill={flat ? fill : `url(#${plate})`} />
        {flat ? null : (
          <rect width="128" height="128" fill={`url(#${sheen})`} pointerEvents="none" />
        )}
        {children}
      </svg>
    </span>
  );
}

/** Server metrics dashboard: dark glass well + live area chart (Activity Monitor language). */
export function DashboardMacIcon({ className }: MacIconProps) {
  const raw = useId();
  const green = uid("g", raw);
  const orange = uid("o", raw);
  const blue = uid("b", raw);
  const well = uid("well", raw);
  const clip = uid("clip", raw);

  return (
    <MacIconPlate className={className} from="#4a4a50" to="#1c1c1f">
      <defs>
        <linearGradient id={green} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#3D6A48" />
          <stop offset="100%" stopColor="#7E9A86" />
        </linearGradient>
        <linearGradient id={orange} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#8A5A3A" />
          <stop offset="100%" stopColor="#C4A07A" />
        </linearGradient>
        <linearGradient id={blue} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#3A5A72" />
          <stop offset="100%" stopColor="#7A9BB0" />
        </linearGradient>
        <linearGradient id={well} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a0a0c" />
          <stop offset="100%" stopColor="#16161a" />
        </linearGradient>
        <clipPath id={clip}>
          <rect x="16" y="24" width="96" height="80" rx="18" />
        </clipPath>
      </defs>

      <rect x="16" y="24" width="96" height="80" rx="18" fill={`url(#${well})`} />
      <rect
        x="16"
        y="24"
        width="96"
        height="80"
        rx="18"
        fill="none"
        stroke="rgba(0,0,0,0.45)"
        strokeWidth="2"
      />
      <rect x="17" y="25" width="94" height="18" rx="16" fill="rgba(255,255,255,0.06)" />

      <g clipPath={`url(#${clip})`}>
        <g opacity="0.2" stroke="#aeaeb2" strokeWidth="1">
          <path d="M26 44h76M26 58h76M26 72h76" />
        </g>
        <path
          d="M24 96 C36 80 42 72 52 70 C64 67 70 86 82 78 C92 71 98 58 104 54 L104 96 Z"
          fill={`url(#${blue})`}
          opacity="0.7"
        />
        <path
          d="M24 96 C32 88 40 64 52 60 C66 54 72 80 84 72 C94 66 100 50 104 48 L104 96 Z"
          fill={`url(#${green})`}
          opacity="0.9"
        />
        <path
          d="M24 96 C30 90 38 84 46 82 C58 78 64 90 74 86 C86 80 96 66 104 64 L104 96 Z"
          fill={`url(#${orange})`}
          opacity="0.55"
        />
        <path
          d="M24 70 C36 54 42 46 52 44 C64 41 70 60 82 52 C92 45 98 32 104 28"
          fill="none"
          stroke="#c8d4cc"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="104" cy="28" r="3.6" fill="#C4A07A" />
      </g>
    </MacIconPlate>
  );
}

/**
 * Files: Finder-style two-tone blue tile (an original design, not Apple's
 * Finder face) with a white folder whose pages lift on hover. The two lights
 * on the folder hint at a server drive.
 */
export function FilesMacIcon({ className }: MacIconProps) {
  const raw = useId();
  const right = uid("files-right", raw);
  const gloss = uid("files-gloss", raw);

  return (
    <MacIconPlate className={className} from="#86d8ff" to="#2a9cf3">
      <defs>
        <linearGradient id={right} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d8ff2" />
          <stop offset="100%" stopColor="#1559d4" />
        </linearGradient>
        <linearGradient id={gloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="64" width="64" height="128" fill={`url(#${right})`} />
      <rect width="128" height="128" fill={`url(#${gloss})`} pointerEvents="none" />
      <g transform="translate(-4 -4)">
        <path
          className="sui-folder-tab"
          fill="#d9edff"
          d="M30 48V40c0-3.6 2.9-6.5 6.5-6.5h16.2c2.1 0 4.1 1 5.4 2.7L62 42h32.5c3.6 0 6.5 2.9 6.5 6.5V52H30z"
        />
        <rect
          className="sui-folder-paper sui-folder-paper-b"
          x="42"
          y="38"
          width="48"
          height="42"
          rx="3.5"
          fill="#9be7c4"
        />
        <rect
          className="sui-folder-paper sui-folder-paper-a"
          x="36"
          y="42"
          width="52"
          height="44"
          rx="3.5"
          fill="#ffd45c"
        />
        <path
          className="sui-folder-front"
          fill="#ffffff"
          fillOpacity="0.96"
          d="M28 52h72c4.4 0 8 3.6 8 8v30c0 5.5-4.5 10-10 10H38c-5.5 0-10-4.5-10-10V56c0-2.2 1.8-4 4-4z"
        />
        <circle cx="86" cy="89" r="3.2" fill="#2a9cf3" />
        <circle cx="96" cy="89" r="3.2" fill="#34c759" />
      </g>
    </MacIconPlate>
  );
}

/** Terminal: macOS-style metal frame around a black screen; the prompt types on hover. */
export function TerminalMacIcon({ className }: MacIconProps) {
  const raw = useId();
  const screen = uid("term-screen", raw);
  const glare = uid("term-glare", raw);
  const mark = "#f5f5f7";

  return (
    <MacIconPlate className={className} from="#d9d9de" to="#77777f">
      <defs>
        <linearGradient id={screen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#36363a" />
          <stop offset="100%" stopColor="#0b0b0d" />
        </linearGradient>
        <linearGradient id={glare} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="120" height="120" rx="25" fill={`url(#${screen})`} />
      <rect x="4" y="4" width="120" height="42" rx="25" fill={`url(#${glare})`} />
      <path
        className="sui-term-prompt"
        d="M27 33l15 12-15 12"
        fill="none"
        stroke={mark}
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        className="sui-term-underscore"
        x="48"
        y="53"
        width="16"
        height="5.5"
        rx="1.5"
        fill={mark}
      />
      <rect
        className="sui-term-ch sui-term-ch-1"
        x="48"
        y="53"
        width="5"
        height="5.5"
        rx="1.2"
        fill={mark}
      />
      <rect
        className="sui-term-ch sui-term-ch-2"
        x="56"
        y="53"
        width="4"
        height="5.5"
        rx="1.2"
        fill={mark}
      />
      <rect
        className="sui-term-ch sui-term-ch-3"
        x="63"
        y="53"
        width="7"
        height="5.5"
        rx="1.2"
        fill={mark}
      />
      <rect className="sui-term-cursor" x="74" y="44" width="4" height="14" rx="1" fill={mark} />
    </MacIconPlate>
  );
}

const WAVE_BASELINE = 64;
const WAVE_SAMPLES = 56;
const WAVE_FLAT = Array.from({ length: WAVE_SAMPLES }, () => WAVE_BASELINE);

function wavePath(samples: number[]) {
  const last = Math.max(1, samples.length - 1);
  return samples
    .map((y, index) => {
      const x = 8 + (index * 112) / last;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/** System Monitor: matte black tile + running CPU waveform. */
export function MonitorMacIcon({ className, cpuUsage = 0 }: MacIconProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const cpuRef = useRef(0);
  const ampRef = useRef(0);
  const phaseRef = useRef(0);
  const samplesRef = useRef<number[]>([...WAVE_FLAT]);
  const skipRef = useRef(0);

  useEffect(() => {
    cpuRef.current = Math.max(0, Math.min(100, cpuUsage));
  }, [cpuUsage]);

  useEffect(() => {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }

    const slot = rootRef.current?.closest("button") ?? rootRef.current;
    if (!slot) return undefined;

    let raf = 0;
    let hovering = false;

    const tick = () => {
      if (!hovering) {
        raf = 0;
        return;
      }
      raf = window.requestAnimationFrame(tick);
      skipRef.current += 1;
      if (skipRef.current < 6) return;
      skipRef.current = 0;

      const cpu = cpuRef.current;
      const target = cpu <= 0 ? 0 : 6 + (cpu / 100) * 36;
      ampRef.current += (target - ampRef.current) * 0.03;
      phaseRef.current += 0.1 + ampRef.current * 0.002;
      const phase = phaseRef.current;
      const amp = ampRef.current;
      const y = Math.min(
        108,
        Math.max(
          20,
          WAVE_BASELINE -
            Math.sin(phase) * amp -
            Math.sin(phase * 2.15) * amp * 0.28 +
            (Math.random() - 0.5) * (0.6 + amp * 0.04),
        ),
      );
      samplesRef.current.shift();
      samplesRef.current.push(y);
      pathRef.current?.setAttribute("d", wavePath(samplesRef.current));
    };

    const onEnter = () => {
      hovering = true;
      if (!raf) raf = window.requestAnimationFrame(tick);
    };
    const onLeave = () => {
      hovering = false;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      samplesRef.current = [...WAVE_FLAT];
      ampRef.current = 0;
      pathRef.current?.setAttribute("d", wavePath(WAVE_FLAT));
    };

    slot.addEventListener("pointerenter", onEnter);
    slot.addEventListener("pointerleave", onLeave);
    return () => {
      hovering = false;
      if (raf) window.cancelAnimationFrame(raf);
      slot.removeEventListener("pointerenter", onEnter);
      slot.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <span ref={rootRef} className="block size-full">
      <MacIconPlate className={className} fill="#141414">
        <path
          ref={pathRef}
          d={wavePath(WAVE_FLAT)}
          fill="none"
          stroke="#30D158"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </MacIconPlate>
    </span>
  );
}

/** Settings: original apple-settings.svg; gear turns on hover. */
export function SettingsMacIcon({ className }: MacIconProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const raw = useId();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const prefix = uid("set", raw);
    let live = true;

    fetch("/icons/settings.svg")
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error("settings svg"))))
      .then((text) => {
        if (!live || !host) return;
        host.innerHTML = text
          .replaceAll('id="Background_13_"', `id="${prefix}-bg"`)
          .replaceAll("url(#Background_13_)", `url(#${prefix}-bg)`)
          .replaceAll('id="SVGID_1_"', `id="${prefix}-fill"`)
          .replaceAll("url(#SVGID_1_)", `url(#${prefix}-fill)`)
          .replace("<svg ", '<svg class="block size-full" focusable="false" ');
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, [raw]);

  return (
    <span ref={hostRef} className={`sui-mac-app-icon ${className ?? ""}`} aria-hidden>
      <img src="/icons/settings.svg" alt="" className="block size-full" draggable={false} />
    </span>
  );
}

/** Editor: black tile + gold [ 0 ] that closes and blinks on hover. */
export function EditorMacIcon({ className }: MacIconProps) {
  const raw = useId();
  const gold = uid("editor-gold", raw);
  return (
    <span className={`sui-mac-app-icon ${className ?? ""}`} aria-hidden>
      <svg viewBox="0 0 128 128" className="block size-full" focusable="false">
        <defs>
          <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD84A" />
            <stop offset="100%" stopColor="#F5A000" />
          </linearGradient>
        </defs>
        <rect width="128" height="128" fill="#000" />
        <g
          fill="none"
          stroke={`url(#${gold})`}
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            className="sui-editor-bracket sui-editor-bracket-l"
            d="M34 36H30a10 10 0 0 0-10 10v36a10 10 0 0 0 10 10h4"
          />
          <path
            className="sui-editor-bracket sui-editor-bracket-r"
            d="M94 36h4a10 10 0 0 1 10 10v36a10 10 0 0 1-10 10H94"
          />
        </g>
        <path
          className="sui-editor-zero"
          fill={`url(#${gold})`}
          fillRule="evenodd"
          d="M64 30c10.5 0 19 8.1 19 21.5v25C83 89.9 74.5 98 64 98S45 89.9 45 76.5v-25C45 38.1 53.5 30 64 30Zm0 14c-4.7 0-8 3.5-8 9.5v21c0 6 3.3 9.5 8 9.5s8-3.5 8-9.5v-21c0-6-3.3-9.5-8-9.5Z"
        />
        <circle className="sui-editor-caret" cx="64" cy="64" r="7" fill={`url(#${gold})`} />
      </svg>
    </span>
  );
}

/** Snippets: violet plate with a command line and a bracket pair. */
export function SnippetsMacIcon({ className }: MacIconProps) {
  return (
    <MacIconPlate className={className} from="#8B7CFF" to="#4B3FD1">
      <g fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round">
        <path d="M46 40 22 64l24 24" />
        <path d="M82 40l24 24-24 24" />
      </g>
      <rect
        x="55"
        y="38"
        width="18"
        height="52"
        rx="9"
        transform="rotate(18 64 64)"
        fill="#fff"
        opacity="0.92"
      />
    </MacIconPlate>
  );
}

/** Info: dark frosted plate + white circled i that lifts on hover. */
export function InfoMacIcon({ className }: MacIconProps) {
  return (
    <span className={`sui-mac-app-icon sui-info-icon ${className ?? ""}`} aria-hidden>
      <svg
        viewBox="0 0 128 128"
        className="block size-full"
        focusable="false"
        shapeRendering="geometricPrecision"
      >
        <circle
          className="sui-info-ripple"
          cx="64"
          cy="64"
          r="46"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3"
        />
        <circle
          className="sui-info-ring"
          cx="64"
          cy="64"
          r="38"
          fill="none"
          stroke="#ffffff"
          strokeWidth="8"
        />
        <circle className="sui-info-dot" cx="64" cy="44" r="7" fill="#ffffff" />
        <rect
          className="sui-info-stem"
          x="57"
          y="56"
          width="14"
          height="34"
          rx="7"
          fill="#ffffff"
        />
      </svg>
    </span>
  );
}
