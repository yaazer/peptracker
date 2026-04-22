"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Clock, FlaskConical, Home, Plus } from "@/components/icons";

const tabs = [
  { href: "/dashboard", label: "Home", Icon: Home },
  { href: "/log", label: "Log", Icon: Plus },
  { href: "/history", label: "History", Icon: Clock },
  { href: "/compounds", label: "Compounds", Icon: FlaskConical },
  { href: "/protocols", label: "Protocols", Icon: Bell },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex h-16">
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                active ? "text-blue-500" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.5 : 1.8}
                className={active ? "text-blue-500" : "text-gray-400"}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
