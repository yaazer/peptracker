"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Pencil, Plus, Trash2 } from "@/components/icons";
import { apiFetch } from "@/lib/api";
import { CompoundRead, HouseholdUser, ProtocolRead, timeUntil } from "@/lib/types";
import { calculateBlend, type BlendComponentInput } from "@/lib/reconstitution";
import BlendResultCard from "@/components/BlendResultCard";
import UserAttributionChip from "@/components/UserAttributionChip";
import { useAuth } from "@/context/AuthContext";

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i).padStart(2, "0"),
  label: `${i % 12 || 12}:00 ${i < 12 ? "AM" : "PM"}`,
}));

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function humanSchedule(p: ProtocolRead): string {
  const times = p.schedule_times ?? [];
  const timeStr = times.map(formatTime).join(", ") || "?";

  if (p.schedule_type === "daily") {
    const days = p.schedule_days ?? ALL_DAYS;
    if (days.length === 7) return `Daily at ${timeStr}`;
    return `${days.map((d) => DAY_LABELS[d]).join("/")} at ${timeStr}`;
  }
  if (p.schedule_type === "interval" || p.schedule_type === "weekly") {
    const n = p.schedule_interval_value ?? 1;
    const unit = p.schedule_interval_unit ?? "days";
    if (unit === "hours") return `Every ${n}h`;
    return `Every ${n} ${unit === "weeks" ? (n === 1 ? "week" : "weeks") : (n === 1 ? "day" : "days")} at ${timeStr}`;
  }
  return p.schedule_cron || "—";
}

// ---------------------------------------------------------------------------
// Schedule form state
// ---------------------------------------------------------------------------

interface ScheduleState {
  mode: "daily" | "interval";
  hour: string;        // "08"
  minute: string;      // "00"
  days: number[];      // Mon=0..Sun=6; empty = all 7 days
  intervalValue: string;
  intervalUnit: "days" | "hours" | "weeks";
}

const defaultSchedule: ScheduleState = {
  mode: "daily",
  hour: "08",
  minute: "00",
  days: [],
  intervalValue: "3",
  intervalUnit: "days",
};

function scheduleToApiFields(s: ScheduleState) {
  const timeStr = `${s.hour}:${s.minute}`;
  if (s.mode === "daily") {
    return {
      schedule_type: "daily",
      schedule_times: [timeStr],
      schedule_days: s.days.length > 0 ? s.days : null,
      schedule_interval_value: null,
      schedule_interval_unit: null,
    };
  }
  // interval
  return {
    schedule_type: "interval",
    schedule_times: s.intervalUnit === "hours" ? [timeStr] : [timeStr],
    schedule_days: null,
    schedule_interval_value: parseInt(s.intervalValue) || 1,
    schedule_interval_unit: s.intervalUnit,
  };
}

function scheduleFromProtocol(p: ProtocolRead): ScheduleState {
  const times = p.schedule_times ?? ["08:00"];
  const [h, m] = (times[0] ?? "08:00").split(":");
  const base = { hour: h ?? "08", minute: m ?? "00" };

  if (p.schedule_type === "interval" || p.schedule_type === "weekly") {
    return {
      ...base,
      mode: "interval",
      days: [],
      intervalValue: String(p.schedule_interval_value ?? 3),
      intervalUnit: (p.schedule_interval_unit as ScheduleState["intervalUnit"]) ?? "days",
    };
  }
  // daily (default)
  return {
    ...base,
    mode: "daily",
    days: p.schedule_days ?? [],
    intervalValue: "3",
    intervalUnit: "days",
  };
}

// ---------------------------------------------------------------------------
// ScheduleHelper component
// ---------------------------------------------------------------------------

