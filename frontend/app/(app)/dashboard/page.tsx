"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import {
  CompoundRead,
  DashboardData,
  formatDatetime,
  siteLabel,
  timeAgo,
  timeUntil,
} from "@/lib/types";
import LogInjectionForm from "@/components/LogInjectionForm";
import { Plus } from "@/components/icons";

function LogOutIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const DashboardChart = dynamic(
  () => import("@/components/DashboardChart"),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" /> }
);

function greeting(name: string): string {
  const h = new Date().getHours();
  const tod = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return `Good ${tod}, ${name.split(" ")[0]}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {children}
    </p>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [compounds, setCompounds] = useState<CompoundRead[]>([]);
  const [fabOpen, setFabOpen] = useState(false);
  const [tick, setTick] = useState(0); // drives countdown re-render every minute

  const load = useCallback(async () => {
    const [dash, cpds] = await Promise.all([
      apiFetch("/api/dashboard").then((r) => (r.ok ? r.json() : null)),
      apiFetch("/api/compounds").then((r) => (r.ok ? r.json() : [])),
    ]);
    setData(dash);
    setCompounds(cpds);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, [load]);

  // Suppress unused-var warning for tick — it drives re-render for countdowns
  void tick;

  return (
    <div className="px-4 pt-5 pb-6 space-y-5">
      {/* Greeting + logout */}
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold text-gray-900 dark:text-white">
          {user ? greeting(user.name) : "Dashboard"}
        </p>
        <button
          onClick={async () => { await logout(); router.replace("/login"); }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 active:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label="Sign out"
        >
          <LogOutIcon />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>

      {/* Next doses */}
      {data && data.next_doses.length > 0 && (
        <section>
          <SectionTitle>Next dose</SectionTitle>
          <div className="space-y-2">
            {data.next_doses.map((item) => (
              <Card key={item.protocol_id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate dark:text-white">{item.compound_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{item.dose_mcg} mcg</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`text-sm font-medium tabular-nums ${
                    new Date(item.next_fire_at) <= new Date()
                      ? "text-red-500"
                      : "text-blue-600"
                  }`}>
                    {timeUntil(item.next_fire_at)}
                  </span>
                  <button
                    onClick={() => setFabOpen(true)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Log
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* This week summary */}
      {data && (
        <section>
          <SectionTitle>This week</SectionTitle>
          <Card>
            <div className="mb-3 flex gap-4">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {data.week_summary.total_injections}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">injections</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {data.week_summary.by_compound.length}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">compounds</p>
              </div>
            </div>
            {data.week_summary.by_compound.length > 0 && (
              <div className="space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
                {data.week_summary.by_compound.map((c) => (
                  <div key={c.compound_name} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{c.compound_name}</span>
                    <span className="font-medium text-gray-900 tabular-nums dark:text-white">
                      {c.total_mcg.toLocaleString()} mcg
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}

      {/* 30-day timeline chart */}
      {data && (
        <section>
          <SectionTitle>30-day timeline</SectionTitle>
          <Card className="overflow-hidden">
            <DashboardChart data={data.timeline} />
          </Card>
        </section>
      )}

      {/* Last injection per compound */}
      {data && data.last_by_compound.length > 0 && (
        <section>
          <SectionTitle>Last injection</SectionTitle>
          <div className="space-y-2">
            {data.last_by_compound.map((item) => (
              <Card key={item.compound_id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate dark:text-white">{item.compound_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {item.dose_mcg} mcg · {siteLabel(item.injection_site)}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-gray-400 tabular-nums">
                  {timeAgo(item.injected_at)}
                </span>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity */}
      {data && data.recent.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <SectionTitle>Recent activity</SectionTitle>
            <Link href="/history" className="text-xs text-blue-600">
              See all →
            </Link>
          </div>
          <Card className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.recent.map((inj) => {
              const compound = compounds.find((c) => c.id === inj.compound_id);
              return (
                <div key={inj.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {compound?.name ?? `#${inj.compound_id}`}
                    </span>
                    <span className="ml-2 text-sm text-gray-400 dark:text-gray-500">
                      {inj.dose_mcg} mcg
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                    {formatDatetime(inj.injected_at)}
                  </span>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {/* Empty state */}
      {data && data.recent.length === 0 && (
        <div className="mt-8 text-center">
          <p className="text-gray-400">No injections yet.</p>
          <button
            onClick={() => setFabOpen(true)}
            className="mt-2 text-sm text-blue-600"
          >
            Log your first injection →
          </button>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setFabOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-lg active:scale-95"
        aria-label="Log injection"
      >
        <Plus size={26} className="text-white" strokeWidth={2.5} />
      </button>

      {/* FAB modal */}
      {fabOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setFabOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-2xl bg-white px-5 pt-5 pb-8 sm:rounded-2xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Log injection</h2>
              <button
                onClick={() => setFabOpen(false)}
                className="text-2xl leading-none text-gray-400 dark:text-gray-500"
              >
                ×
              </button>
            </div>
            <LogInjectionForm
              compounds={compounds}
              onSuccess={() => {
                setFabOpen(false);
                load();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
