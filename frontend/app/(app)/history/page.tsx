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

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-xl font-bold text-gray-900">History</h1>

      {/* Filters */}
      <div className="mb-4 space-y-2">
        <select
          value={filterCompound}
          onChange={(e) => setFilterCompound(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base focus:border-blue-500 focus:outline-none"
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
            <label className="mb-1 block text-xs text-gray-500">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        {(filterCompound || filterFrom || filterTo) && (
          <button
            onClick={() => { setFilterCompound(""); setFilterFrom(""); setFilterTo(""); }}
            className="text-sm text-blue-600"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      {injections.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-gray-400">No injections found.</p>
          <Link href="/log" className="mt-2 block text-sm text-blue-600">
            Log your first injection →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {injections.map((inj) => {
            const compound = compoundMap[inj.compound_id];
            return (
              <div
                key={inj.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-gray-900">
                        {compound?.name ?? `Compound #${inj.compound_id}`}
                      </span>
                      <span className="text-sm text-gray-400">
                        {formatDatetime(inj.injected_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">
                      {inj.dose_mcg} mcg · {siteLabel(inj.injection_site)}
                    </p>
                    {inj.notes && (
                      <p className="mt-1 text-sm text-gray-400">{inj.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(inj.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
