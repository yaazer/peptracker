"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, Calculator, ExternalLink, Pencil, Plus, Trash2 } from "@/components/icons";
import { apiFetch } from "@/lib/api";
import { BlendComponent, CompoundRead, MEDICATION_TYPES, MedicationType, PrescriptionRead, ReferenceResult } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import MedicationSearchInput from "@/components/MedicationSearchInput";

const MEDICATION_TYPE_LABELS: Record<MedicationType, string> = {
  injection: "Injection",
  tablet: "Tablet",
  capsule: "Capsule",
  liquid: "Liquid",
  topical: "Topical",
  sublingual: "Sublingual",
  inhaled: "Inhaled",
  other: "Other",
};

const STRENGTH_UNITS: Record<string, string[]> = {
  tablet:    ["mcg", "mg"],
  capsule:   ["mcg", "mg"],
  liquid:    ["mg/ml", "mcg/ml"],
  topical:   ["mg/ml", "mg/g", "%"],
  sublingual: ["mcg", "mg"],
  inhaled:   ["mcg", "mg"],
  other:     ["mcg", "mg", "mg/ml"],
};

const RX_EXPIRY_WARNING_DAYS = 14;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormState {
  name: string;
  aliases: string;
  medication_type: MedicationType;
  strength_amount: string;
  strength_unit: string;
  dose_unit: string;
  concentration_mg_per_ml: string;
  vial_size_mg: string;
  bac_water_ml: string;
  is_blend: boolean;
  blend_components: BlendComponent[];
  reference_url: string;
  reference_notes: string;
  typical_dose_mcg_min: string;
  typical_dose_mcg_max: string;
  dose_range_unit: "mcg" | "mg";
  notes: string;
  // Inventory
  quantity_on_hand: string;
  quantity_unit: string;
  low_stock_mode: "threshold" | "days";
  low_stock_threshold: string;
  low_stock_days: string;
}

interface RxFormState {
  prescriber_name: string;
  pharmacy_name: string;
  rx_number: string;
  refills_remaining: string;
  expiry_date: string;
  notes: string;
  is_active: boolean;
}

const emptyRxForm: RxFormState = {
  prescriber_name: "",
  pharmacy_name: "",
  rx_number: "",
  refills_remaining: "",
  expiry_date: "",
  notes: "",
  is_active: true,
};

const emptyForm: FormState = {
  name: "",
  aliases: "",
  medication_type: "injection",
  strength_amount: "",
  strength_unit: "",
  dose_unit: "mcg",
  concentration_mg_per_ml: "",
  vial_size_mg: "",
  bac_water_ml: "",
  is_blend: false,
  blend_components: [],
  reference_url: "",
  reference_notes: "",
  typical_dose_mcg_min: "",
  typical_dose_mcg_max: "",
  dose_range_unit: "mcg",
  notes: "",
  quantity_on_hand: "",
  quantity_unit: "",
  low_stock_mode: "threshold",
  low_stock_threshold: "",
  low_stock_days: "",
};

const emptyComponent = (): BlendComponent => ({
  name: "",
  linked_compound_id: null,
  amount_mg: 0,
  is_anchor: false,
  position: 0,
});

