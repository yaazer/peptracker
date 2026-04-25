"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { CompoundRead, HouseholdUser, INJECTION_SITES } from "@/lib/types";
import { quantityFieldLabel, quantityHint } from "@/lib/formatDose";
import { useAuth } from "@/context/AuthContext";

function localDatetimeNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

interface Props {
  compounds: CompoundRead[];
  householdUsers: HouseholdUser[];
  onSuccess?: () => void;
}

const MEDICATION_TYPE_LABELS: Record<string, string> = {
  injection: "Injection",
  tablet: "Tablet",
  capsule: "Capsule",
  liquid: "Liquid",
  topical: "Topical",
  sublingual: "Sublingual",
  inhaled: "Inhaled",
  other: "Other",
};

export default function LogInjectionForm({ compounds, householdUsers, onSuccess }: Props) {
  const { user: currentUser } = useAuth();

  const [compoundId, setCompoundId] = useState("");
  const [doseMcg, setDoseMcg] = useState("");
  const [quantity, setQuantity] = useState("");
  const [doseMode, setDoseMode] = useState<"total" | "anchor">("total");
  const [site, setSite] = useState("");
  const [injectedAt, setInjectedAt] = useState(localDatetimeNow());
  const [notes, setNotes] = useState("");
  const [injectedById, setInjectedById] = useState<string>(
    currentUser ? String(currentUser.id) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bypassWarning, setBypassWarning] = useState(false);

  const selectedCompound = compounds.find((c) => String(c.id) === compoundId) ?? null;
  const isInjection = (selectedCompound?.medication_type ?? "injection") === "injection";
  const isBlend = selectedCompound?.is_blend ?? false;
  const anchorComponent =
    selectedCompound?.blend_components.find((bc) => bc.is_anchor) ??
    selectedCompound?.blend_components[0] ??
    null;

  const doseNum = parseInt(doseMcg) || 0;
  const minDose = selectedCompound?.typical_dose_mcg_min ?? null;
  const maxDose = selectedCompound?.typical_dose_mcg_max ?? null;
  const showDoseWarning =
    !bypassWarning &&
    isInjection &&
    doseNum > 0 &&
    (minDose != null || maxDose != null) &&
    (doseNum < (minDose ?? -Infinity) || doseNum > (maxDose ?? Infinity));


  const isLoggingForOther =
    currentUser && injectedById && String(currentUser.id) !== injectedById;
  const injectedByUser = householdUsers.find((u) => String(u.id) === injectedById);

  const handleCompoundChange = (id: string) => {
    setCompoundId(id);
    setDoseMode("total");
    setDoseMcg("");
    setQuantity("");
    setSite("");
    setBypassWarning(false);
  };

  const reset = () => {
    setDoseMcg("");
    setQuantity("");
    setSite("");
    setNotes("");
    setInjectedAt(localDatetimeNow());
    setError(null);
    setBypassWarning(false);
    setInjectedById(currentUser ? String(currentUser.id) : "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showDoseWarning) return;

    if (isInjection && !site) {
      setError("Pick an injection site");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        compound_id: parseInt(compoundId),
        injected_at: new Date(injectedAt).toISOString(),
        notes: notes || null,
      };

      if (isInjection) {
        body.dose_mcg = parseInt(doseMcg);
        body.injection_site = site;
        body.dose_mode = isBlend ? doseMode : "total";
      } else {
        body.quantity = parseFloat(quantity);
      }

      if (injectedById && injectedById !== String(currentUser?.id)) {
        body.injected_by_user_id = parseInt(injectedById);
      }

      const res = await apiFetch("/api/injections", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.detail ?? "Failed to log dose");
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

  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500";
  const labelCls = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {success && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Logged!
        </div>
      )}

      {/* Who is taking this? */}
      {householdUsers.length > 1 && (
        <div>
          <label className={labelCls}>Who is taking this?</label>
          <select
            value={injectedById}
            onChange={(e) => setInjectedById(e.target.value)}
            className={inputCls}
          >
            {householdUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.id === currentUser?.id ? " (me)" : ""}
              </option>
            ))}
          </select>
          {isLoggingForOther && injectedByUser && (
            <p className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              Logging a dose for {injectedByUser.name} — they will see this in their history.
            </p>
          )}
        </div>
      )}

      {/* Medication selector */}
      <div>
        <label className={labelCls}>Medication</label>
        <select
          value={compoundId}
          onChange={(e) => handleCompoundChange(e.target.value)}
          required
          className={inputCls}
        >
          <option value="">Select medication…</option>
          {compounds.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_blend ? " (blend)" : ""}
              {c.medication_type !== "injection"
                ? ` · ${MEDICATION_TYPE_LABELS[c.medication_type] ?? c.medication_type}`
                : ""}
            </option>
          ))}
        </select>
      </div>

      {/* ---- Injection-specific fields ---- */}
      {isInjection && (
        <>
          {isBlend && (
            <div>
              <label className={labelCls}>Dose mode</label>
              <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
                {(["total", "anchor"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setDoseMode(mode);
                      setDoseMcg("");
                    }}
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
              onChange={(e) => {
                setDoseMcg(e.target.value);
                setBypassWarning(false);
              }}
              required
              className={inputCls}
              placeholder="e.g. 500"
            />

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
        </>
      )}

      {/* ---- Non-injection (pill / liquid / etc.) fields ---- */}
      {!isInjection && selectedCompound && (
        <div>
          <label className={labelCls}>{quantityFieldLabel(selectedCompound)}</label>
          <input
            type="number"
            min="0.1"
            step="0.5"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            className={inputCls}
            placeholder="e.g. 1"
          />
          {quantityHint(selectedCompound, quantity) !== null && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {quantityHint(selectedCompound, quantity)}
            </p>
          )}
        </div>
      )}

      <div>
        <label className={labelCls}>Date &amp; time</label>
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
          Notes{" "}
          <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
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
        {submitting ? "Logging…" : isInjection ? "Log injection" : "Log dose"}
      </button>
    </form>
  );
}
