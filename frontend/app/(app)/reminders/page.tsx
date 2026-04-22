"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ReminderLogRead, formatDatetime } from "@/lib/types";

export default function RemindersPage() {
  const [logs, setLogs] = useState<ReminderLogRead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/reminders")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { setLogs(data); setLoading(false); });
  }, []);

  return (
    <div className="px-4 pt-6 pb-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reminder log</h1>
        <Link href="/protocols" className="text-sm text-blue-600">
          ← Protocols
        </Link>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {!loading && logs.length === 0 && (
        <div className="mt-16 text-center">
          <p className="text-gray-400 dark:text-gray-500">No reminders fired yet.</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Reminders appear here once a protocol fires.
          </p>
        </div>
      )}

      {!loading && logs.length > 0 && (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              {/* Status dot */}
              <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${log.delivered ? "bg-green-500" : "bg-red-400"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {log.compound_name}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                    {formatDatetime(log.fired_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {log.protocol_dose_mcg} mcg ·{" "}
                  {log.delivered ? (
                    <span className="text-green-600 dark:text-green-400">delivered</span>
                  ) : (
                    <span className="text-red-500 dark:text-red-400">failed</span>
                  )}
                </p>
                {log.error && (
                  <p className="mt-0.5 truncate text-xs text-red-400 dark:text-red-500">
                    {log.error}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
