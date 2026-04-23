"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiFetch } from "@/lib/api";
import { CompoundRead } from "@/lib/types";
import { ExternalLink } from "@/components/icons";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="text-sm text-gray-200">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function formatDose(mcg: number | null | undefined): string {
  if (mcg == null) return "—";
  if (mcg >= 1000) return `${(mcg / 1000).toFixed(mcg % 1000 === 0 ? 0 : 2)} mg`;
  return `${mcg} mcg`;
}

export default function CompoundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [compound, setCompound] = useState<CompoundRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    apiFetch(`/api/compounds/${id}`)
      .then((r) => r.json())
      .then(setCompound)
      .catch(() => setError("Failed to load compound"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleArchiveToggle = async () => {
    if (!compound) return;
    setArchiving(true);
    try {
      const res = await apiFetch(`/api/compounds/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: !compound.archived }),
      });
      if (res.ok) {
        setCompound((c) => c ? { ...c, archived: !c.archived } : c);
      }
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </div>
    );
  }

  if (error || !compound) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-red-400">{error ?? "Compound not found"}</p>
      </div>
    );
  }

  const totalBlendMg = compound.blend_components.reduce((s, c) => s + c.amount_mg, 0);

  return (
    <div className="min-h-screen bg-gray-900 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ←
        </button>
        <h1 className="flex-1 text-base font-semibold text-white truncate">{compound.name}</h1>
        <Link
          href={`/compounds?duplicate_from=${compound.id}`}
          className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded"
        >
          Duplicate
        </Link>
        <Link
          href="/compounds"
          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded"
        >
          All compounds
        </Link>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {compound.archived && (
          <div className="bg-yellow-900/40 border border-yellow-700 rounded-xl px-4 py-2 text-sm text-yellow-300">
            This compound is archived
          </div>
        )}

        {/* Basic info */}
        <Section title="Basic Info">
          <Field label="Name">{compound.name}</Field>
          {compound.aliases && (
            <Field label="Also known as">
              <span className="text-gray-300">{compound.aliases}</span>
            </Field>
          )}
          {compound.molecular_weight && (
            <Field label="Molecular weight">{compound.molecular_weight} Da</Field>
          )}
          {compound.half_life_hours && (
            <Field label="Half-life">
              {compound.half_life_hours >= 24
                ? `${(compound.half_life_hours / 24).toFixed(1)} days`
                : `${compound.half_life_hours} hours`}
            </Field>
          )}
        </Section>

        {/* Reconstitution */}
        {(compound.is_blend || compound.concentration_mg_per_ml || compound.vial_size_mg || compound.bac_water_ml) && (
          <Section title="Reconstitution">
            {compound.is_blend ? (
              <>
                <Field label="Type">Blend ({compound.blend_components.length} components, {totalBlendMg} mg total)</Field>
                <div className="space-y-2 mt-1">
                  {compound.blend_components.map((bc) => (
                    <div key={bc.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-200">
                        {bc.name}
                        {bc.is_anchor && (
                          <span className="ml-1.5 text-xs text-blue-400 border border-blue-600 rounded px-1">anchor</span>
                        )}
                      </span>
                      <span className="text-gray-400">{bc.amount_mg} mg</span>
                    </div>
                  ))}
                </div>
                {compound.bac_water_ml && (
                  <Field label="BAC water">{compound.bac_water_ml} mL</Field>
                )}
              </>
            ) : (
              <>
                {compound.vial_size_mg && <Field label="Vial size">{compound.vial_size_mg} mg</Field>}
                {compound.bac_water_ml && <Field label="BAC water">{compound.bac_water_ml} mL</Field>}
                {compound.concentration_mg_per_ml && (
                  <Field label="Concentration">{compound.concentration_mg_per_ml} mg/mL</Field>
                )}
              </>
            )}
          </Section>
        )}

        {/* Personal dosing range */}
        {(compound.typical_dose_mcg_min || compound.typical_dose_mcg_max) && (
          <Section title="Personal Dosing Range">
            <Field label="Typical dose">
              {formatDose(compound.typical_dose_mcg_min)} – {formatDose(compound.typical_dose_mcg_max)}
            </Field>
          </Section>
        )}

        {/* Reference */}
        {(compound.reference_url || compound.reference_notes) && (
          <Section title="Reference">
            {compound.reference_url && (
              <Field label="Source">
                <a
                  href={compound.reference_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open reference"
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline break-all"
                >
                  <span className="break-all">{compound.reference_url}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              </Field>
            )}
            {compound.reference_notes && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                <div className="prose prose-invert prose-sm max-w-none text-gray-300 [&_a]:text-blue-400 [&_a]:hover:underline [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {compound.reference_notes}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Personal notes */}
        {compound.notes && (
          <Section title="Notes">
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{compound.notes}</p>
          </Section>
        )}

        {/* Actions */}
        <div className="pt-2">
          <button
            onClick={handleArchiveToggle}
            disabled={archiving}
            className="w-full text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-xl py-2.5 transition-colors"
          >
            {archiving ? "…" : compound.archived ? "Unarchive compound" : "Archive compound"}
          </button>
        </div>
      </div>
    </div>
  );
}
