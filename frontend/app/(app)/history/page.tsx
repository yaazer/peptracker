"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "@/components/icons";
import { apiFetch } from "@/lib/api";
import { CompoundRead, InjectionRead, formatDatetime, siteLabel } from "@/lib/types";

export default function HistoryPage() {
  const [injections, setInjections] = useState<InjectionRead[]>([]);
  const [compounds, setCompounds] = useState<CompoundRead[]>([]);
  const [filterCompound, setFilterCompound] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const compoundMap = Object.fromEntries(compounds.map((c) => [c.id, c]));

  const loadInjections = async () => {
    const params = new URLSearchParams();
    if (filterCompound) params.set("compound_id", filterCompound);
    if (filterFrom) params.set("from", new Date(filterFrom).toISOString());
    if (filterTo) {
      const to = new Date(filterTo);
      to.setHours(23, 59, 59, 999);
      params.set("to", to.toISOString());
    }
    const res = await apiFetch(`/api/injections?${params}`);
    if (res.ok) setInjections(await res.json());
  };

  useEffect(() => {
    Promise.all([
      apiFetch("/api/compounds?include_archived=true").then((r) => r.json()),
    ]).then(([cs]) => {
      setCompounds(cs);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading) loadInjections();
  }, [loading, filterCompound, filterFrom, filterTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this injection record?")) return;
    await apiFetch(`/api/injections/${id}`, { method: "DELETE" });
    setInjections((prev) => prev.filter((i) => i.id !== id));
  };

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white";

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">History</h1>

      {/* Filters */}
      <div className="mb-4 space-y-2">
        <select
          value={filterCompound}
          onChange={(e) => setFilterCompound(e.target.value)}
          className={inputCls}
        >
          <option value="">All compounds</option>
          {compounds.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        {(filterCompound || filterFrom || filterTo) && (
          <button
            onClick={() => {
              setFilterCompound("");
              setFilterFrom("");
              setFilterTo("");
            }}
            className="text-sm text-blue-600"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      {injections.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-gray-400 dark:text-gray-500">No injections found.</p>
          <Link href="/log" className="mt-2 block text-sm text-blue-600">
            Log your first injection →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {injections.map((inj) => {
            const compound = compoundMap[inj.compound_id];
            const hasSnapshot = inj.component_snapshot && inj.component_snapshot.length > 0;
            const isOpen = expanded.has(inj.id);

            return (
              <div
                key={inj.id}
                className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex items-start justify-between gap-2 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {compound?.name ?? `Compound #${inj.compound_id}`}
                      </span>
                      {compound?.is_blend && (
                        <span className="rounded px-1 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                          blend
                        </span>
                      )}
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        {formatDatetime(inj.injected_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                      {inj.dose_mcg} mcg
                      {inj.dose_mode === "anchor" && " (anchor)"}
                      {" · "}
                      {siteLabel(inj.injection_site)}
                      {inj.draw_volume_ml != null && (
                        <span className="ml-1 text-blue-600">
                          · {(inj.draw_volume_ml * 100).toFixed(1)} units
                        </span>
                      )}
                    </p>
                    {inj.notes && (
                      <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">{inj.notes}</p>
                    )}
                    {hasSnapshot && (
                      <button
                        onClick={() => toggleExpanded(inj.id)}
                        className="mt-1.5 text-xs text-blue-600 hover:underline"
                      >
                        {isOpen ? "Hide breakdown ▲" : "Show breakdown ▼"}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(inj.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 dark:text-gray-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Blend component breakdown */}
                {hasSnapshot && isOpen && (
                  <div className="border-t border-gray-100 px-4 pb-3 pt-2 dark:border-gray-800">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Per component
                    </p>
                    <div className="space-y-1">
                      {inj.component_snapshot!.map((comp) => (
                        <div key={comp.name} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">{comp.name}</span>
                          <span className="tabular-nums font-medium text-gray-900 dark:text-white">
                            {comp.dose_mcg.toLocaleString()} mcg
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
