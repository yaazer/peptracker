import { type BlendCalcResult } from "@/lib/reconstitution";

interface Props {
  result: BlendCalcResult | null;
  /** The user-input dose value (for "doses per vial at X" label) */
  doseMcg: number;
  doseMode: "total" | "anchor";
  /** Name of the currently selected anchor component */
  anchorName?: string;
}

export default function BlendResultCard({ result, doseMcg, doseMode, anchorName }: Props) {
  const totalDoseMg = result
    ? (result.drawVolumeMl * result.concentrationMgPerMl).toFixed(3)
    : null;

  return (
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
            at {doseMcg || "—"} mcg each
          </p>
        </div>
      </div>

      {/* Draw volume + total blend */}
      <div className="mt-4 flex justify-between border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Draw volume</p>
          <p className="font-semibold tabular-nums text-gray-900 dark:text-white">
            {result ? `${result.drawVolumeMl.toFixed(3)} mL` : "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total blend per dose</p>
          <p className="font-semibold tabular-nums text-gray-900 dark:text-white">
            {totalDoseMg ? `${totalDoseMg} mg` : "—"}
          </p>
        </div>
      </div>

      {/* Per-component breakdown */}
      {result && result.componentBreakdown.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Per component
          </p>
          <div className="space-y-1.5">
            {result.componentBreakdown.map((comp) => {
              const isSelectedAnchor =
                doseMode === "anchor" &&
                (anchorName ? comp.name === anchorName : comp.is_anchor);
              return (
                <div key={comp.name} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {comp.name}
                    {isSelectedAnchor && (
                      <span className="ml-1.5 text-xs text-blue-500 dark:text-blue-400">
                        anchor
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums font-medium text-gray-900 dark:text-white">
                    {comp.dose_mcg >= 1000
                      ? `${(comp.dose_mcg / 1000).toFixed(2)} mg`
                      : `${comp.dose_mcg.toLocaleString()} mcg`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Warnings */}
      {result?.warnings?.map((w) => (
        <p key={w} className="mt-3 text-xs text-amber-600 dark:text-amber-400">{w}</p>
      ))}
    </div>
  );
}
