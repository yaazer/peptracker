// Single source of truth for deterministic per-entity colors.
// id % palette length gives a stable color across the app.

// Hex values for use in Recharts SVG fills — must stay index-aligned with TAILWIND below.
// First 8 entries are original; do not reorder them (existing assignments would shift).
export const USER_HEX_COLORS = [
  // — original 8 —
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#f43f5e", // rose-500
  "#06b6d4", // cyan-500
  "#d946ef", // fuchsia-500
  "#14b8a6", // teal-500
  // — extended palette —
  "#FF6B6B", // coral red
  "#FF9F43", // warm orange
  "#FECA57", // yellow
  "#48DBFB", // sky blue
  "#FF9FF3", // pink
  "#54A0FF", // bright blue
  "#5F27CD", // deep purple
  "#00D2D3", // cyan teal
  "#FF6348", // tomato
  "#2ECC71", // emerald green
  "#E056FD", // magenta
  "#C0392B", // deep red
  "#F8B739", // amber gold
  "#26de81", // mint green
  "#fd9644", // peach
  "#45aaf2", // cornflower blue
  "#a29bfe", // lavender
  "#fd79a8", // rose pink
  "#00b894", // seafoam
  "#6c5ce7", // violet
];

// Tailwind bg-* classes for CSS-based UI (avatars, chips) — same index as hex above.
export const USER_TAILWIND_COLORS = [
  // — original 8 —
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-teal-500",
  // — extended palette (closest Tailwind approximations) —
  "bg-red-400",
  "bg-orange-400",
  "bg-yellow-400",
  "bg-sky-300",
  "bg-pink-300",
  "bg-blue-400",
  "bg-purple-700",
  "bg-teal-400",
  "bg-red-500",
  "bg-green-500",
  "bg-fuchsia-400",
  "bg-red-700",
  "bg-yellow-500",
  "bg-green-400",
  "bg-orange-400",
  "bg-blue-400",
  "bg-violet-400",
  "bg-pink-400",
  "bg-emerald-400",
  "bg-violet-600",
];

// Compound colors — used by getCompoundHexColor(index).
// First 8 are original; extended with a broad hue spread for dark-theme visibility.
export const COMPOUND_HEX_COLORS = [
  // — original 8 —
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#84cc16", // lime-500
  // — extended —
  "#FF6B6B", // coral red
  "#FF9F43", // warm orange
  "#FECA57", // yellow
  "#48DBFB", // sky blue
  "#5F27CD", // deep purple
  "#00D2D3", // cyan teal
  "#2ECC71", // emerald green
  "#E056FD", // magenta
  "#F8B739", // amber gold
  "#26de81", // mint green
  "#45aaf2", // cornflower blue
  "#a29bfe", // lavender
  "#fd79a8", // rose pink
  "#00b894", // seafoam
  "#6c5ce7", // violet
  "#FF6348", // tomato
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
