// Single source of truth for deterministic per-entity colors.
// userId (or compoundIndex) % palette length gives a stable color across the app.

// Hex values for use in Recharts SVG fills — must stay index-aligned with TAILWIND below.
export const USER_HEX_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#f43f5e", // rose-500
  "#06b6d4", // cyan-500
  "#d946ef", // fuchsia-500
  "#14b8a6", // teal-500
];

// Tailwind bg-* classes for CSS-based UI (avatars, chips) — same index as hex above.
export const USER_TAILWIND_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-teal-500",
];

// Compound colors — distinct from user colors to avoid confusion in "By compound" mode.
export const COMPOUND_HEX_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#84cc16", // lime-500
];

export function getUserHexColor(userId: number): string {
  return USER_HEX_COLORS[userId % USER_HEX_COLORS.length];
}

export function getUserTailwindColor(userId: number): string {
  return USER_TAILWIND_COLORS[userId % USER_TAILWIND_COLORS.length];
}

export function getCompoundHexColor(index: number): string {
  return COMPOUND_HEX_COLORS[index % COMPOUND_HEX_COLORS.length];
}
