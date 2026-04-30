import { CompoundRead } from "@/lib/types";

export type DoseableCompound = Pick<
  CompoundRead,
  "medication_type" | "dose_unit" | "strength_amount" | "strength_unit"
>;

const UNIT_SINGULAR: Record<string, string> = {
  tablet: "tablet", capsule: "capsule", ml: "mL",
  mg: "mg", mcg: "mcg", drop: "drop", puff: "puff", patch: "patch",
};
const UNIT_PLURAL: Record<string, string> = {
  tablet: "tablets", capsule: "capsules", ml: "mL",
  mg: "mg", mcg: "mcg", drop: "drops", puff: "puffs", patch: "patches",
};
const FIELD_LABELS: Record<string, string> = {
  tablet: "Quantity (tablets)",
  capsule: "Quantity (capsules)",
  ml: "Volume (mL)",
  mg: "Dose (mg)",
  mcg: "Dose (mcg)",
  drop: "Quantity (drops)",
  puff: "Quantity (puffs)",
  patch: "Quantity (patches)",
};

export function quantityFieldLabel(compound: DoseableCompound): string {
  return FIELD_LABELS[compound.dose_unit] ?? `Quantity (${compound.dose_unit})`;
}

export function quantityHint(compound: DoseableCompound, quantity: string): string | null {
  const qty = parseFloat(quantity);
  if (!qty || !compound.strength_amount || !compound.strength_unit) return null;
  const { strength_amount: sa, strength_unit: su, dose_unit: du } = compound;

  if (du === "tablet" || du === "capsule") {
    if (qty === 1) return `${sa} ${su} per ${du}`;
    const plural = UNIT_PLURAL[du] ?? `${du}s`;
    return `${sa} ${su} × ${qty} ${plural} = ${sa * qty} ${su} total`;
  }
  if (du === "ml") {
    return `≈ ${sa * qty} ${su} total`;
  }
  if ((su === "mg" || su === "mg/ml") && du !== "mg") {
    return `≈ ${Math.round(sa * qty * 1000).toLocaleString()} mcg`;
  }
  return null;
}

function _unitMcg(compound: DoseableCompound): number | null {
  if (!compound.strength_amount || !compound.strength_unit) return null;
  const su = compound.strength_unit.toLowerCase().replace(/\s/g, "");
  const sa = compound.strength_amount;
  if (su === "mcg") return sa;
  if (su === "mg" || su === "mg/ml") return sa * 1000;
  if (su === "g") return sa * 1_000_000;
  return null;
}

/**
 * Returns a human-readable dose string for any medication type.
 *
 * For injections:  "500 mcg"
 * For tablets:     "1 tablet (300 mg)"  or  "2 tablets (600 mg)"
 * For liquids:     "5 mL (50 mg)"
 *
 * When quantity is available (InjectionRead), it is used directly.
 * When only dose_mcg is available (LastByCompoundItem, ProtocolRead),
 * the quantity is reverse-computed from compound strength.
 */
export function formatDose(
  compound: DoseableCompound | null | undefined,
  inj: { dose_mcg?: number | null; quantity?: number | null }
): string {
  if (!compound || compound.medication_type === "injection") {
    return inj.dose_mcg != null ? `${inj.dose_mcg.toLocaleString()} mcg` : "—";
  }

  const { dose_unit: du, strength_amount: sa, strength_unit: su } = compound;
  const singular = UNIT_SINGULAR[du] ?? du;
  const plural = UNIT_PLURAL[du] ?? `${du}s`;

  if (inj.quantity != null) {
    const qty = inj.quantity;
    const unitLabel = qty === 1 ? singular : plural;
    if (sa && su) return `${qty} ${unitLabel} (${sa * qty} ${su})`;
    return `${qty} ${unitLabel}`;
  }

  if (inj.dose_mcg != null) {
    const uMcg = _unitMcg(compound);
    if (uMcg) {
      const qty = inj.dose_mcg / uMcg;
      if (qty >= 0.05 && qty < 10_000) {
        const qtyStr = qty % 1 === 0 ? String(qty) : qty.toFixed(1);
        const unitLabel = qty === 1 ? singular : plural;
        if (sa && su) return `${qtyStr} ${unitLabel} (${sa * qty} ${su})`;
        return `${qtyStr} ${unitLabel}`;
      }
    }
    return `${inj.dose_mcg.toLocaleString()} mcg`;
  }

  return "—";
}
