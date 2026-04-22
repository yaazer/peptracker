"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { calculate, type CalcResult, type SyringeType } from "@/lib/reconstitution";
import { type CompoundRead } from "@/lib/types";
import SyringePreview from "@/components/SyringePreview";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_VIAL_CHIPS = [5, 10, 15, 20, 30];
const BAC_CHIPS = [1, 2, 3, 5];

type SyringeTypeLabel = { value: SyringeType; label: string };
const SYRINGE_TYPES: SyringeTypeLabel[] = [
  { value: "U100", label: "U-100" },
  { value: "U40", label: "U-40" },
  { value: "TB", label: "Tuberculin" },
];

const SYRINGE_SIZES: Record<SyringeType, number[]> = {
  U100: [0.3, 0.5, 1],
  U40: [0.5, 1],
  TB: [0.5, 1],
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InitialCalcValues {
  vialMg?: number;
  bacMl?: number;
  doseMcg?: number;
  syringeType?: SyringeType;
  syringeMl?: number;
}

interface Props {
  initialCompound?: CompoundRead;
  initialValues?: InitialCalcValues;
  /** Pre-loaded list; if omitted the component fetches from /api/compounds */
  compounds?: CompoundRead[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReconstitutionCalculator({
  initialCompound,
  initialValues,
  compounds: compoundsProp,
}: Props) {
  // Compound list
  const [compounds, setCompounds] = useState<CompoundRead[]>(compoundsProp ?? []);
  const [selectedCompound, setSelectedCompound] = useState<CompoundRead | null>(
    initialCompound ?? null
  );

  // Inputs
  const [vialMg, setVialMg] = useState(
    initialValues?.vialMg
      ? String(initialValues.vialMg)
      : initialCompound?.vial_size_mg
      ? String(initialCompound.vial_size_mg)
      : ""
  );
  const [bacMl, setBacMl] = useState(
    initialValues?.bacMl
      ? String(initialValues.bacMl)
      : initialCompound?.bac_water_ml
      ? String(initialCompound.bac_water_ml)
      : ""
  );
  const [doseMcg, setDoseMcg] = useState(
    initialValues?.doseMcg ? String(initialValues.doseMcg) : ""
  );
  const [doseUnit, setDoseUnit] = useState<"mcg" | "mg">("mcg");
  const [syringeType, setSyringeType] = useState<SyringeType>(
    (initialCompound?.default_syringe_type as SyringeType | null) ??
      initialValues?.syringeType ??
      "U100"
  );
  const [syringeMl, setSyringeMl] = useState(
    initialCompound?.default_syringe_ml ??
      initialValues?.syringeMl ??
      1
  );

  // Save-back state
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  // Fetch compounds if not provided
  useEffect(() => {
    if (!compoundsProp) {
      apiFetch("/api/compounds")
        .then((r) => (r.ok ? r.json() : []))
        .then(setCompounds);
    }
  }, [compoundsProp]);

  // When syringe type changes, clamp syringeMl to a valid size for that type
  useEffect(() => {
    const sizes = SYRINGE_SIZES[syringeType];
    if (!sizes.includes(syringeMl)) {
      setSyringeMl(sizes[sizes.length - 1]);
    }
  }, [syringeType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  // Convert dose input to mcg for the calculation
  const doseMcgNum = (() => {
    const raw = parseFloat(doseMcg);
    if (isNaN(raw)) return 0;
    return doseUnit === "mg" ? raw * 1000 : raw;
  })();

  const result: CalcResult | null = calculate({
    vialMg: parseFloat(vialMg) || 0,
    bacMl: parseFloat(bacMl) || 0,
    doseMcg: doseMcgNum,
    syringeType,
    syringeMl,
  });

  // Show save-back button when inputs differ from the compound's saved values
  const showSaveBack =
    selectedCompound !== null &&
    !saving &&
    !saveToast &&
    (parseFloat(vialMg) !== Number(selectedCompound.vial_size_mg) ||
      parseFloat(bacMl) !== Number(selectedCompound.bac_water_ml));

  const vialChips = selectedCompound?.preset_vial_sizes ?? DEFAULT_VIAL_CHIPS;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCompoundChange = (id: string) => {
    if (!id) {
      setSelectedCompound(null);
      return;
    }
    const c = compounds.find((c) => String(c.id) === id) ?? null;
    setSelectedCompound(c);
    if (c) {
      if (c.vial_size_mg) setVialMg(String(c.vial_size_mg));
      if (c.bac_water_ml) setBacMl(String(c.bac_water_ml));
      if (c.default_syringe_type) setSyringeType(c.default_syringe_type as SyringeType);
      if (c.default_syringe_ml) setSyringeMl(Number(c.default_syringe_ml));
    }
  };

  const handleSaveBack = async () => {
    if (!selectedCompound) return;
    setSaving(true);
    try {
      await apiFetch(`/api/compounds/${selectedCompound.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          vial_size_mg: parseFloat(vialMg) || null,
          bac_water_ml: parseFloat(bacMl) || null,
        }),
      });
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Compound selector — full width */}
      <div>
        <SectionLabel>Compound</SectionLabel>
        <select
          value={selectedCompound ? String(selectedCompound.id) : ""}
          onChange={(e) => handleCompoundChange(e.target.value)}
          className={inputCls}
        >
          <option value="">Custom (no compound)</option>
          {compounds.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* ── Left column: inputs ── */}
        <div className="flex-1 space-y-5">
          {/* Vial size */}
          <div>
            <SectionLabel>Vial size</SectionLabel>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                value={vialMg}
                onChange={(e) => setVialMg(e.target.value)}
                placeholder="e.g. 10"
                className={`${inputCls} pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500">
                mg
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {vialChips.map((v) => (
                <Chip
                  key={v}
                  label={`${v} mg`}
                  active={parseFloat(vialMg) === v}
                  onClick={() => setVialMg(String(v))}
                />
              ))}
            </div>
          </div>

          {/* BAC water */}
          <div>
            <SectionLabel>BAC water added</SectionLabel>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                value={bacMl}
                onChange={(e) => setBacMl(e.target.value)}
                placeholder="e.g. 2"
                className={`${inputCls} pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500">
                mL
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {BAC_CHIPS.map((v) => (
                <Chip
                  key={v}
                  label={`${v} mL`}
                  active={parseFloat(bacMl) === v}
                  onClick={() => setBacMl(String(v))}
                />
              ))}
            </div>
          </div>

          {/* Dose */}
          <div>
            <SectionLabel>Desired dose</SectionLabel>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={doseMcg}
                  onChange={(e) => setDoseMcg(e.target.value)}
                  placeholder={doseUnit === "mcg" ? "e.g. 250" : "e.g. 0.25"}
                  className={inputCls}
                />
              </div>
              {/* mcg/mg toggle */}
              <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
                {(["mcg", "mg"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setDoseUnit(u)}
                    className={`px-3 py-3 text-sm font-medium transition-colors ${
                      doseUnit === u
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Syringe type */}
          <div>
            <SectionLabel>Syringe type</SectionLabel>
            <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
              {SYRINGE_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSyringeType(value)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    syringeType === value
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Syringe size */}
          <div>
            <SectionLabel>Syringe size</SectionLabel>
            <div className="flex gap-2">
              {SYRINGE_SIZES[syringeType].map((ml) => (
                <Chip
                  key={ml}
                  label={`${ml} mL`}
                  active={syringeMl === ml}
                  onClick={() => setSyringeMl(ml)}
                />
              ))}
            </div>
          </div>

          {/* Save-back */}
          {showSaveBack && (
            <button
              type="button"
              onClick={handleSaveBack}
              disabled={saving}
              className="w-full rounded-lg border border-blue-300 bg-blue-50 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
            >
              Save as default for {selectedCompound!.name}
            </button>
          )}
          {saveToast && (
            <p className="text-center text-sm font-medium text-green-600 dark:text-green-400">
              Defaults updated
            </p>
          )}
        </div>

        {/* ── Right column: syringe preview ── */}
        <div className="flex justify-center lg:w-56 lg:justify-end">
          <SyringePreview
            syringeType={syringeType}
            syringeMl={syringeMl}
            drawVolumeMl={result?.drawVolumeMl ?? 0}
            totalMarkings={result?.totalMarkings ?? (syringeMl * (syringeType === "U100" ? 100 : syringeType === "U40" ? 40 : 1))}
            markingValue={result?.markingValue ?? 0}
            markingUnit={result?.markingUnit ?? (syringeType === "TB" ? "mL" : "units")}
            warnings={result?.warnings ?? []}
          />
        </div>
      </div>

      {/* ── Summary card ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-800">
          <div className="pr-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Concentration
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
              {result ? result.concentrationMgPerMl.toFixed(2) : "—"}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">mg / mL</p>
          </div>
          <div className="pl-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Doses per vial
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
              {result ? result.dosesPerVial : "—"}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              at {doseMcg || "—"} {doseUnit} each
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
