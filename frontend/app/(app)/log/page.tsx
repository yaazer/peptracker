"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CompoundRead, INJECTION_SITES } from "@/lib/types";

function localDatetimeNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export default function LogPage() {
  const [compounds, setCompounds] = useState<CompoundRead[]>([]);
  const [compoundId, setCompoundId] = useState("");
  const [doseMcg, setDoseMcg] = useState("");
  const [site, setSite] = useState("");
  const [injectedAt, setInjectedAt] = useState(localDatetimeNow());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/compounds")
      .then((r) => r.json())
      .then(setCompounds);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!site) { setError("Pick an injection site"); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/injections", {
        method: "POST",
        body: JSON.stringify({
          compound_id: parseInt(compoundId),
          dose_mcg: parseInt(doseMcg),
          injection_site: site,
          injected_at: new Date(injectedAt).toISOString(),
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.detail ?? "Failed to log injection");
        return;
      }
      setSuccess(true);
      setDoseMcg("");
      setNotes("");
      setInjectedAt(localDatetimeNow());
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-6 text-xl font-bold text-gray-900">Log Injection</h1>

      {success && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          Logged!
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Compound */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Compound</label>
          <select
            value={compoundId}
            onChange={(e) => setCompoundId(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select compound…</option>
            {compounds.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Dose */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Dose (mcg)</label>
          <input
            type="number"
            min="1"
            value={doseMcg}
            onChange={(e) => setDoseMcg(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-blue-500 focus:outline-none"
            placeholder="e.g. 500"
          />
        </div>

        {/* Injection site */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Injection site</label>
          <div className="grid grid-cols-2 gap-2">
            {INJECTION_SITES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setSite(value)}
                className={`rounded-lg border py-3.5 text-sm font-medium transition-colors ${
                  value === "other" ? "col-span-2" : ""
                } ${
                  site === value
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Date & time */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Date & time</label>
          <input
            type="datetime-local"
            value={injectedAt}
            onChange={(e) => setInjectedAt(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Notes <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-blue-500 focus:outline-none"
            placeholder="How did it go?"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-blue-600 py-4 text-base font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Logging…" : "Log injection"}
        </button>
      </form>
    </div>
  );
}
