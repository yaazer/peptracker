"use client";

interface Props {
  userId: number;
  userName: string;
  size?: "sm" | "md";
  showName?: boolean;
}

const CHIP_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-teal-500",
];

export function userColor(userId: number): string {
  return CHIP_COLORS[userId % CHIP_COLORS.length];
}

export default function UserAttributionChip({
  userId,
  userName,
  size = "md",
  showName = true,
}: Props) {
  const color = userColor(userId);
  const initial = userName.charAt(0).toUpperCase();
  const circleSize = size === "sm" ? "h-5 w-5 text-xs" : "h-6 w-6 text-xs";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`${circleSize} ${color} inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
        aria-hidden="true"
      >
        {initial}
      </span>
      {showName && (
        <span className="font-semibold text-gray-900 dark:text-white">{userName}</span>
      )}
    </span>
  );
}
