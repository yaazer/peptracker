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