function ScheduleHelper({
  value,
  onChange,
}: {
  value: ScheduleState;
  onChange: (v: ScheduleState) => void;
}) {
  const inputCls =
    "rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white";

  const toggleDay = (d: number) => {
    const next = value.days.includes(d)
      ? value.days.filter((x) => x !== d)
      : [...value.days, d].sort((a, b) => a - b);
    onChange({ ...value, days: next });
  };

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
        {(["daily", "interval"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ ...value, mode: m })}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              value.mode === m
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {m === "daily" ? "Daily / weekly" : "Every N days"}
          </button>
        ))}
      </div>

      {/* Time picker */}
      {value.intervalUnit !== "hours" && (
        <div className="flex items-center gap-2">
          <label className="shrink-0 text-sm text-gray-600 dark:text-gray-400">At</label>
          <select
            value={value.hour}
            onChange={(e) => onChange({ ...value, hour: e.target.value })}
            className={inputCls}
          >
            {HOURS.map(({ value: v, label }) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <select
            value={value.minute}
            onChange={(e) => onChange({ ...value, minute: e.target.value })}
            className={inputCls}
          >
            {["00", "15", "30", "45"].map((m) => (
              <option key={m} value={m}>:{m}</option>
            ))}
          </select>
        </div>
      )}

      {/* Daily: day-of-week selector */}
      {value.mode === "daily" && (
        <div>
          <p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
            Days (leave all unchecked for every day)
          </p>
          <div className="flex gap-1">
            {DAY_LABELS.map((label, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => toggleDay(idx)}
                className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                  value.days.length === 0 || value.days.includes(idx)
                    ? value.days.includes(idx)
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    : "bg-gray-50 text-gray-300 dark:bg-gray-900 dark:text-gray-600"
                }`}
              >
                {label[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Interval: every N unit */}
      {value.mode === "interval" && (
        <div className="flex items-center gap-2">
          <label className="shrink-0 text-sm text-gray-600 dark:text-gray-400">Every</label>
          <input
            type="number"
            min="1"
            value={value.intervalValue}
            onChange={(e) => onChange({ ...value, intervalValue: e.target.value })}
            className={`w-16 ${inputCls}`}
          />
          <select
            value={value.intervalUnit}
            onChange={(e) => onChange({ ...value, intervalUnit: e.target.value as ScheduleState["intervalUnit"] })}
            className={inputCls}
          >
            <option value="hours">hours</option>
            <option value="days">days</option>
            <option value="weeks">weeks</option>
          </select>
        </div>
      )}

      {/* Preview */}
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        {value.mode === "daily"
          ? `${value.days.length === 0 ? "Every day" : value.days.map((d) => DAY_LABELS[d]).join("/")} at ${value.hour}:${value.minute}`
          : value.intervalUnit === "hours"
          ? `Every ${value.intervalValue || "?"} hours`
          : `Every ${value.intervalValue || "?"} ${value.intervalUnit} at ${value.hour}:${value.minute}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type FilterMode = "all" | "mine" | "person";

interface FormState {
  compound_id: string;
  dose_mcg: string;
  dose_mode: "total" | "anchor";
  anchor_component_id: string;
  assignee_user_id: string;
  schedule: ScheduleState;
  active: boolean;
  notes: string;
}

const emptyForm = (selfId?: number): FormState => ({
  compound_id: "",
  dose_mcg: "",
  dose_mode: "total",
  anchor_component_id: "",
  assignee_user_id: selfId ? String(selfId) : "",
  schedule: { ...defaultSchedule },
  active: true,
  notes: "",
});

function compoundById(compounds: CompoundRead[], id: string) {
  return compounds.find((c) => String(c.id) === id) ?? null;
}

export default function ProtocolsPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const [protocols, setProtocols] = useState<ProtocolRead[]>([]);
  const [compounds, setCompounds] = useState<CompoundRead[]>([]);
  const [householdUsers, setHouseholdUsers] = useState<HouseholdUser[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [filterPersonId, setFilterPersonId] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProtocolRead | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(currentUser?.id));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (inactive = includeInactive) => {
    const [ps, cs, us] = await Promise.all([
      apiFetch(`/api/protocols?include_inactive=${inactive}`).then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/compounds").then((r) => (r.ok ? r.json() : [])),
      apiFetch("/api/users/household").then((r) => (r.ok ? r.json() : [])),
    ]);
    setProtocols(ps);
    setCompounds(cs);
    setHouseholdUsers(us);
  };

  useEffect(() => { load(); }, [includeInactive]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleProtocols = protocols.filter((p) => {
    if (filterMode === "mine") return p.assignee_user_id === currentUser?.id;
    if (filterMode === "person" && filterPersonId) return String(p.assignee_user_id) === filterPersonId;
    return true;
  });

  const canEditProtocol = (p: ProtocolRead) =>
    isAdmin || p.assignee_user_id === currentUser?.id;

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm(currentUser?.id));
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (p: ProtocolRead) => {
    setEditing(p);
    setForm({
      compound_id: String(p.compound_id),
      dose_mcg: p.dose_mcg != null ? String(p.dose_mcg) : "",
      dose_mode: (p.dose_mode as "total" | "anchor") ?? "total",
      anchor_component_id: String(p.anchor_component_id ?? ""),
      assignee_user_id: String(p.assignee_user_id),
      schedule: scheduleFromProtocol(p),
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

    const scheduleFields = scheduleToApiFields(form.schedule);
    const body: Record<string, unknown> = {
      compound_id: parseInt(form.compound_id),
      dose_mcg: form.dose_mcg ? parseInt(form.dose_mcg) : null,
      ...scheduleFields,
      active: form.active,
      notes: form.notes || null,
      dose_mode: form.dose_mode,
      anchor_component_id: parseInt(form.anchor_component_id) || null,
    };
    if (isAdmin) {
      body.assignee_user_id = parseInt(form.assignee_user_id) || currentUser?.id;
    }
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
    if (!canEditProtocol(p)) return;
    await apiFetch(`/api/protocols/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !p.active }),
    });
    load();
  };

  const handleDelete = async (p: ProtocolRead) => {
    if (!canEditProtocol(p)) return;
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

      {/* Filters row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
          {(["all", "mine", "person"] as FilterMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setFilterMode(m)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filterMode === m
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-400"
              }`}
            >
              {m === "all" ? "All" : m === "mine" ? "Mine" : "By person"}
            </button>
          ))}
        </div>
        {filterMode === "person" && (
          <select
            value={filterPersonId}
            onChange={(e) => setFilterPersonId(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            <option value="">Select person…</option>
            {householdUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          Show inactive
        </label>
      </div>

      {visibleProtocols.length === 0 && (
        <p className="mt-12 text-center text-gray-400 dark:text-gray-500">
          No protocols yet. Tap Add to create one.
        </p>
      )}

      <div className="space-y-3">
        {visibleProtocols.map((p) => (
          <div
            key={p.id}
            className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${!p.active ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 dark:text-white">{p.compound_name}</p>
                  {p.dose_mcg != null && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">{p.dose_mcg} mcg</span>
                  )}
                </div>
                <div className="mt-1">
                  <UserAttributionChip
                    userId={p.assignee_user_id}
                    userName={p.assignee_name}
                    size="sm"
                  />
                </div>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {humanSchedule(p)}
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
                {canEditProtocol(p) && (
                  <>
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
                  </>
                )}
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
              <button onClick={closeModal} className="text-2xl leading-none text-gray-400 dark:text-gray-500">×</button>
            </div>

            {(() => {
              const selectedCompound = compoundById(compounds, form.compound_id);
              const isBlend = selectedCompound?.is_blend ?? false;
              const blendComponents = selectedCompound?.blend_components ?? [];

              const selectedAnchorBc =
                blendComponents.find((bc) => String(bc.id) === form.anchor_component_id) ??
                blendComponents.find((bc) => bc.is_anchor) ??
                blendComponents[0] ??
                null;

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
                  {/* Assignee */}
                  {isAdmin ? (
                    <div>
                      <label className={labelCls}>Assigned to</label>
                      <select
                        value={form.assignee_user_id}
                        onChange={(e) => setForm({ ...form, assignee_user_id: e.target.value })}
                        required
                        className={inputCls}
                      >
                        <option value="">Select person…</option>
                        {householdUsers.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className={labelCls}>Assigned to</label>
                      <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {currentUser?.name}
                      </p>
                    </div>
                  )}

                  {/* Medication */}
                  <div>
                    <label className={labelCls}>Medication</label>
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
                      <option value="">Select medication…</option>
                      {compounds.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.is_blend ? " (blend)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Blend mode */}
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

                  {/* Dose */}
                  <div>
                    <label className={labelCls}>
                      {isBlend && form.dose_mode === "anchor" && selectedAnchorBc
                        ? `${selectedAnchorBc.name} dose (mcg)`
                        : isBlend
                        ? "Total blend dose (mcg)"
                        : "Dose (mcg)"}
                      {" "}
                      <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={form.dose_mcg}
                      onChange={(e) => setForm({ ...form, dose_mcg: e.target.value })}
                      className={inputCls}
                      placeholder="e.g. 500"
                    />
                  </div>

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

                  {/* Schedule */}
                  <div>
                    <label className={labelCls}>Schedule</label>
                    <ScheduleHelper
                      value={form.schedule}
                      onChange={(schedule) => setForm({ ...form, schedule })}
                    />
                  </div>

                  {/* Notes */}
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
