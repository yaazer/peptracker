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
import { getCompoundHexColor, getUserHexColor } from "@/lib/colors";
import { HouseholdUser, TimelinePoint } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChartMode = "compound" | "person" | "grouped";

interface Props {
  data: TimelinePoint[];
  householdUsers: HouseholdUser[];
}

// Raw per-day, per-user, per-compound data used by the tooltip.
interface DayEntry {
  userName: string;
  userId: number;
  compounds: { name: string; mcg: number }[];
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
    map[pt.date][pt.user_id].compounds.push({ name: pt.compound_name, mcg: pt.total_mcg });
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
              · {c.name}: {c.mcg.toLocaleString()} mcg
            </p>
          ))}
          {entry.compounds.length > 1 && (
            <p className="ml-2 font-medium text-gray-600 dark:text-gray-400">
              Total: {entry.userTotal.toLocaleString()} mcg
            </p>
          )}
        </div>
      ))}
      {entries.length > 1 && (
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

/** "By compound" — one stacked segment per compound, summed across users. */
function buildCompoundData(data: TimelinePoint[]) {
  const compounds = Array.from(new Set(data.map((d) => d.compound_name)));
  const byDate: Record<string, Record<string, number>> = {};
  for (const pt of data) {
    if (!byDate[pt.date]) byDate[pt.date] = { date: pt.date };
    byDate[pt.date][pt.compound_name] = (byDate[pt.date][pt.compound_name] ?? 0) + pt.total_mcg;
  }
  return {
    chartData: Object.values(byDate).sort((a, b) => (a.date as string).localeCompare(b.date as string)),
    keys: compounds,
  };
}

/** "By person" — one stacked segment per user, summed across compounds. */
function buildPersonData(data: TimelinePoint[], householdUsers: HouseholdUser[]) {
  // Maintain order from householdUsers so colors are stable.
  const userOrder = householdUsers.map((u) => ({ id: u.id, name: u.name }));
  const byDate: Record<string, Record<string, number>> = {};
  for (const pt of data) {
    if (!byDate[pt.date]) byDate[pt.date] = { date: pt.date };
    byDate[pt.date][String(pt.user_id)] = (byDate[pt.date][String(pt.user_id)] ?? 0) + pt.total_mcg;
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
  const userOrder = householdUsers.map((u) => ({ id: u.id, name: u.name }));
  const byDate: Record<string, Record<string, number>> = {};
  for (const pt of data) {
    if (!byDate[pt.date]) byDate[pt.date] = { date: pt.date };
    const key = `${pt.user_id}__${pt.compound_name}`;
    byDate[pt.date][key] = (byDate[pt.date][key] ?? 0) + pt.total_mcg;
  }
  return {
    chartData: Object.values(byDate).sort((a, b) => (a.date as string).localeCompare(b.date as string)),
    userOrder,
    compounds,
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const STORAGE_KEY = "dashboard_chart_mode";
const GROUPED_USER_LIMIT = 3; // disable Grouped button above this threshold on mobile

export default function DashboardChart({ data, householdUsers }: Props) {
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

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
        No injections in the last 30 days
      </div>
    );
  }

  const dateMap = buildDateMap(data);

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
    const { chartData, keys } = buildCompoundData(data);
    chart = (
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis {...xAxisProps} />
        <YAxis {...yAxisProps} />
        <Tooltip content={tooltipRenderer} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {keys.map((name, i) => (
          <Bar
            key={name}
            dataKey={name}
            stackId="a"
            fill={getCompoundHexColor(i)}
            radius={i === keys.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    );

  // ── Mode: By person ────────────────────────────────────────────────────────
  } else if (mode === "person") {
    const { chartData, userOrder } = buildPersonData(data, householdUsers);
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
    const { chartData, userOrder, compounds } = buildGroupedData(data, householdUsers);
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
            fill={getCompoundHexColor(ci)}
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
          payload={compounds.map((name, i) => ({
            value: name,
            type: "square" as const,
            color: getCompoundHexColor(i),
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
