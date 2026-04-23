"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { CompoundRead, INJECTION_SITES } from "@/lib/types";

function localDatetimeNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

interface Props {
  compounds: CompoundRead[];
  onSuccess?: () => void;
}

export default function LogInjectionForm({ compounds, onSuccess }: Props) {
  const [compoundId, setCompoundId] = useState("");
  const [doseMcg, setDoseMcg] = useState("");
  const [doseMode, setDoseMode] = useState<"total" | "anchor">("total");
  const [site, setSite] = useState("");
  const [injectedAt, setInjectedAt] = useState(localDatetimeNow());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bypassWarning, setBypassWarning] = useState(false);

  const selectedCompound = compounds.find((c) => String(c.id) === compoundId) ?? null;
  const isBlend = selectedCompound?.is_blend ?? false;
  const anchorComponent = selectedCompound?.blend_components.find((bc) => bc.is_anchor)
    ?? selectedCompound?.blend_components[0]
    ?? null;

  const doseNum = parseInt(doseMcg) || 0;
  const minDose = selectedCompound?.typical_dose_mcg_min ?? null;
  const maxDose = selectedCompound?.typical_dose_mcg_max ?? null;
  const showDoseWarning =
    !bypassWarning &&
    doseNum > 0 &&
    (minDose != null || maxDose != null) &&
    (doseNum < (minDose ?? -Infinity) || doseNum > (maxDose ?? Infinity));

  const handleCompoundChange = (id: string) => {
    setCompoundId(id);
    setDoseMode("total");
    setDoseMcg("");
    setBypassWarning(false);
  };

  const reset = () => {
    setDoseMcg("");
    setNotes("");
    setInjectedAt(localDatetimeNow());
    setError(null);
    setBypassWarning(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showDoseWarning) return;
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
          dose_mode: isBlend ? doseMode : "total",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.detail ?? "Failed to log injection");
        return;
      }
      setSuccess(true);
      reset();
      setTimeout(() => {
        setSuccess(false);
        onSuccess?.();
      }, 1200);
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500";
  const labelCls = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {success && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Logged!
        </div>
      )}

      <div>
        <label className={labelCls}>Compound</label>
        <select
          value={compoundId}
          onChange={(e) => handleCompoundChange(e.target.value)}
          required
          className={inputCls}
        >
          <option value="">Select compound…</option>
          {compounds.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.is_blend ? " (blend)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Blend dose mode toggle */}
      {isBlend && (
        <div>
          <label className={labelCls}>Dose mode</label>
          <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
            {(["total", "anchor"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => { setDoseMode(mode); setDoseMcg(""); }}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  doseMode === mode
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }`}
              >
                {mode === "total" ? "Total blend" : `By ${anchorComponent?.name ?? "anchor"}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>
          {isBlend && doseMode === "anchor" && anchorComponent
            ? `${anchorComponent.name} dose (mcg)`
            : isBlend
            ? "Total dose (mcg)"
            : "Dose (mcg)"}
        </label>
        <input
          type="number"
          min="1"
          value={doseMcg}
          onChange={(e) => { setDoseMcg(e.target.value); setBypassWarning(false); }}
          required
          className={inputCls}
          placeholder="e.g. 500"
        />

        {/* Dose range warning */}
        {showDoseWarning && (
          <div className="mt-2 rounded-lg border border-amber-600 bg-amber-900/30 px-3 py-2.5">
            <p className="text-sm text-amber-300">
              {doseNum < (minDose ?? Infinity)
                ? `This dose (${doseNum} mcg) is below your typical minimum of ${minDose} mcg.`
                : `This dose (${doseNum} mcg) exceeds your typical maximum of ${maxDose} mcg.`}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setBypassWarning(true)}
                className="text-xs text-amber-200 underline"
              >
                Log anyway
              </button>
              <button
                type="button"
                onClick={() => setDoseMcg("")}
                className="text-xs text-gray-400 underline"
              >
                Change dose
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Injection site</label>
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
                  : "border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Date & time</label>
        <input
          type="datetime-local"
          value={injectedAt}
          onChange={(e) => setInjectedAt(e.target.value)}
          required
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>
          Notes <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={inputCls}
          placeholder="How did it go?"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting || showDoseWarning}
        className="w-full rounded-lg bg-blue-600 py-4 text-base font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Logging…" : "Log injection"}
      </button>
    </form>
  );
}
