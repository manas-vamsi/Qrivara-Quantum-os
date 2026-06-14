import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Format a number with engineering-friendly precision. */
export function fmt(value: number, digits = 2) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/** Format a frequency in Hz to a readable GHz/MHz string. */
export function formatFreq(hz: number) {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(3)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(1)} kHz`;
  return `${hz.toFixed(0)} Hz`;
}

/** Relative time formatter, e.g. "3h ago". */
export function timeAgo(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  const units: [number, string][] = [
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [7, "d"],
    [4.345, "w"],
    [12, "mo"],
    [Number.POSITIVE_INFINITY, "y"],
  ];
  let value = seconds;
  let unit = "s";
  for (const [divisor, label] of units) {
    if (Math.abs(value) < divisor) {
      unit = label;
      break;
    }
    value = Math.floor(value / divisor);
    unit = label;
  }
  if (seconds < 5) return "just now";
  return `${value}${unit} ago`;
}

/** Deterministic pseudo-random generator (seeded) for stable mock charts. */
export function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Title-case helper. */
export function titleCase(str: string) {
  return str.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1));
}

/** Compact microsecond formatter for coherence times (∞ / 1.2k / 340). */
export function fmtUs(x: number) {
  if (!Number.isFinite(x)) return "∞";
  if (x >= 1000) return `${(x / 1000).toFixed(1)}k`;
  return x.toFixed(0);
}
