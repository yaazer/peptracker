export type SyringeType = "U100" | "U40" | "TB";

export interface CalcInput {
  vialMg: number;
  bacMl: number;
  doseMcg: number;
  syringeType: SyringeType;
  syringeMl: number;
}

export interface CalcResult {
  concentrationMgPerMl: number;
  drawVolumeMl: number;
  dosesPerVial: number;
  markingValue: number;
  markingUnit: "units" | "mL";
  totalMarkings: number;
  overCapacity: boolean;
  overdose: boolean;
  warnings: string[];
}

export interface Tick {
  /** 0 = needle end (bottom), 1 = plunger end (top) */
  position: number;
  value: number;
  isMajor: boolean;
  label: string | null;
}

// ---------------------------------------------------------------------------
// Syringe specs
// ---------------------------------------------------------------------------

/** Total markings (max value on scale) for a given syringe */
export function totalMarkings(type: SyringeType, capacityMl: number): number {
  switch (type) {
    case "U100": return Math.round(capacityMl * 100);
    case "U40":  return Math.round(capacityMl * 40);
    case "TB":   return capacityMl; // mL scale
  }
}

/** Convert draw volume (mL) to the syringe's native marking value */
export function mlToMarking(type: SyringeType, drawVolumeMl: number): number {
  switch (type) {
    case "U100": return drawVolumeMl * 100;
    case "U40":  return drawVolumeMl * 40;
    case "TB":   return drawVolumeMl;
  }
}

export function markingUnit(type: SyringeType): "units" | "mL" {
  return type === "TB" ? "mL" : "units";
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/** Returns null when any required input is zero/missing. */
export function calculate(input: Partial<CalcInput>): CalcResult | null {
  const { vialMg = 0, bacMl = 0, doseMcg = 0, syringeType = "U100", syringeMl = 1 } = input;

  if (!vialMg || !bacMl || !doseMcg) return null;

  const concentrationMgPerMl = vialMg / bacMl;
  const drawVolumeMl = doseMcg / 1000 / concentrationMgPerMl;
  const dosesPerVial = Math.floor((vialMg * 1000) / doseMcg);
  const markingVal = mlToMarking(syringeType, drawVolumeMl);
  const total = totalMarkings(syringeType, syringeMl);
  const unit = markingUnit(syringeType);

  const overCapacity = drawVolumeMl > syringeMl;
  const overdose = doseMcg > vialMg * 1000;

  const warnings: string[] = [];
  if (overCapacity) {
    warnings.push(
      `Dose too large for ${syringeMl} mL syringe — select a larger size`
    );
  }
  if (overdose) {
    warnings.push("Requested dose exceeds full vial contents");
  }

  return {
    concentrationMgPerMl,
    drawVolumeMl,
    dosesPerVial,
    markingValue: markingVal,
    markingUnit: unit,
    totalMarkings: total,
    overCapacity,
    overdose,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Blend calculation
// ---------------------------------------------------------------------------

export interface BlendComponentInput {
  name: string;
  amount_mg: number;
  is_anchor: boolean;
}

export interface ComponentBreakdown {
  name: string;
  amount_mg: number;
  dose_mcg: number;
  fraction: number;
  is_anchor: boolean;
}

export interface BlendCalcResult extends CalcResult {
  componentBreakdown: ComponentBreakdown[];
  totalAmountMg: number;
}

/**
 * Calculate reconstitution and per-component doses for a blend compound.
 * @param components - list of blend components
 * @param bacMl - BAC water volume in mL
 * @param doseMcg - dose for anchor (anchor mode) or total (total mode)
 * @param doseMode - "total" or "anchor"
 * @param syringeType - syringe type
 * @param syringeMl - syringe capacity in mL
 */
export function calculateBlend(
  components: BlendComponentInput[],
  bacMl: number,
  doseMcg: number,
  doseMode: "total" | "anchor",
  syringeType: SyringeType = "U100",
  syringeMl: number = 1
): BlendCalcResult | null {
  if (!components.length || !bacMl || !doseMcg) return null;

  const totalAmountMg = components.reduce((s, c) => s + c.amount_mg, 0);
  if (!totalAmountMg) return null;

  const concentrationMgPerMl = totalAmountMg / bacMl;
  let totalDoseMcg: number;
  let drawVolumeMl: number;

  if (doseMode === "anchor") {
    const anchor = components.find((c) => c.is_anchor) ?? components[0];
    const anchorConc = anchor.amount_mg / bacMl;
    if (!anchorConc) return null;
    drawVolumeMl = doseMcg / 1000 / anchorConc;
    const anchorFraction = anchor.amount_mg / totalAmountMg;
    totalDoseMcg = doseMcg / anchorFraction;
  } else {
    drawVolumeMl = doseMcg / 1000 / concentrationMgPerMl;
    totalDoseMcg = doseMcg;
  }

  const dosesPerVial = Math.floor((totalAmountMg * 1000) / totalDoseMcg);
  const markingVal = mlToMarking(syringeType, drawVolumeMl);
  const total = totalMarkings(syringeType, syringeMl);
  const unit = markingUnit(syringeType);
  const overCapacity = drawVolumeMl > syringeMl;
  const overdose = totalDoseMcg > totalAmountMg * 1000;

  const warnings: string[] = [];
  if (overCapacity) warnings.push(`Dose too large for ${syringeMl} mL syringe — select a larger size`);
  if (overdose) warnings.push("Requested dose exceeds full vial contents");

  const componentBreakdown: ComponentBreakdown[] = components.map((c) => {
    const fraction = c.amount_mg / totalAmountMg;
    return {
      name: c.name,
      amount_mg: c.amount_mg,
      dose_mcg: Math.round(totalDoseMcg * fraction),
      fraction,
      is_anchor: c.is_anchor,
    };
  });

  return {
    concentrationMgPerMl,
    drawVolumeMl,
    dosesPerVial,
    markingValue: markingVal,
    markingUnit: unit,
    totalMarkings: total,
    overCapacity,
    overdose,
    warnings,
    componentBreakdown,
    totalAmountMg,
  };
}

// ---------------------------------------------------------------------------
// Tick generation for SVG
// ---------------------------------------------------------------------------

export function getTicks(type: SyringeType, capacityMl: number): Tick[] {
  const ticks: Tick[] = [];
  const total = totalMarkings(type, capacityMl);

  if (type === "U100") {
    // Major every 10 units, minor every 1 unit (or every 5 for 0.3 mL)
    const majorInterval = capacityMl <= 0.3 ? 5 : 10;
    for (let v = 0; v <= total; v++) {
      const isMajor = v % majorInterval === 0;
      ticks.push({
        position: v / total,
        value: v,
        isMajor,
        label: isMajor ? String(v) : null,
      });
    }
  } else if (type === "U40") {
    // Major every 5 units, minor every 1 unit
    const majorInterval = 5;
    for (let v = 0; v <= total; v++) {
      const isMajor = v % majorInterval === 0;
      ticks.push({
        position: v / total,
        value: v,
        isMajor,
        label: isMajor ? String(v) : null,
      });
    }
  } else {
    // TB: major every 0.1 mL, minor every 0.05 mL
    const steps = Math.round(capacityMl / 0.05);
    for (let i = 0; i <= steps; i++) {
      const v = parseFloat((i * 0.05).toFixed(2));
      const isMajor = Math.round(v * 10) % 1 === 0; // every 0.1
      ticks.push({
        position: v / capacityMl,
        value: v,
        isMajor,
        label: isMajor ? v.toFixed(1) : null,
      });
    }
  }

  return ticks;
}