function compoundToForm(c: CompoundRead): FormState {
  return {
    name: c.name,
    aliases: c.aliases ?? "",
    medication_type: (c.medication_type as MedicationType) ?? "injection",
    strength_amount: c.strength_amount?.toString() ?? "",
    strength_unit: c.strength_unit ?? "",
    dose_unit: c.dose_unit ?? "mcg",
    concentration_mg_per_ml: c.concentration_mg_per_ml?.toString() ?? "",
    vial_size_mg: c.vial_size_mg?.toString() ?? "",
    bac_water_ml: c.bac_water_ml?.toString() ?? "",
    is_blend: c.is_blend,
    blend_components: c.blend_components.map((bc) => ({ ...bc })),
    reference_url: c.reference_url ?? "",
    reference_notes: c.reference_notes ?? "",
    typical_dose_mcg_min: c.typical_dose_mcg_min?.toString() ?? "",
    typical_dose_mcg_max: c.typical_dose_mcg_max?.toString() ?? "",
    dose_range_unit: "mcg",
    notes: c.notes ?? "",
    quantity_on_hand: c.quantity_on_hand?.toString() ?? "",
    quantity_unit: c.quantity_unit ?? "",
    low_stock_mode: c.low_stock_days != null ? "days" : "threshold",
    low_stock_threshold: c.low_stock_threshold?.toString() ?? "",
    low_stock_days: c.low_stock_days?.toString() ?? "",
  };
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CompoundsPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const searchParams = useSearchParams();
  const [compounds, setCompounds] = useState<CompoundRead[]>([]);
  const [prescriptions, setPrescriptions] = useState<Record<number, PrescriptionRead>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompoundRead | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefillSource, setPrefillSource] = useState<"rxnorm" | "local" | null>(null);

  // Refill panel state
  const [refillOpen, setRefillOpen] = useState<number | null>(null);
  const [refillAmount, setRefillAmount] = useState("");
  const [refillNotes, setRefillNotes] = useState("");
  const [refillSubmitting, setRefillSubmitting] = useState(false);

  // Rx panel state
  const [rxOpen, setRxOpen] = useState<number | null>(null);
  const [rxForm, setRxForm] = useState<RxFormState>(emptyRxForm);
  const [rxEditId, setRxEditId] = useState<number | null>(null);
  const [rxSubmitting, setRxSubmitting] = useState(false);
  const [rxError, setRxError] = useState<string | null>(null);

  const load = async (archived = showArchived) => {
    const [compRes, rxRes] = await Promise.all([
      apiFetch(`/api/compounds?include_archived=${archived}`),
      apiFetch("/api/prescriptions?active_only=true"),
    ]);
    if (compRes.ok) setCompounds(await compRes.json());
    if (rxRes.ok) {
      const rxList: PrescriptionRead[] = await rxRes.json();
      const map: Record<number, PrescriptionRead> = {};
      for (const rx of rxList) map[rx.compound_id] = rx;
      setPrescriptions(map);
    }
  };

  useEffect(() => { load(); }, [showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle ?duplicate_from=ID query param
  useEffect(() => {
    const fromId = searchParams.get("duplicate_from");
    if (!fromId) return;
    apiFetch(`/api/compounds?include_archived=true`)
      .then((r) => (r.ok ? r.json() : []))
      .then((cs: CompoundRead[]) => {
        const source = cs.find((c) => String(c.id) === fromId);
        if (!source) return;
        const f = compoundToForm(source);
        f.name = `Copy of ${source.name}`;
        setEditing(null);
        setForm(f);
        setError(null);
        setModalOpen(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: CompoundRead) => {
    setEditing(c);
    setForm(compoundToForm(c));
    setError(null);
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditing(null); setPrefillSource(null); };

  // Blend component helpers
  const updateComponent = (idx: number, patch: Partial<BlendComponent>) => {
    setForm((f) => ({
      ...f,
      blend_components: f.blend_components.map((bc, i) =>
        i === idx ? { ...bc, ...patch } : bc
      ),
    }));
  };

  const setAnchor = (idx: number) => {
    setForm((f) => ({
      ...f,
      blend_components: f.blend_components.map((bc, i) => ({
        ...bc, is_anchor: i === idx,
      })),
    }));
  };

  const addComponent = () => {
    setForm((f) => ({
      ...f,
      blend_components: [
        ...f.blend_components,
        { ...emptyComponent(), position: f.blend_components.length },
      ],
    }));
  };

  const removeComponent = (idx: number) => {
    setForm((f) => ({
      ...f,
      blend_components: f.blend_components
        .filter((_, i) => i !== idx)
        .map((bc, i) => ({ ...bc, position: i })),
    }));
  };

  const handleReferenceSelect = (result: ReferenceResult) => {
    setForm((f) => ({
      ...f,
      name: result.name,
      strength_amount: result.strength_amount != null ? String(result.strength_amount) : f.strength_amount,
      strength_unit: result.strength_unit ?? f.strength_unit,
      route: result.route ?? f.route,
    }));
    setPrefillSource(result.source);
  };

  const toMcg = (val: string, unit: "mcg" | "mg") => {
    const n = parseFloat(val);
    if (isNaN(n)) return null;
    return unit === "mg" ? n * 1000 : n;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.is_blend && form.blend_components.length < 2) {
      setError("A blend needs at least 2 components");
      return;
    }
    setSubmitting(true);
    setError(null);

    const isInjection = form.medication_type === "injection";

    const body: Record<string, unknown> = {
      name: form.name,
      medication_type: form.medication_type,
      aliases: form.aliases || null,
      notes: form.notes || null,
      is_blend: form.is_blend,
      reference_url: form.reference_url || null,
      reference_notes: form.reference_notes || null,
      typical_dose_mcg_min: toMcg(form.typical_dose_mcg_min, form.dose_range_unit),
      typical_dose_mcg_max: toMcg(form.typical_dose_mcg_max, form.dose_range_unit),
      quantity_on_hand: form.quantity_on_hand ? parseFloat(form.quantity_on_hand) : null,
      quantity_unit: form.quantity_unit || null,
      low_stock_threshold: form.low_stock_mode === "threshold" && form.low_stock_threshold
        ? parseFloat(form.low_stock_threshold) : null,
      low_stock_days: form.low_stock_mode === "days" && form.low_stock_days
        ? parseFloat(form.low_stock_days) : null,
    };

    if (!isInjection) {
      body.dose_unit = form.dose_unit || "other";
      body.strength_amount = form.strength_amount ? parseFloat(form.strength_amount) : null;
      body.strength_unit = form.strength_unit || null;
    }

    if (isInjection && form.is_blend) {
      body.bac_water_ml = form.bac_water_ml ? parseFloat(form.bac_water_ml) : null;
      body.blend_components = form.blend_components.map((bc, i) => ({
        name: bc.name,
        amount_mg: bc.amount_mg,
        is_anchor: bc.is_anchor,
        position: i,
        linked_compound_id: bc.linked_compound_id,
      }));
    } else if (isInjection) {
      body.concentration_mg_per_ml = form.concentration_mg_per_ml
        ? parseFloat(form.concentration_mg_per_ml) : null;
      body.vial_size_mg = form.vial_size_mg ? parseFloat(form.vial_size_mg) : null;
      body.bac_water_ml = form.bac_water_ml ? parseFloat(form.bac_water_ml) : null;
    }

    try {
      const res = editing
        ? await apiFetch(`/api/compounds/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiFetch("/api/compounds", { method: "POST", body: JSON.stringify(body) });
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

  const toggleArchive = async (c: CompoundRead) => {
    await apiFetch(`/api/compounds/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: !c.archived }),
    });
    load();
  };

  const handleDelete = async (c: CompoundRead) => {
    if (!confirm(`Delete "${c.name}"? This will also delete all its injection records.`)) return;
    await apiFetch(`/api/compounds/${c.id}`, { method: "DELETE" });
    load();
  };

  const handleRefill = async (compoundId: number) => {
    if (!refillAmount || isNaN(parseFloat(refillAmount))) return;
    setRefillSubmitting(true);
    try {
      const res = await apiFetch(`/api/compounds/${compoundId}/refill`, {
        method: "POST",
        body: JSON.stringify({ amount: parseFloat(refillAmount), notes: refillNotes || null }),
      });
      if (res.ok) {
        setRefillOpen(null);
        setRefillAmount("");
        setRefillNotes("");
        load();
      }
    } finally {
      setRefillSubmitting(false);
    }
  };

  const openRxPanel = (compoundId: number) => {
    const existing = prescriptions[compoundId];
    if (existing) {
      setRxForm({
        prescriber_name: existing.prescriber_name ?? "",
        pharmacy_name: existing.pharmacy_name ?? "",
        rx_number: existing.rx_number ?? "",
        refills_remaining: existing.refills_remaining?.toString() ?? "",
        expiry_date: existing.expiry_date ?? "",
        notes: existing.notes ?? "",
        is_active: existing.is_active,
      });
      setRxEditId(existing.id);
    } else {
      setRxForm(emptyRxForm);
      setRxEditId(null);
    }
    setRxError(null);
    setRxOpen(compoundId);
  };

  const handleRxSubmit = async (compoundId: number) => {
    setRxSubmitting(true);
    setRxError(null);
    try {
      const body = {
        prescriber_name: rxForm.prescriber_name || null,
        pharmacy_name: rxForm.pharmacy_name || null,
        rx_number: rxForm.rx_number || null,
        refills_remaining: rxForm.refills_remaining ? parseInt(rxForm.refills_remaining) : null,
        expiry_date: rxForm.expiry_date || null,
        notes: rxForm.notes || null,
        is_active: rxForm.is_active,
      };
      const url = rxEditId
        ? `/api/compounds/${compoundId}/prescriptions/${rxEditId}`
        : `/api/compounds/${compoundId}/prescriptions`;
      const method = rxEditId ? "PATCH" : "POST";
      const res = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json();
        setRxError(err.detail ?? "Failed to save prescription");
        return;
      }
      setRxOpen(null);
      load();
    } finally {
      setRxSubmitting(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white";
  const smallInputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-white";
  const labelCls = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

  const totalBlendMg = form.blend_components.reduce((s, bc) => s + (bc.amount_mg || 0), 0);

  return (
    <div className="px-4 pt-6 pb-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Compounds</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/calculator"
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Calculator size={15} /> Calc
          </Link>
          {isAdmin && (
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white"
            >
              <Plus size={16} /> Add
            </button>
          )}
        </div>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          className="h-4 w-4 rounded"
        />
        Show archived
      </label>

      {compounds.length === 0 && (
        <p className="mt-12 text-center text-gray-400 dark:text-gray-500">
          No compounds yet. Tap Add to create one.
        </p>
      )}

      <div className="space-y-3">
        {compounds.map((c) => {
          const rx = prescriptions[c.id] ?? null;
          const rxDaysLeft = rx?.expiry_date ? daysUntil(rx.expiry_date) : null;
          const rxExpiringSoon = rxDaysLeft !== null && rxDaysLeft <= RX_EXPIRY_WARNING_DAYS;
          const hasInventory = c.quantity_on_hand != null;
          const isLowStock = hasInventory && c.low_stock_threshold != null
            ? c.quantity_on_hand! <= c.low_stock_threshold
            : false;

          return (
            <div
              key={c.id}
              className={`rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${c.archived ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      href={`/compounds/${c.id}`}
                      className="font-semibold text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                    >
                      {c.name}
                    </Link>
                    {c.is_blend && (
                      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        blend
                      </span>
                    )}
                    {c.medication_type && c.medication_type !== "injection" && (
                      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        {MEDICATION_TYPE_LABELS[c.medication_type as MedicationType] ?? c.medication_type}
                      </span>
                    )}
                    {rxExpiringSoon && (
                      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                        Rx exp {rxDaysLeft === 0 ? "today" : `in ${rxDaysLeft}d`}
                      </span>
                    )}
                    {c.aliases && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {c.aliases}
                      </span>
                    )}
                  </div>

                  {c.is_blend && c.blend_components.length > 0 ? (
                    <p className="mt-0.5 text-sm text-blue-600">
                      {c.blend_components.map((bc) => `${bc.name} ${bc.amount_mg}mg`).join(" · ")}
                      {c.bac_water_ml ? ` · ${c.bac_water_ml}mL BAC` : ""}
                    </p>
                  ) : c.medication_type !== "injection" && c.strength_amount ? (
                    <p className="mt-0.5 text-sm text-blue-600">
                      {c.strength_amount} {c.strength_unit}
                      {c.dose_unit && c.dose_unit !== c.strength_unit ? ` · per ${c.dose_unit}` : ""}
                    </p>
                  ) : (
                    c.concentration_mg_per_ml && (
                      <p className="mt-0.5 text-sm text-blue-600">
                        {c.concentration_mg_per_ml} mg/mL
                        {c.vial_size_mg ? ` · ${c.vial_size_mg} mg vial` : ""}
                        {c.bac_water_ml ? ` · ${c.bac_water_ml} mL BAC water` : ""}
                      </p>
                    )
                  )}

                  {c.typical_dose_mcg_min != null || c.typical_dose_mcg_max != null ? (
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      Typical: {c.typical_dose_mcg_min ?? "?"} – {c.typical_dose_mcg_max ?? "?"} mcg
                    </p>
                  ) : null}

                  {/* Stock chip */}
                  {hasInventory && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        isLowStock
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      }`}>
                        {isLowStock && "⚠ "}
                        {c.quantity_on_hand} {c.quantity_unit || "units"}
                        {isLowStock && " — low"}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setRefillOpen(refillOpen === c.id ? null : c.id);
                            setRefillAmount("");
                            setRefillNotes("");
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          + Refill
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {c.reference_url && (
                    <a
                      href={c.reference_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open reference"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                  <Link
                    href={`/calculator?compound_id=${c.id}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    title="Reconstitution calculator"
                  >
                    <Calculator size={16} />
                  </Link>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => openEdit(c)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => toggleArchive(c)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                        title={c.archived ? "Unarchive" : "Archive"}
                      >
                        {c.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Refill panel */}
              {refillOpen === c.id && isAdmin && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 dark:border-gray-800">
                  <p className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Log refill received</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      value={refillAmount}
                      onChange={(e) => setRefillAmount(e.target.value)}
                      placeholder={`Amount (${c.quantity_unit || "units"})`}
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                    <button
                      onClick={() => handleRefill(c.id)}
                      disabled={refillSubmitting || !refillAmount}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {refillSubmitting ? "…" : "Add"}
                    </button>
                    <button
                      onClick={() => setRefillOpen(null)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    type="text"
                    value={refillNotes}
                    onChange={(e) => setRefillNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              )}

              {/* Rx info strip */}
              {(rx || isAdmin) && (
                <div className="border-t border-gray-100 px-4 pb-3 pt-2.5 dark:border-gray-800">
                  {rx ? (
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                        <p className="font-medium text-gray-700 dark:text-gray-300">Prescription</p>
                        {rx.rx_number && <p>Rx #{rx.rx_number}</p>}
                        {rx.prescriber_name && <p>Dr. {rx.prescriber_name}</p>}
                        {rx.pharmacy_name && <p>{rx.pharmacy_name}</p>}
                        {rx.refills_remaining != null && <p>{rx.refills_remaining} refill{rx.refills_remaining !== 1 ? "s" : ""} remaining</p>}
                        {rx.expiry_date && (
                          <p className={rxExpiringSoon ? "font-semibold text-red-500 dark:text-red-400" : ""}>
                            Expires {rx.expiry_date}{rxExpiringSoon ? ` (${rxDaysLeft}d)` : ""}
                          </p>
                        )}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => openRxPanel(c.id)}
                          className="shrink-0 text-xs text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  ) : isAdmin ? (
                    <button
                      onClick={() => openRxPanel(c.id)}
                      className="text-xs text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400"
                    >
                      + Add prescription
                    </button>
                  ) : null}
                </div>
              )}

              {/* Rx edit panel */}
              {rxOpen === c.id && isAdmin && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 dark:border-gray-800 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {rxEditId ? "Edit Prescription" : "Add Prescription"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["Prescriber name", "prescriber_name"],
                      ["Pharmacy", "pharmacy_name"],
                      ["Rx number", "rx_number"],
                      ["Refills remaining", "refills_remaining"],
                    ] as [string, keyof RxFormState][]).map(([label, field]) => (
                      <div key={field}>
                        <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">{label}</label>
                        <input
                          type={field === "refills_remaining" ? "number" : "text"}
                          value={rxForm[field] as string}
                          onChange={(e) => setRxForm({ ...rxForm, [field]: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">Expiry date</label>
                    <input
                      type="date"
                      value={rxForm.expiry_date}
                      onChange={(e) => setRxForm({ ...rxForm, expiry_date: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">Notes</label>
                    <textarea
                      value={rxForm.notes}
                      onChange={(e) => setRxForm({ ...rxForm, notes: e.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  {rxError && <p className="text-xs text-red-500">{rxError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRxSubmit(c.id)}
                      disabled={rxSubmitting}
                      className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {rxSubmitting ? "Saving…" : "Save prescription"}
                    </button>
                    <button
                      onClick={() => setRxOpen(null)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add / Edit modal — admin only */}
      {modalOpen && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="w-full max-w-md overflow-y-auto rounded-t-2xl bg-white px-6 pt-6 pb-10 sm:max-h-[90vh] sm:rounded-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editing ? "Edit compound" : "Add compound"}
              </h2>
              <button onClick={closeModal} className="text-2xl leading-none text-gray-400">×</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* ── Medication Type ── */}
              <section className="space-y-3">
                <SectionHeading>Medication Type</SectionHeading>
                <select
                  value={form.medication_type}
                  onChange={(e) => {
                    const newType = e.target.value as MedicationType;
                    const defaultDoseUnit: Partial<Record<MedicationType, string>> = {
                      tablet: "tablet", capsule: "capsule", liquid: "ml",
                    };
                    setForm({
                      ...form,
                      medication_type: newType,
                      name: prefillSource ? "" : form.name,
                      dose_unit: defaultDoseUnit[newType] ?? "mcg",
                      strength_amount: "",
                      strength_unit: "",
                      concentration_mg_per_ml: "",
                      vial_size_mg: "",
                      bac_water_ml: "",
                    });
                    setPrefillSource(null);
                  }}
                  className={inputCls}
                >
                  {MEDICATION_TYPES.map((t) => (
                    <option key={t} value={t}>{MEDICATION_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </section>

              {/* ── Basic Info ── */}
              <section className="space-y-3">
                <SectionHeading>Basic Info</SectionHeading>

                {prefillSource && !editing && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                    <span>
                      Pre-filled from{" "}
                      <strong>{prefillSource === "rxnorm" ? "RxNorm" : "local"} reference</strong>.
                      All fields are editable.
                    </span>
                    <button
                      type="button"
                      onClick={() => setPrefillSource(null)}
                      className="shrink-0 text-lg leading-none text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300"
                      aria-label="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                )}

                <div>
                  <label className={labelCls}>Name <span className="text-red-500">*</span></label>
                  {editing ? (
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                      className={inputCls}
                      placeholder="e.g. BPC-157"
                    />
                  ) : (
                    <MedicationSearchInput
                      value={form.name}
                      onChange={(v) => {
                        setForm((f) => ({ ...f, name: v }));
                        if (prefillSource) setPrefillSource(null);
                      }}
                      onSelect={handleReferenceSelect}
                      medicationType={form.medication_type}
                      placeholder="Search or enter a medication name…"
                      inputClassName={inputCls}
                    />
                  )}
                </div>
                <div>
                  <label className={labelCls}>
                    Aliases <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.aliases}
                    onChange={(e) => { setForm({ ...form, aliases: e.target.value }); setPrefillSource(null); }}
                    className={inputCls}
                    placeholder="e.g. BPC157, Body Protection Compound"
                  />
                </div>
              </section>

              {/* ── Strength (non-injection) ── */}
              {form.medication_type !== "injection" && (
                <section className="space-y-3">
                  <SectionHeading>Strength per unit</SectionHeading>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Amount</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={form.strength_amount}
                        onChange={(e) => setForm({ ...form, strength_amount: e.target.value })}
                        className={inputCls}
                        placeholder="e.g. 500"
                        required={["tablet","capsule","liquid"].includes(form.medication_type)}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Unit</label>
                      <select
                        value={form.strength_unit}
                        onChange={(e) => setForm({ ...form, strength_unit: e.target.value })}
                        className={inputCls}
                        required={["tablet","capsule","liquid"].includes(form.medication_type)}
                      >
                        <option value="">Select unit…</option>
                        {(STRENGTH_UNITS[form.medication_type] ?? ["mcg","mg"]).map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Dose unit (what you enter when logging)</label>
                    <select
                      value={form.dose_unit}
                      onChange={(e) => setForm({ ...form, dose_unit: e.target.value })}
                      className={inputCls}
                    >
                      {["tablet","capsule","ml","drop","puff","patch","mcg","mg","other"].map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </section>
              )}

              {/* ── Reconstitution (injection only) ── */}
              {form.medication_type === "injection" && (
              <section className="space-y-3">
                <SectionHeading>Reconstitution</SectionHeading>

                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.is_blend}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        is_blend: e.target.checked,
                        blend_components: e.target.checked ? [emptyComponent()] : [],
                      })
                    }
                    className="h-4 w-4 rounded"
                  />
                  Blend compound (multiple peptides per vial)
                </label>

                {form.is_blend ? (
                  <>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Components{totalBlendMg > 0 ? ` · ${totalBlendMg} mg total` : ""}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {form.blend_components.map((bc, idx) => (
                          <div
                            key={idx}
                            className={`rounded-lg border p-3 ${bc.is_anchor ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20" : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"}`}
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <input
                                type="text"
                                value={bc.name}
                                onChange={(e) => updateComponent(idx, { name: e.target.value })}
                                placeholder="Component name"
                                required
                                className={`flex-1 ${smallInputCls}`}
                              />
                              <button type="button" onClick={() => removeComponent(idx)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 hover:text-red-500">
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <input
                                  type="number" min="0" step="any"
                                  value={bc.amount_mg || ""}
                                  onChange={(e) => updateComponent(idx, { amount_mg: parseFloat(e.target.value) || 0 })}
                                  placeholder="0" required
                                  className={`w-full pr-8 ${smallInputCls}`}
                                />
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">mg</span>
                              </div>
                              <button type="button" onClick={() => setAnchor(idx)}
                                className={`shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${bc.is_anchor ? "bg-blue-600 text-white" : "border border-gray-300 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400"}`}>
                                Anchor
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={addComponent}
                        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 dark:border-gray-600">
                        <Plus size={14} /> Add component
                      </button>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">BAC water (mL)</label>
                      <input type="number" step="any" min="0" value={form.bac_water_ml}
                        onChange={(e) => setForm({ ...form, bac_water_ml: e.target.value })}
                        className={inputCls} placeholder="e.g. 2" />
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "mg/mL", field: "concentration_mg_per_ml" as const },
                      { label: "Vial mg", field: "vial_size_mg" as const },
                      { label: "BAC mL", field: "bac_water_ml" as const },
                    ].map(({ label, field }) => (
                      <div key={field}>
                        <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">{label}</label>
                        <input type="number" step="any" min="0" value={form[field]}
                          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                          className={inputCls} placeholder="0.00" />
                      </div>
                    ))}
                  </div>
                )}
              </section>
              )}

              {/* ── Inventory ── */}
              <section className="space-y-3">
                <SectionHeading>Inventory</SectionHeading>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Optional. When set, stock is auto-decremented on each logged dose.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Current stock</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.quantity_on_hand}
                      onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })}
                      className={inputCls}
                      placeholder="e.g. 2"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Unit</label>
                    <input
                      type="text"
                      value={form.quantity_unit}
                      onChange={(e) => setForm({ ...form, quantity_unit: e.target.value })}
                      className={inputCls}
                      placeholder="vials, tablets, mL…"
                      list="quantity-unit-suggestions"
                    />
                    <datalist id="quantity-unit-suggestions">
                      {["vials", "tablets", "capsules", "mL", "mg"].map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {form.quantity_on_hand !== "" && (
                  <div className="space-y-2">
                    <label className={labelCls}>Low-stock alert</label>
                    <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
                      {(["threshold", "days"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForm({ ...form, low_stock_mode: m })}
                          className={`flex-1 py-2 text-sm font-medium transition-colors ${
                            form.low_stock_mode === m
                              ? "bg-blue-600 text-white"
                              : "bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          {m === "threshold" ? "Direct threshold" : "Days of doses"}
                        </button>
                      ))}
                    </div>
                    {form.low_stock_mode === "threshold" ? (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={form.low_stock_threshold}
                        onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                        className={inputCls}
                        placeholder={`Alert when below X ${form.quantity_unit || "units"}`}
                      />
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={form.low_stock_days}
                        onChange={(e) => setForm({ ...form, low_stock_days: e.target.value })}
                        className={inputCls}
                        placeholder="Alert when < X days of doses remain"
                      />
                    )}
                  </div>
                )}
              </section>

              {/* ── Reference ── */}
              <section className="space-y-3">
                <SectionHeading>Reference</SectionHeading>
                <div>
                  <label className={labelCls}>Source URL <span className="font-normal text-gray-400">(optional)</span></label>
                  <input
                    type="url"
                    value={form.reference_url}
                    onChange={(e) => setForm({ ...form, reference_url: e.target.value })}
                    className={inputCls}
                    placeholder="https://examine.com/…"
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    Notes <span className="font-normal text-gray-400">(Markdown supported)</span>
                  </label>
                  <textarea
                    value={form.reference_notes}
                    onChange={(e) => setForm({ ...form, reference_notes: e.target.value })}
                    rows={4}
                    className={inputCls}
                    placeholder={"Typical dose: 250–500 mcg/day\n\n**Cautions:** ..."}
                  />
                </div>
              </section>

              {/* ── Personal Dosing Range ── */}
              <section className="space-y-3">
                <SectionHeading>Personal Dosing Range</SectionHeading>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  If set, a warning appears when logging a dose outside this range.
                </p>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className={labelCls}>Min</label>
                    <input
                      type="number" min="0" step="any"
                      value={form.typical_dose_mcg_min}
                      onChange={(e) => setForm({ ...form, typical_dose_mcg_min: e.target.value })}
                      className={inputCls} placeholder="e.g. 250"
                    />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Max</label>
                    <input
                      type="number" min="0" step="any"
                      value={form.typical_dose_mcg_max}
                      onChange={(e) => setForm({ ...form, typical_dose_mcg_max: e.target.value })}
                      className={inputCls} placeholder="e.g. 750"
                    />
                  </div>
                  <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
                    {(["mcg", "mg"] as const).map((u) => (
                      <button key={u} type="button"
                        onClick={() => setForm({ ...form, dose_range_unit: u })}
                        className={`px-3 py-3 text-sm font-medium transition-colors ${form.dose_range_unit === u ? "bg-blue-600 text-white" : "bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* ── Internal Notes ── */}
              <section className="space-y-3">
                <SectionHeading>Internal Notes</SectionHeading>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className={inputCls}
                  placeholder="Optional short notes"
                />
              </section>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="flex-1 rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-medium text-white disabled:opacity-50">
                  {submitting ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
