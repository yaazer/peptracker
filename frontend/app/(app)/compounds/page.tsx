"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Calculator, Pencil, Plus, Trash2 } from "@/components/icons";
import { apiFetch } from "@/lib/api";
import { BlendComponent, CompoundRead } from "@/lib/types";

interface FormState {
  name: string;
  concentration_mg_per_ml: string;
  vial_size_mg: string;
  bac_water_ml: string;
  notes: string;
  is_blend: boolean;
  blend_components: BlendComponent[];
}

const emptyForm: FormState = {
  name: "",
  concentration_mg_per_ml: "",
  vial_size_mg: "",
  bac_water_ml: "",
  notes: "",
  is_blend: false,
  blend_components: [],
};

const emptyComponent = (): BlendComponent => ({
  name: "",
  linked_compound_id: null,
  amount_mg: 0,
  is_anchor: false,
  position: 0,
});

export default function CompoundsPage() {
  const [compounds, setCompounds] = useState<CompoundRead[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompoundRead | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (archived = showArchived) => {
    const res = await apiFetch(`/api/compounds?include_archived=${archived}`);
    if (res.ok) setCompounds(await res.json());
  };

  useEffect(() => {
    load();
  }, [showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: CompoundRead) => {
    setEditing(c);
    setForm({
      name: c.name,
      concentration_mg_per_ml: c.concentration_mg_per_ml?.toString() ?? "",
      vial_size_mg: c.vial_size_mg?.toString() ?? "",
      bac_water_ml: c.bac_water_ml?.toString() ?? "",
      notes: c.notes ?? "",
      is_blend: c.is_blend,
      blend_components: c.blend_components.map((bc) => ({ ...bc })),
    });
    setError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

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
        ...bc,
        is_anchor: i === idx,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.is_blend && form.blend_components.length < 2) {
      setError("A blend needs at least 2 components");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: form.name,
      notes: form.notes || null,
      is_blend: form.is_blend,
    };
    if (form.is_blend) {
      body.bac_water_ml = form.bac_water_ml ? parseFloat(form.bac_water_ml) : null;
      body.blend_components = form.blend_components.map((bc, i) => ({
        name: bc.name,
        amount_mg: bc.amount_mg,
        is_anchor: bc.is_anchor,
        position: i,
        linked_compound_id: bc.linked_compound_id,
      }));
    } else {
      body.concentration_mg_per_ml = form.concentration_mg_per_ml
        ? parseFloat(form.concentration_mg_per_ml)
        : null;
      body.vial_size_mg = form.vial_size_mg ? parseFloat(form.vial_size_mg) : null;
      body.bac_water_ml = form.bac_water_ml ? parseFloat(form.bac_water_ml) : null;
    }
    try {
      const res = editing
        ? await apiFetch(`/api/compounds/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
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

  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white";
  const labelCls = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

  const totalBlendMg = form.blend_components.reduce((s, bc) => s + (bc.amount_mg || 0), 0);

  return (
    <div className="px-4 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Compounds</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/calculator"
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Calculator size={15} /> Calc
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
        {compounds.map((c) => (
          <div
            key={c.id}
            className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${c.archived ? "opacity-50" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-gray-900 dark:text-white">{c.name}</p>
                  {c.is_blend && (
                    <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      blend
                    </span>
                  )}
                </div>
                {c.is_blend && c.blend_components.length > 0 ? (
                  <p className="mt-0.5 text-sm text-blue-600">
                    {c.blend_components.map((bc) => `${bc.name} ${bc.amount_mg}mg`).join(" · ")}
                    {c.bac_water_ml ? ` · ${c.bac_water_ml}mL BAC` : ""}
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
                {c.notes && (
                  <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{c.notes}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Link
                  href={`/calculator?compound_id=${c.id}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                  title="Reconstitution calculator"
                >
                  <Calculator size={16} />
                </Link>
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
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="w-full max-w-md overflow-y-auto rounded-t-2xl bg-white px-6 pt-6 pb-8 sm:max-h-[90vh] sm:rounded-2xl dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">
              {editing ? "Edit compound" : "Add compound"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelCls}>Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className={inputCls}
                  placeholder="e.g. BPC-157"
                />
              </div>

              {/* Blend toggle */}
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
                  {/* Blend components editor */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        Components {totalBlendMg > 0 && `· ${totalBlendMg} mg total`}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {form.blend_components.map((bc, idx) => (
                        <div
                          key={idx}
                          className={`rounded-lg border p-3 ${
                            bc.is_anchor
                              ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                              : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="text"
                              value={bc.name}
                              onChange={(e) => updateComponent(idx, { name: e.target.value })}
                              placeholder="Component name"
                              required
                              className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => removeComponent(idx)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 hover:text-red-500"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={bc.amount_mg || ""}
                                onChange={(e) =>
                                  updateComponent(idx, { amount_mg: parseFloat(e.target.value) || 0 })
                                }
                                placeholder="0"
                                required
                                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 pr-8 text-sm text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                              />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                mg
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAnchor(idx)}
                              className={`shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                                bc.is_anchor
                                  ? "bg-blue-600 text-white"
                                  : "border border-gray-300 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400"
                              }`}
                              title="Set as anchor (dose reference)"
                            >
                              Anchor
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addComponent}
                      className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:hover:border-blue-700"
                    >
                      <Plus size={14} /> Add component
                    </button>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                      BAC water (mL)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={form.bac_water_ml}
                      onChange={(e) => setForm({ ...form, bac_water_ml: e.target.value })}
                      className={inputCls}
                      placeholder="e.g. 2"
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Reconstitution (optional)
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">mg/mL</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={form.concentration_mg_per_ml}
                        onChange={(e) =>
                          setForm({ ...form, concentration_mg_per_ml: e.target.value })
                        }
                        className={inputCls}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Vial mg</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={form.vial_size_mg}
                        onChange={(e) => setForm({ ...form, vial_size_mg: e.target.value })}
                        className={inputCls}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">BAC mL</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={form.bac_water_ml}
                        onChange={(e) => setForm({ ...form, bac_water_ml: e.target.value })}
                        className={inputCls}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className={labelCls}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className={inputCls}
                  placeholder="Optional"
                />
              </div>

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
          </div>
        </div>
      )}
    </div>
  );
}
