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
  HouseholdUser,
  siteLabel,
  timeAgo,
  timeUntil,
} from "@/lib/types";
import LogInjectionForm from "@/components/LogInjectionForm";
import UserAttributionChip, { userColor } from "@/components/UserAttributionChip";
import { Plus } from "@/components/icons";
import { formatDose } from "@/lib/formatDose";

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
  const isAdmin = user?.role === "admin";

  const [data, setData] = useState<DashboardData | null>(null);
  const [compounds, setCompounds] = useState<CompoundRead[]>([]);
  const [householdUsers, setHouseholdUsers] = useState<HouseholdUser[]>([]);
  const [fabOpen, setFabOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{ compoundId?: string; isSkip?: boolean }>({});
  const [tick, setTick] = useState(0);
  // Admins default to Household view; members default to Mine
  const [weekScope, setWeekScope] = useState<"household" | "mine">(
    isAdmin ? "household" : "mine"
  );

  const load = useCallback(async () => {
    const [dash, cpds, us] = await Promise.all([
      apiFetch("/api/dashboard").then((r) => (r.ok ? r.json() : null)),
      apiFetch("/api/compounds").then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/users/household").then((r) => (r.ok ? r.json() : [])),
    ]);
    setData(dash);
    setCompounds(cpds);
    setHouseholdUsers(us);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, [load]);

  void tick;

  const compoundsById = Object.fromEntries(compounds.map((c) => [c.id, c]));

  const activeWeekSummary = data
    ? weekScope === "household"
      ? data.week_summary
      : data.my_week_summary
    : null;

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
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDose(compoundsById[item.compound_id], { dose_mcg: item.dose_mcg })}
                  </p>
                  <div className="mt-0.5">
                    <UserAttributionChip userId={item.assignee_user_id} userName={item.assignee_name} size="sm" />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-sm font-medium tabular-nums ${
                    new Date(item.next_fire_at) <= new Date() ? "text-red-500" : "text-blue-600"
                  }`}>
                    {timeUntil(item.next_fire_at)}
                  </span>
                  <button
                    onClick={() => {
                      setModalConfig({ compoundId: String(item.compound_id) });
                      setFabOpen(true);
                    }}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Log
                  </button>
                  <button
                    onClick={() => {
                      setModalConfig({ compoundId: String(item.compound_id), isSkip: true });
                      setFabOpen(true);
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    Skip
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* This week summary */}
      {data && activeWeekSummary && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <SectionTitle>This week</SectionTitle>
            <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
              {(["household", "mine"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setWeekScope(s)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    weekScope === s
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-400"
                  }`}
                >
                  {s === "household" ? "Household" : "Mine"}
                </button>
              ))}
            </div>
          </div>
          <Card>
            <div className="mb-3 flex gap-4">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {activeWeekSummary.total_injections}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">doses</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {activeWeekSummary.by_compound.length}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">compounds</p>
              </div>
            </div>
            {activeWeekSummary.by_compound.length > 0 && (
              <div className="space-y-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                {activeWeekSummary.by_compound.map((c) => (
                  <div key={c.compound_name}>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">{c.compound_name}</span>
                      <span className="font-medium text-gray-900 tabular-nums dark:text-white">
                        {c.total_mcg.toLocaleString()} mcg
                      </span>
                    </div>
                    {weekScope === "household" && c.by_user.length > 1 && (
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                        {c.by_user.map((u) => `${u.user_name}: ${u.total_mcg.toLocaleString()} mcg`).join(" · ")}
                      </p>
                    )}
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
          <Card className="overflow-hidden">
            <DashboardChart data={data.timeline} householdUsers={householdUsers} />
          </Card>
        </section>
      )}

      {/* Last injection per compound */}
      {data && data.last_by_compound.length > 0 && (
        <section>
          <SectionTitle>Last dose</SectionTitle>
          <div className="space-y-2">
            {data.last_by_compound.map((item) => {
              const notCurrentUser = item.injected_by_user_id !== user?.id;
              return (
                <Card
                  key={item.compound_id}
                  className={`flex items-center justify-between gap-2 ${
                    notCurrentUser
                      ? "bg-amber-50/60 dark:bg-amber-950/20"
                      : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate dark:text-white">{item.compound_name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDose(compoundsById[item.compound_id], {
                        dose_mcg: item.dose_mcg,
                        quantity: item.quantity,
                      })}
                      {item.injection_site && ` · ${siteLabel(item.injection_site)}`}
                    </p>
                    <div className="mt-0.5">
                      <UserAttributionChip userId={item.injected_by_user_id} userName={item.injector_name} size="sm" />
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-gray-400 tabular-nums">
                    {timeAgo(item.injected_at)}
                  </span>
                </Card>
              );
            })}
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
                <div key={inj.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    {/* Name leads the line */}
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <UserAttributionChip
                        userId={inj.injected_by_user_id}
                        userName={inj.injector_name}
                        size="sm"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        injected {formatDose(compound, inj)} {compound?.name ?? `#${inj.compound_id}`}
                        {compound?.is_blend ? ` via ${compound.name}` : ""}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                    {timeAgo(inj.injected_at)}
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
          <p className="text-gray-400">No doses yet.</p>
          <button
            onClick={() => setFabOpen(true)}
            className="mt-2 text-sm text-blue-600"
          >
            Log your first dose →
          </button>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => { setModalConfig({}); setFabOpen(true); }}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 shadow-lg active:scale-95"
        aria-label="Log dose"
      >
        <Plus size={26} className="text-white" strokeWidth={2.5} />
      </button>

      {/* FAB modal */}
      {fabOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) { setFabOpen(false); setModalConfig({}); } }}
        >
          <div className="w-full max-w-md overflow-y-auto rounded-t-2xl bg-white px-5 pt-5 pb-8 sm:max-h-[90vh] sm:rounded-2xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {modalConfig.isSkip ? "Skip dose" : "Log dose"}
              </h2>
              <button
                onClick={() => { setFabOpen(false); setModalConfig({}); }}
                className="text-2xl leading-none text-gray-400 dark:text-gray-500"
              >
                ×
              </button>
            </div>
            <LogInjectionForm
              compounds={compounds}
              householdUsers={householdUsers}
              initialCompoundId={modalConfig.compoundId}
              initialIsSkip={modalConfig.isSkip}
              onSuccess={() => {
                setFabOpen(false);
                setModalConfig({});
                load();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
