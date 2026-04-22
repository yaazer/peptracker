"use client";

import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TimelinePoint } from "@/lib/types";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
];

interface Props {
  data: TimelinePoint[];
}

export default function DashboardChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
        No injections in the last 30 days
      </div>
    );
  }

  // Collect unique compounds and assign colors
  const compounds = Array.from(new Set(data.map((d) => d.compound_name)));

  // Pivot: [{ date, "BPC-157": 500, "TB-500": 250 }, ...]
  const byDate: Record<string, Record<string, number>> = {};
  for (const point of data) {
    if (!byDate[point.date]) byDate[point.date] = { date: point.date };
    byDate[point.date][point.compound_name] =
      (byDate[point.date][point.compound_name] ?? 0) + point.total_mcg;
  }
  const chartData = Object.values(byDate).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string)
  );

  // Only label every 7th bar to keep X-axis readable
  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          interval={6}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}`}
        />
        <Tooltip
          formatter={(value: number, name: string) => [`${value} mcg`, name]}
          labelFormatter={(label) => formatDate(label as string)}
          contentStyle={{ fontSize: 13, borderRadius: 8 }}
        />
        {compounds.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {compounds.map((name, i) => (
          <Bar
            key={name}
            dataKey={name}
            stackId="a"
            fill={COLORS[i % COLORS.length]}
            radius={i === compounds.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
