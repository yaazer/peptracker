"use client";

import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "@/components/icons";
import { apiFetch } from "@/lib/api";
import { CompoundRead } from "@/lib/types";

interface FormState {
  name: string;
  concentration_mg_per_ml: string;
  vial_size_mg: string;
  bac_water_ml: string;
  notes: string;
}

const emptyForm: FormState = {
  name: "",
  concentration_mg_per_ml: "",
  vial_size_mg: "",
  bac_water_ml: "",
  notes: "",
};

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
    });
    setError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const body = {
      name: form.name,
      concentration_mg_per_ml: form.concentration_mg_per_ml ? parseFloat(form.concentration_mg_per_ml) : null,
      vial_size_mg: form.vial_size_mg ? parseFloat(form.vial_size_mg) : null,
      bac_water_ml: form.bac_water_ml ? parseFloat(form.bac_water_ml) : null,
      notes: form.notes || null,
    };
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

  return (
    <div className="px-4 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Compounds</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          className="h-4 w-4 rounded"
        />
        Show archived
      </label>

      {compounds.length === 0 && (
        <p className="mt-12 text-center text-gray-400">No compounds yet. Tap Add to create one.</p>
      )}

      <div className="space-y-3">
        {compounds.map((c) => (
          <div
            key={c.id}
            className={`rounded-xl border bg-white p-4 shadow-sm ${c.archived ? "opacity-50" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{c.name}</p>
                {c.concentration_mg_per_ml && (
                  <p className="mt-0.5 text-sm text-blue-600">
                    {c.concentration_mg_per_ml} mg/mL
                    {c.vial_size_mg ? ` · ${c.vial_size_mg} mg vial` : ""}
                    {c.bac_water_ml ? ` · ${c.bac_water_ml} mL BAC water` : ""}
                  </p>
                )}
                {c.notes && (
                  <p className="mt-1 truncate text-sm text-gray-500">{c.notes}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => openEdit(c)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => toggleArchive(c)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title={c.archived ? "Unarchive" : "Archive"}
                >
                  {c.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
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
          <div className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              {editing ? "Edit compound" : "Add compound"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. BPC-157"
                />
              </div>

              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Reconstitution (optional)
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-600">mg/mL</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={form.concentration_mg_per_ml}
                    onChange={(e) => setForm({ ...form, concentration_mg_per_ml: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-blue-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">Vial mg</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={form.vial_size_mg}
                    onChange={(e) => setForm({ ...form, vial_size_mg: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-blue-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">BAC mL</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={form.bac_water_ml}
                    onChange={(e) => setForm({ ...form, bac_water_ml: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-blue-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-blue-500 focus:outline-none"
                  placeholder="Optional"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-700"
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
