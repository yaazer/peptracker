"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getUserHexColor } from "@/lib/colors";
import { HouseholdUser, TimelinePoint, TimelineScheduledPoint } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChartMode = "compound" | "person" | "grouped";

interface Props {
  data: TimelinePoint[];
  scheduledData: TimelineScheduledPoint[];
  householdUsers: HouseholdUser[];
}

// Raw per-day, per-user, per-compound data used by the tooltip.
interface DayEntry {
  userName: string;
  userId: number;
  compounds: { name: string; mcg: number; count: number }[];
  userTotal: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Build a lookup of date → per-user-per-compound breakdown for tooltip use. */
function buildDateMap(data: TimelinePoint[]): Record<string, DayEntry[]> {
  const map: Record<string, Record<number, DayEntry>> = {};
  for (const pt of data) {
    if (!map[pt.date]) map[pt.date] = {};
    if (!map[pt.date][pt.user_id]) {
      map[pt.date][pt.user_id] = {
        userName: pt.user_name,
        userId: pt.user_id,
        compounds: [],
        userTotal: 0,
      };
    }
    map[pt.date][pt.user_id].compounds.push({ name: pt.compound_name, mcg: pt.total_mcg, count: pt.count });
    map[pt.date][pt.user_id].userTotal += pt.total_mcg;
  }
  return Object.fromEntries(
    Object.entries(map).map(([date, users]) => [date, Object.values(users)])
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({
  active,
  label,
  dateMap,
}: {
  active?: boolean;
  label?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  dateMap: Record<string, DayEntry[]>;
}) {
  if (!active || !label) return null;
  const entries = dateMap[label];
  if (!entries || entries.length === 0) return null;

  const dayTotal = entries.reduce((s, e) => s + e.userTotal, 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <p className="mb-1.5 font-semibold text-gray-900 dark:text-white">{formatDate(label)}</p>
      {entries.map((entry) => (
        <div key={entry.userId} className="mb-1.5">
          <p className="font-medium text-gray-700 dark:text-gray-300">{entry.userName}</p>
          {entry.compounds.map((c) => (
            <p key={c.name} className="ml-2 text-gray-500 dark:text-gray-400">
              · {c.name}: {c.mcg > 0 ? `${c.mcg.toLocaleString()} mcg` : `${c.count} dose${c.count !== 1 ? "s" : ""}`}
            </p>
          ))}
          {entry.compounds.length > 1 && entry.userTotal > 0 && (
            <p className="ml-2 font-medium text-gray-600 dark:text-gray-400">
              Total: {entry.userTotal.toLocaleString()} mcg
            </p>
          )}
        </div>
      ))}
      {entries.length > 1 && dayTotal > 0 && (
        <p className="mt-1 border-t border-gray-100 pt-1 font-semibold text-gray-900 dark:border-gray-700 dark:text-white">
          Day total: {dayTotal.toLocaleString()} mcg
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart pivot helpers
// ---------------------------------------------------------------------------

const SCHED_SUFFIX = "__sched";
// Minimum bar height for scheduled compounds with no dose_mcg (keeps bars visible).
const SCHED_FALLBACK_MCG = 150;

/** "By compound" — one stacked segment per compound, summed across users.
 *  Also merges scheduled (unlogged) doses as faint projected bars. */
function buildCompoundData(data: TimelinePoint[], scheduled: TimelineScheduledPoint[]) {
  // Build compound_id lookup from both actual and scheduled data.
  const compoundIdByName: Record<string, number> = {};
  for (const pt of data) compoundIdByName[pt.compound_name] = pt.compound_id;
  for (const pt of scheduled) compoundIdByName[pt.compound_name] = pt.compound_id;

  const actualCompounds = Array.from(new Set(data.map((d) => d.compound_name)));
  const scheduledCompounds = Array.from(
    new Set(scheduled.map((s) => s.compound_name))
  ).filter((name) => !actualCompounds.includes(name));
  // Compounds that appear in both actual and scheduled (logged some days, not others)
  const mixedScheduled = Array.from(
    new Set(scheduled.map((s) => s.compound_name))
  ).filter((name) => actualCompounds.includes(name));
  const allScheduledNames = [...scheduledCompounds, ...mixedScheduled];

  const byDate: Record<string, Record<string, number>> = {};
  const countByDateCompound: Record<string, Record<string, number>> = {};

  for (const pt of data) {
    if (!byDate[pt.date]) byDate[pt.date] = { date: pt.date };
    byDate[pt.date][pt.compound_name] = (byDate[pt.date][pt.compound_name] ?? 0) + pt.total_mcg;
    if (!countByDateCompound[pt.date]) countByDateCompound[pt.date] = {};
    countByDateCompound[pt.date][pt.compound_name] = (countByDateCompound[pt.date][pt.compound_name] ?? 0) + pt.count;
  }
  for (const date of Object.keys(countByDateCompound)) {
    for (const cpd of Object.keys(countByDateCompound[date])) {
      if ((countByDateCompound[date][cpd] ?? 0) > 0 && (byDate[date]?.[cpd] ?? 0) === 0) {
        byDate[date][cpd] = SCHED_FALLBACK_MCG;
      }
    }
  }
  for (const pt of scheduled) {
    if (!byDate[pt.date]) byDate[pt.date] = { date: pt.date };
    const key = pt.compound_name + SCHED_SUFFIX;
    const value = pt.dose_mcg ?? SCHED_FALLBACK_MCG;
    byDate[pt.date][key] = (byDate[pt.date][key] ?? 0) + value;
  }

  return {
    chartData: Object.values(byDate).sort((a, b) => (a.date as string).localeCompare(b.date as string)),
    actualCompounds,
    allScheduledNames,
    compoundIdByName,
  };
}

/** "By person" — one stacked segment per user, summed across compounds. */
function buildPersonData(data: TimelinePoint[], householdUsers: HouseholdUser[]) {
  // Maintain order from householdUsers so colors are stable.
  const userOrder = householdUsers.map((u) => ({ id: u.id, name: u.name }));
  const byDate: Record<string, Record<string, number>> = {};
  const countByDateUser: Record<string, Record<string, number>> = {};
  for (const pt of data) {
    if (!byDate[pt.date]) byDate[pt.date] = { date: pt.date };
    byDate[pt.date][String(pt.user_id)] = (byDate[pt.date][String(pt.user_id)] ?? 0) + pt.total_mcg;
    if (!countByDateUser[pt.date]) countByDateUser[pt.date] = {};
    countByDateUser[pt.date][String(pt.user_id)] = (countByDateUser[pt.date][String(pt.user_id)] ?? 0) + pt.count;
  }
  for (const date of Object.keys(countByDateUser)) {
    for (const uid of Object.keys(countByDateUser[date])) {
      if ((countByDateUser[date][uid] ?? 0) > 0 && (byDate[date]?.[uid] ?? 0) === 0) {
        byDate[date][uid] = SCHED_FALLBACK_MCG;
      }
    }
  }
  return {
    chartData: Object.values(byDate).sort((a, b) => (a.date as string).localeCompare(b.date as string)),
    userOrder,
  };
}

/**
 * "Grouped" — side-by-side stacked columns per user per day.
 * Each column is a user; within each column, segments are compounds.
 * Key format: "${userId}__${compoundName}"
 */
function buildGroupedData(data: TimelinePoint[], householdUsers: HouseholdUser[]) {
  const compounds = Array.from(new Set(data.map((d) => d.compound_name)));
  const compoundIdByName: Record<string, number> = {};
  for (const pt of data) compoundIdByName[pt.compound_name] = pt.compound_id;
  const userOrder = householdUsers.map((u) => ({ id: u.id, name: u.name }));
  const byDate: Record<string, Record<string, number>> = {};
  const countByDateKey: Record<string, Record<string, number>> = {};
  for (const pt of data) {
    if (!byDate[pt.date]) byDate[pt.date] = { date: pt.date };
    const key = `${pt.user_id}__${pt.compound_name}`;
    byDate[pt.date][key] = (byDate[pt.date][key] ?? 0) + pt.total_mcg;
    if (!countByDateKey[pt.date]) countByDateKey[pt.date] = {};
    countByDateKey[pt.date][key] = (countByDateKey[pt.date][key] ?? 0) + pt.count;
  }
  for (const date of Object.keys(countByDateKey)) {
    for (const key of Object.keys(countByDateKey[date])) {
      if ((countByDateKey[date][key] ?? 0) > 0 && (byDate[date]?.[key] ?? 0) === 0) {
        byDate[date][key] = SCHED_FALLBACK_MCG;
      }
    }
  }
  return {
    chartData: Object.values(byDate).sort((a, b) => (a.date as string).localeCompare(b.date as string)),
    userOrder,
    compounds,
    compoundIdByName,
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const STORAGE_KEY = "dashboard_chart_mode";
const GROUPED_USER_LIMIT = 3; // disable Grouped button above this threshold on mobile

export default function DashboardChart({ data, scheduledData, householdUsers }: Props) {
  const [mode, setMode] = useState<ChartMode>("compound");
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const groupedDisabled = isMobile && householdUsers.length > GROUPED_USER_LIMIT;

  // Hydrate from localStorage after mount to avoid SSR mismatch.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ChartMode | null;
    if (saved && ["compound", "person", "grouped"].includes(saved)) {
      if (saved === "grouped" && groupedDisabled) return;
      setMode(saved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changeMode = (m: ChartMode) => {
    setMode(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  if (data.length === 0 && scheduledData.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
        No doses in the last 30 days
      </div>
    );
  }

  const dateMap = buildDateMap(data);
  // For person/grouped modes, ensure scheduled dates appear by injecting synthetic
  // zero-total points so those days show on the X axis.
  const dataWithScheduledDates: TimelinePoint[] = [
    ...data,
    ...scheduledData
      .filter((s) => !data.some((d) => d.date === s.date))
      .map((s) => ({
        date: s.date,
        compound_id: s.compound_id,
        compound_name: s.compound_name,
        user_id: s.user_id,
        user_name: s.user_name,
        total_mcg: 0,
        count: 0,
      })),
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipRenderer = (props: any) => (
    <ChartTooltip {...props} dateMap={dateMap} />
  );

  const xAxisProps = {
    dataKey: "date",
    tickFormatter: formatDate,
    tick: { fontSize: 11, fill: "#9ca3af" },
    interval: 6 as const,
    tickLine: false as const,
    axisLine: false as const,
  };
  const yAxisProps = {
    tick: { fontSize: 11, fill: "#9ca3af" },
    tickLine: false as const,
    axisLine: false as const,
    width: 40,
  };

  // ── Mode: By compound ──────────────────────────────────────────────────────
  let chart: React.ReactNode;

  if (mode === "compound") {
    const { chartData, actualCompounds, allScheduledNames, compoundIdByName } = buildCompoundData(data, scheduledData);
    const allActualKeys = actualCompounds.length + allScheduledNames.length;
    chart = (
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis {...xAxisProps} />
        <YAxis {...yAxisProps} />
        <Tooltip content={tooltipRenderer} />
        {allActualKeys > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            payload={[
              ...actualCompounds.map((name) => ({
                value: name,
                type: "square" as const,
                color: getUserHexColor(compoundIdByName[name] ?? 0),
              })),
              ...allScheduledNames.map((name) => ({
                value: `${name} (scheduled)`,
                type: "square" as const,
                color: getUserHexColor(compoundIdByName[name] ?? 0),
              })),
            ]}
          />
        )}
        {/* Actual logged doses */}
        {actualCompounds.map((name, i) => (
          <Bar
            key={name}
            dataKey={name}
            stackId="a"
            fill={getUserHexColor(compoundIdByName[name] ?? 0)}
            radius={i === actualCompounds.length - 1 && allScheduledNames.length === 0 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
        {/* Projected scheduled doses — faint outlined bars */}
        {allScheduledNames.map((name, i) => {
          const color = getUserHexColor(compoundIdByName[name] ?? 0);
          const isLast = i === allScheduledNames.length - 1;
          return (
            <Bar
              key={name + SCHED_SUFFIX}
              dataKey={name + SCHED_SUFFIX}
              name={`${name} (scheduled)`}
              stackId="a"
              fill={color}
              fillOpacity={0.18}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="3 2"
              radius={isLast ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              legendType="none"
            />
          );
        })}
      </BarChart>
    );

  // ── Mode: By person ────────────────────────────────────────────────────────
  } else if (mode === "person") {
    const { chartData, userOrder } = buildPersonData(dataWithScheduledDates, householdUsers);
    chart = (
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis {...xAxisProps} />
        <YAxis {...yAxisProps} />
        <Tooltip content={tooltipRenderer} />
        {userOrder.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => {
              const u = userOrder.find((u) => String(u.id) === value);
              return u?.name ?? value;
            }}
          />
        )}
        {userOrder.map((u, i) => (
          <Bar
            key={u.id}
            dataKey={String(u.id)}
            name={u.name}
            stackId="a"
            fill={getUserHexColor(u.id)}
            radius={i === userOrder.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    );

  // ── Mode: Grouped ──────────────────────────────────────────────────────────
  } else {
    const { chartData, userOrder, compounds, compoundIdByName } = buildGroupedData(dataWithScheduledDates, householdUsers);
    // Each user gets their own stackId; compounds within a user are stacked.
    // Bars across users are side-by-side.
    const bars: React.ReactNode[] = [];
    userOrder.forEach((u) => {
      compounds.forEach((cpd, ci) => {
        const dataKey = `${u.id}__${cpd}`;
        const isTop = ci === compounds.length - 1;
        bars.push(
          <Bar
            key={dataKey}
            dataKey={dataKey}
            name={cpd}
            stackId={String(u.id)}
            fill={getUserHexColor(compoundIdByName[cpd] ?? ci)}
            radius={isTop ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        );
      });
    });

    chart = (
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis {...xAxisProps} />
        <YAxis {...yAxisProps} />
        <Tooltip content={tooltipRenderer} />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          payload={compounds.map((name) => ({
            value: name,
            type: "square" as const,
            color: getUserHexColor(compoundIdByName[name] ?? 0),
          }))}
        />
        {bars}
      </BarChart>
    );
  }

  return (
    <div>
      {/* Mode toggle */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          30-day timeline
        </p>
        <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
          {(
            [
              { key: "compound", label: "By compound" },
              { key: "person", label: "By person" },
              { key: "grouped", label: "Grouped", disabled: groupedDisabled, title: groupedDisabled ? "Too many users for grouped view on mobile" : undefined },
            ] as { key: ChartMode; label: string; disabled?: boolean; title?: string }[]
          ).map(({ key, label, disabled, title }) => (
            <button
              key={key}
              onClick={() => !disabled && changeMode(key)}
              disabled={disabled}
              title={title}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === key
                  ? "bg-blue-600 text-white"
                  : disabled
                  ? "cursor-not-allowed bg-white text-gray-300 dark:bg-gray-900 dark:text-gray-600"
                  : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        {chart as React.ReactElement}
      </ResponsiveContainer>

      {/* Grouped mode caption */}
      {mode === "grouped" && householdUsers.length > 1 && (
        <p className="mt-1.5 text-center text-xs text-gray-400 dark:text-gray-500">
          Each day shows one bar per active user · colored by compound
        </p>
      )}
    </div>
  );
}
