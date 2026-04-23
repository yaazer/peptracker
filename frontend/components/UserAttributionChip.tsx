"use client";

import { getUserTailwindColor } from "@/lib/colors";

interface Props {
  userId: number;
  userName: string;
  size?: "sm" | "md";
  showName?: boolean;
}

/** @deprecated Use getUserTailwindColor from @/lib/colors */
export function userColor(userId: number): string {
  return getUserTailwindColor(userId);
}

export default function UserAttributionChip({
  userId,
  userName,
  size = "md",
  showName = true,
}: Props) {
  const color = getUserTailwindColor(userId);
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
