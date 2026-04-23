"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Pencil, Plus, Trash2 } from "@/components/icons";
import { apiFetch } from "@/lib/api";
import { CompoundRead, ProtocolRead, timeUntil } from "@/lib/types";
import { calculateBlend, type BlendComponentInput } from "@/lib/reconstitution";
import BlendResultCard from "@/components/BlendResultCard";

// ---------------------------------------------------------------------------
// Cron helper
// ---------------------------------------------------------------------------

type ScheduleType = "daily" | "every_other" | "mwf" | "weekdays" | "weekly" | "custom";

interface CronState {
  type: ScheduleType;
  hour: string;
  minute: string;
  weekday: string; // 0=Sun…6=Sat for weekly
  customCron: string;
}

const defaultCron: CronState = {
  type: "daily",
  hour: "8",
  minute: "0",
  weekday: "1",
  customCron: "",
};

function buildCron(s: CronState): string {
  const h = s.hour.padStart(1, "0");
  const m = s.minute.padStart(2, "0");
  switch (s.type) {
    case "daily":       return `${m} ${h} * * *`;
    case "every_other": return `${m} ${h} */2 * *`;
    case "mwf":         return `${m} ${h} * * 1,3,5`;
    case "weekdays":    return `${m} ${h} * * 1-5`;
    case "weekly":      return `${m} ${h} * * ${s.weekday}`;
    case "custom":      return s.customCron;
  }
}

function cronLabel(s: CronState): string {
  if (s.type === "custom") return s.customCron || "—";
  const h = parseInt(s.hour);
  const m = parseInt(s.minute);
  const timeStr = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (s.type) {
    case "daily":       return `Daily at ${timeStr}`;
    case "every_other": return `Every other day at ${timeStr}`;
    case "mwf":         return `Mon/Wed/Fri at ${timeStr}`;
    case "weekdays":    return `Mon–Fri at ${timeStr}`;
    case "weekly":      return `Every ${days[parseInt(s.weekday)]} at ${timeStr}`;
  }
}

function humanCron(cron: string): string {
  // Try to recognise common patterns produced by buildCron
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return cron;
  const [m, h, dom, , dow] = p;
  const pad = (n: string) => n.padStart(2, "0");
  const hNum = parseInt(h);
  const mNum = parseInt(m);
  const timeStr = isNaN(hNum) ? `${h}:${pad(m)}` : `${hNum % 12 || 12}:${pad(m)} ${hNum < 12 ? "AM" : "PM"}`;
  if (dom === "*/2" && dow === "*") return `Every other day at ${timeStr}`;
  if (dow === "1,3,5" && dom === "*") return `Mon/Wed/Fri at ${timeStr}`;
  if (dow === "1-5" && dom === "*") return `Mon–Fri at ${timeStr}`;
  if (dom === "*" && dow === "*") return `Daily at ${timeStr}`;
  if (dom === "*" && !isNaN(parseInt(dow))) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `Every ${days[parseInt(dow)]} at ${timeStr}`;
  }
  return cron;
}

const SCHEDULE_TYPES: { value: ScheduleType; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "every_other", label: "Every other day" },
  { value: "mwf", label: "Mon / Wed / Fri" },
  { value: "weekdays", label: "Mon – Fri" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom (raw cron)" },
];

const WEEKDAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${i % 12 || 12}:00 ${i < 12 ? "AM" : "PM"}`,
}));

function CronHelper({
  value,
  onChange,
}: {
  value: CronState;
  onChange: (v: CronState) => void;
}) {
  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {SCHEDULE_TYPES.map(({ value: v, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange({ ...value, type: v })}
            className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
              value.type === v
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {value.type !== "custom" && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Time</label>
            <select
              value={value.hour}
              onChange={(e) => onChange({ ...value, hour: e.target.value })}
              className={inputCls}
            >
              {HOURS.map(({ value: v, label }) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
          {value.type === "weekly" && (
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Day</label>
              <select
                value={value.weekday}
                onChange={(e) => onChange({ ...value, weekday: e.target.value })}
                className={inputCls}
              >
                {WEEKDAYS.map(({ value: v, label }) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {value.type === "custom" && (
        <div>
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
            Cron expression{" "}
            <span className="font-mono text-gray-400">minute hour dom month dow</span>
          </label>
          <input
            type="text"
            value={value.customCron}
            onChange={(e) => onChange({ ...value, customCron: e.target.value })}
            className={inputCls}
            placeholder="0 8 * * *"
            spellCheck={false}
          />
        </div>
      )}

      <p className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        {buildCron(value) || "—"}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface FormState {
  compound_id: string;
  dose_mcg: string;
  dose_mode: "total" | "anchor";
  anchor_component_id: string;
  cron: CronState;
  active: boolean;
  notes: string;
}

const emptyForm = (): FormState => ({
  compound_id: "",
  dose_mcg: "",
  dose_mode: "total",
  anchor_component_id: "",
  cron: { ...defaultCron },
  active: true,
  notes: "",
});

function cronStateFromString(cron: string): CronState {
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return { ...defaultCron, type: "custom", customCron: cron };
  const [m, h, dom, , dow] = p;
  const base = { hour: String(parseInt(h) || 8), minute: m, weekday: "1", customCron: cron };
  if (dom === "*/2" && dow === "*") return { ...base, type: "every_other" };
  if (dow === "1,3,5" && dom === "*") return { ...base, type: "mwf" };
  if (dow === "1-5" && dom === "*") return { ...base, type: "weekdays" };
  if (dom === "*" && dow === "*") return { ...base, type: "daily" };
  if (dom === "*" && !isNaN(parseInt(dow))) return { ...base, type: "weekly", weekday: dow };
  return { ...base, type: "custom" };
}

function compoundById(compounds: CompoundRead[], id: string) {
  return compounds.find((c) => String(c.id) === id) ?? null;
}

export default function ProtocolsPage() {
  const [protocols, setProtocols] = useState<ProtocolRead[]>([]);
  const [compounds, setCompounds] = useState<CompoundRead[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProtocolRead | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (inactive = includeInactive) => {
    const [ps, cs] = await Promise.all([
      apiFetch(`/api/protocols?include_inactive=${inactive}`).then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/compounds").then((r) => (r.ok ? r.json() : [])),
    ]);
    setProtocols(ps);
    setCompounds(cs);
  };

  useEffect(() => { load(); }, [includeInactive]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (p: ProtocolRead) => {
    setEditing(p);
    setForm({
      compound_id: String(p.compound_id),
      dose_mcg: String(p.dose_mcg),
      dose_mode: (p.dose_mode as "total" | "anchor") ?? "total",
      anchor_component_id: String(p.anchor_component_id ?? ""),
      cron: cronStateFromString(p.schedule_cron),
      active: p.active,
      notes: p.notes ?? "",
    });
    setError(null);
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const schedule_cron = buildCron(form.cron);
    if (!schedule_cron.trim()) { setError("Invalid schedule"); setSubmitting(false); return; }
    const body = {
      compound_id: parseInt(form.compound_id),
      dose_mcg: parseInt(form.dose_mcg),
      schedule_cron,
      active: form.active,
      notes: form.notes || null,
      dose_mode: form.dose_mode,
      anchor_component_id: parseInt(form.anchor_component_id) || null,
    };
    try {
      const res = editing
        ? await apiFetch(`/api/protocols/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiFetch("/api/protocols", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json();
        setError(err.detail ?? "Something went wrong");
        return;
      }
      closeModal();
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (p: ProtocolRead) => {
    await apiFetch(`/api/protocols/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !p.active }),
    });
    load();
  };

  const handleDelete = async (p: ProtocolRead) => {
    if (!confirm(`Delete protocol for ${p.compound_name}?`)) return;
    await apiFetch(`/api/protocols/${p.id}`, { method: "DELETE" });
    load();
  };

  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white";
  const labelCls = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <div className="px-4 pt-6 pb-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Protocols</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/reminders"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Reminder log"
          >
            <Bell size={18} />
          </Link>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
          className="h-4 w-4 rounded"
        />
        Show inactive
      </label>

      {protocols.length === 0 && (
        <p className="mt-12 text-center text-gray-400 dark:text-gray-500">
          No protocols yet. Tap Add to create one.
        </p>
      )}

      <div className="space-y-3">
        {protocols.map((p) => (
          <div
            key={p.id}
            className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${!p.active ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white">{p.compound_name}</p>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{p.dose_mcg} mcg</span>
                </div>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {humanCron(p.schedule_cron)}
                </p>
                {p.active && p.next_fire_at && (
                  <p className={`mt-1 text-sm font-medium tabular-nums ${
                    new Date(p.next_fire_at) <= new Date() ? "text-red-500" : "text-blue-600"
                  }`}>
                    {timeUntil(p.next_fire_at)}
                  </p>
                )}
                {p.notes && (
                  <p className="mt-1 truncate text-xs text-gray-400 dark:text-gray-500">{p.notes}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {/* Active toggle */}
                <button
                  onClick={() => toggleActive(p)}
                  className={`relative h-6 w-10 rounded-full transition-colors ${p.active ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
                  title={p.active ? "Deactivate" : "Activate"}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${p.active ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <button
                  onClick={() => openEdit(p)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="w-full max-w-md overflow-y-auto rounded-t-2xl bg-white px-5 pt-5 pb-8 sm:max-h-[90vh] sm:rounded-2xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editing ? "Edit protocol" : "Add protocol"}
              </h2>
              <button
                onClick={closeModal}
                className="text-2xl leading-none text-gray-400 dark:text-gray-500"
              >
                ×
              </button>
            </div>

            {/* Derived values used throughout the form */}
            {(() => {
              const selectedCompound = compoundById(compounds, form.compound_id);
              const isBlend = selectedCompound?.is_blend ?? false;
              const blendComponents = selectedCompound?.blend_components ?? [];

              // The anchor component the user has selected (falls back to compound default or first)
              const selectedAnchorBc =
                blendComponents.find((bc) => String(bc.id) === form.anchor_component_id) ??
                blendComponents.find((bc) => bc.is_anchor) ??
                blendComponents[0] ??
                null;

              // Build component inputs with is_anchor overridden by user's choice
              const previewComponents: BlendComponentInput[] = blendComponents.map((bc) => ({
                name: bc.name,
                amount_mg: bc.amount_mg,
                is_anchor: bc.id === selectedAnchorBc?.id,
              }));

              const bacMl = parseFloat(String(selectedCompound?.bac_water_ml ?? "")) || 0;
              const doseMcgNum = parseInt(form.dose_mcg) || 0;
              const previewResult =
                isBlend && bacMl && doseMcgNum
                  ? calculateBlend(previewComponents, bacMl, doseMcgNum, form.dose_mode)
                  : null;

              return (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelCls}>Compound</label>
                <select
                  data-testid="compound-select"
                  value={form.compound_id}
                  onChange={(e) => {
                    const newId = e.target.value;
                    const newCompound = compoundById(compounds, newId);
                    const defaultAnchor =
                      newCompound?.blend_components.find((bc) => bc.is_anchor) ??
                      newCompound?.blend_components[0];
                    setForm({
                      ...form,
                      compound_id: newId,
                      dose_mode: "total",
                      anchor_component_id: String(defaultAnchor?.id ?? ""),
                      dose_mcg: "",
                    });
                  }}
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

              {/* Dose mode — only for blend compounds */}
              {isBlend && (
                <div>
                  <label className={labelCls}>Dose mode</label>
                  <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
                    {(["total", "anchor"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setForm({ ...form, dose_mode: mode, dose_mcg: "" })}
                        className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                          form.dose_mode === mode
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {mode === "total" ? "Total blend" : "By anchor component"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Anchor component selector — only in anchor mode */}
              {isBlend && form.dose_mode === "anchor" && (
                <div>
                  <label className={labelCls}>Anchor component</label>
                  <select
                    data-testid="anchor-component-select"
                    value={form.anchor_component_id}
                    onChange={(e) =>
                      setForm({ ...form, anchor_component_id: e.target.value, dose_mcg: "" })
                    }
                    className={inputCls}
                  >
                    {blendComponents.map((bc) => (
                      <option key={bc.id} value={bc.id}>
                        {bc.name} ({bc.amount_mg} mg)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className={labelCls}>
                  {isBlend && form.dose_mode === "anchor" && selectedAnchorBc
                    ? `${selectedAnchorBc.name} dose (mcg)`
                    : isBlend
                    ? "Total blend dose (mcg)"
                    : "Dose (mcg)"}
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.dose_mcg}
                  onChange={(e) => setForm({ ...form, dose_mcg: e.target.value })}
                  required
                  className={inputCls}
                  placeholder="e.g. 500"
                />
              </div>

              {/* Blend preview */}
              {isBlend && (
                <div>
                  {bacMl > 0 ? (
                    <BlendResultCard
                      result={previewResult}
                      doseMcg={doseMcgNum}
                      doseMode={form.dose_mode}
                      anchorName={selectedAnchorBc?.name}
                    />
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Set BAC water on this compound to see a dose preview.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className={labelCls}>Schedule</label>
                <CronHelper
                  value={form.cron}
                  onChange={(cron) => setForm({ ...form, cron })}
                />
              </div>

              <div>
                <label className={labelCls}>Notes <span className="font-normal text-gray-400">(optional)</span></label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className={inputCls}
                  placeholder="Optional"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 rounded"
                />
                Active
              </label>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
