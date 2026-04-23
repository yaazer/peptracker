import { describe, expect, it } from "vitest";
import { calculate, calculateBlend, getTicks, mlToMarking, totalMarkings } from "./reconstitution";

// ---------------------------------------------------------------------------
// Spec scenarios
// ---------------------------------------------------------------------------

describe("Retatrutide scenario", () => {
  // 10 mg vial + 2 mL BAC + 250 mcg dose + U-100 1 mL
  const result = calculate({ vialMg: 10, bacMl: 2, doseMcg: 250, syringeType: "U100", syringeMl: 1 });

  it("returns a result", () => expect(result).not.toBeNull());
  it("concentration = 5 mg/mL", () => expect(result!.concentrationMgPerMl).toBe(5));
  it("draw volume = 0.05 mL", () => expect(result!.drawVolumeMl).toBeCloseTo(0.05, 6));
  it("marking = 5 units", () => expect(result!.markingValue).toBeCloseTo(5, 6));
  it("marking unit = units", () => expect(result!.markingUnit).toBe("units"));
  it("doses per vial = 40", () => expect(result!.dosesPerVial).toBe(40));
  it("total markings = 100", () => expect(result!.totalMarkings).toBe(100));
  it("no warnings", () => expect(result!.warnings).toHaveLength(0));
});

describe("Semaglutide scenario", () => {
  // 5 mg vial + 2 mL BAC + 250 mcg dose + U-100 0.5 mL
  const result = calculate({ vialMg: 5, bacMl: 2, doseMcg: 250, syringeType: "U100", syringeMl: 0.5 });

  it("returns a result", () => expect(result).not.toBeNull());
  it("concentration = 2.5 mg/mL", () => expect(result!.concentrationMgPerMl).toBe(2.5));
  it("draw volume = 0.1 mL", () => expect(result!.drawVolumeMl).toBeCloseTo(0.1, 6));
  it("marking = 10 units", () => expect(result!.markingValue).toBeCloseTo(10, 6));
  it("doses per vial = 20", () => expect(result!.dosesPerVial).toBe(20));
  it("total markings = 50", () => expect(result!.totalMarkings).toBe(50));
  it("no over-capacity", () => expect(result!.overCapacity).toBe(false));
});

describe("U-40 math differs from U-100", () => {
  // 10 mg vial + 1 mL BAC + 500 mcg dose + U-40 1 mL
  const u40 = calculate({ vialMg: 10, bacMl: 1, doseMcg: 500, syringeType: "U40", syringeMl: 1 });
  const u100 = calculate({ vialMg: 10, bacMl: 1, doseMcg: 500, syringeType: "U100", syringeMl: 1 });

  it("U-40 returns a result", () => expect(u40).not.toBeNull());
  it("same draw volume regardless of type", () => {
    expect(u40!.drawVolumeMl).toBeCloseTo(u100!.drawVolumeMl, 6);
  });
  it("U-40 marking = 2 units", () => expect(u40!.markingValue).toBeCloseTo(2, 6));
  it("U-100 marking = 5 units", () => expect(u100!.markingValue).toBeCloseTo(5, 6));
  it("U-40 unit word is units", () => expect(u40!.markingUnit).toBe("units"));
  it("U-40 total markings = 40", () => expect(u40!.totalMarkings).toBe(40));
  it("doses per vial = 20", () => expect(u40!.dosesPerVial).toBe(20));
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("zero inputs return null", () => {
  it("zero vialMg", () => expect(calculate({ vialMg: 0, bacMl: 2, doseMcg: 250 })).toBeNull());
  it("zero bacMl", () => expect(calculate({ vialMg: 10, bacMl: 0, doseMcg: 250 })).toBeNull());
  it("zero doseMcg", () => expect(calculate({ vialMg: 10, bacMl: 2, doseMcg: 0 })).toBeNull());
  it("all zero", () => expect(calculate({})).toBeNull());
  it("missing fields", () => expect(calculate({ vialMg: 10 })).toBeNull());
});

describe("over-capacity warning", () => {
  // 10 mg vial + 10 mL BAC → 1 mg/mL. 50 mg dose → 50 mL draw on 1 mL syringe
  const result = calculate({ vialMg: 10, bacMl: 10, doseMcg: 50000, syringeType: "U100", syringeMl: 1 });

  it("returns a result (not null)", () => expect(result).not.toBeNull());
  it("overCapacity = true", () => expect(result!.overCapacity).toBe(true));
  it("includes over-capacity warning", () => {
    expect(result!.warnings.some((w) => w.includes("too large"))).toBe(true);
  });
});

describe("overdose warning", () => {
  // 1 mg vial (1000 mcg total), requesting 5000 mcg
  const result = calculate({ vialMg: 1, bacMl: 1, doseMcg: 5000, syringeType: "U100", syringeMl: 1 });

  it("overdose = true", () => expect(result!.overdose).toBe(true));
  it("includes overdose warning", () => {
    expect(result!.warnings.some((w) => w.includes("exceeds full vial"))).toBe(true);
  });
});

describe("fractional dose (Tuberculin)", () => {
  // Any vial + 3 mL BAC + 333 mcg dose + TB 1 mL
  const result = calculate({ vialMg: 10, bacMl: 3, doseMcg: 333, syringeType: "TB", syringeMl: 1 });

  it("concentration ≈ 3.333 mg/mL", () => expect(result!.concentrationMgPerMl).toBeCloseTo(10 / 3, 4));
  it("draw volume ≈ 0.0999 mL", () => expect(result!.drawVolumeMl).toBeCloseTo(0.333 / (10 / 3), 4));
  it("marking unit is mL", () => expect(result!.markingUnit).toBe("mL"));
  it("marking value equals draw volume", () => expect(result!.markingValue).toBeCloseTo(result!.drawVolumeMl, 6));
  it("doses per vial = 30", () => expect(result!.dosesPerVial).toBe(30));
});

describe("exact dose equals vial contents", () => {
  // 10 mg vial, 10 mg = 10000 mcg dose → exactly 1 dose, no overdose
  const result = calculate({ vialMg: 10, bacMl: 2, doseMcg: 10000, syringeType: "U100", syringeMl: 1 });
  it("doses per vial = 1", () => expect(result!.dosesPerVial).toBe(1));
  it("overdose = false", () => expect(result!.overdose).toBe(false));
});

// ---------------------------------------------------------------------------
// mlToMarking helpers
// ---------------------------------------------------------------------------

describe("mlToMarking", () => {
  it("U100: 0.05 mL → 5", () => expect(mlToMarking("U100", 0.05)).toBeCloseTo(5));
  it("U40: 0.05 mL → 2", () => expect(mlToMarking("U40", 0.05)).toBeCloseTo(2));
  it("TB: 0.05 mL → 0.05", () => expect(mlToMarking("TB", 0.05)).toBeCloseTo(0.05));
});

describe("totalMarkings", () => {
  it("U100 1 mL → 100", () => expect(totalMarkings("U100", 1)).toBe(100));
  it("U100 0.5 mL → 50", () => expect(totalMarkings("U100", 0.5)).toBe(50));
  it("U100 0.3 mL → 30", () => expect(totalMarkings("U100", 0.3)).toBe(30));
  it("U40 1 mL → 40", () => expect(totalMarkings("U40", 1)).toBe(40));
  it("U40 0.5 mL → 20", () => expect(totalMarkings("U40", 0.5)).toBe(20));
  it("TB 1 mL → 1", () => expect(totalMarkings("TB", 1)).toBe(1));
});

// ---------------------------------------------------------------------------
// Blend calculation (GLOW scenario)
// ---------------------------------------------------------------------------

describe("calculateBlend — GLOW anchor mode", () => {
  // GHK-Cu 50mg + TB-500 10mg + BPC-157 10mg (anchor) + 2mL BAC
  // Anchor dose: 250 mcg BPC-157
  const components = [
    { name: "GHK-Cu", amount_mg: 50, is_anchor: false },
    { name: "TB-500", amount_mg: 10, is_anchor: false },
    { name: "BPC-157", amount_mg: 10, is_anchor: true },
  ];
  const result = calculateBlend(components, 2, 250, "anchor", "U100", 1);

  it("returns a result", () => expect(result).not.toBeNull());
  it("total amount = 70 mg", () => expect(result!.totalAmountMg).toBe(70));
  it("concentration = 35 mg/mL", () => expect(result!.concentrationMgPerMl).toBe(35));
  it("draw volume = 0.05 mL", () => expect(result!.drawVolumeMl).toBeCloseTo(0.05, 6));
  it("marking = 5 units (U-100)", () => expect(result!.markingValue).toBeCloseTo(5, 6));
  it("doses per vial = 40", () => expect(result!.dosesPerVial).toBe(40));
  it("GHK-Cu dose ≈ 1250 mcg", () => {
    const ghk = result!.componentBreakdown.find((c) => c.name === "GHK-Cu");
    expect(ghk!.dose_mcg).toBe(1250);
  });
  it("TB-500 dose = 250 mcg", () => {
    const tb = result!.componentBreakdown.find((c) => c.name === "TB-500");
    expect(tb!.dose_mcg).toBe(250);
  });
  it("BPC-157 dose = 250 mcg", () => {
    const bpc = result!.componentBreakdown.find((c) => c.name === "BPC-157");
    expect(bpc!.dose_mcg).toBe(250);
  });
  it("no warnings", () => expect(result!.warnings).toHaveLength(0));
});

describe("calculateBlend — total mode", () => {
  // Same GLOW blend but using total dose = 1750 mcg
  const components = [
    { name: "GHK-Cu", amount_mg: 50, is_anchor: false },
    { name: "TB-500", amount_mg: 10, is_anchor: false },
    { name: "BPC-157", amount_mg: 10, is_anchor: true },
  ];
  const result = calculateBlend(components, 2, 1750, "total", "U100", 1);

  it("returns a result", () => expect(result).not.toBeNull());
  it("draw volume = 0.05 mL", () => expect(result!.drawVolumeMl).toBeCloseTo(0.05, 6));
  it("GHK-Cu dose ≈ 1250 mcg", () => {
    const ghk = result!.componentBreakdown.find((c) => c.name === "GHK-Cu");
    expect(ghk!.dose_mcg).toBe(1250);
  });
});

describe("calculateBlend — null cases", () => {
  const comp = [{ name: "A", amount_mg: 10, is_anchor: true }];
  it("no components returns null", () => expect(calculateBlend([], 2, 250, "total")).toBeNull());
  it("zero bacMl returns null", () => expect(calculateBlend(comp, 0, 250, "total")).toBeNull());
  it("zero dose returns null", () => expect(calculateBlend(comp, 2, 0, "total")).toBeNull());
});

// ---------------------------------------------------------------------------
// getTicks
// ---------------------------------------------------------------------------

describe("getTicks", () => {
  it("U100 1 mL has 101 ticks (0–100)", () => {
    const ticks = getTicks("U100", 1);
    expect(ticks.length).toBe(101);
  });
  it("U100 1 mL major ticks at multiples of 10", () => {
    const major = getTicks("U100", 1).filter((t) => t.isMajor).map((t) => t.value);
    expect(major).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
  it("U40 1 mL major ticks at multiples of 5", () => {
    const major = getTicks("U40", 1).filter((t) => t.isMajor).map((t) => t.value);
    expect(major).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40]);
  });
  it("TB 1 mL has major ticks at 0.1 mL intervals", () => {
    const major = getTicks("TB", 1).filter((t) => t.isMajor).map((t) => t.value);
    expect(major).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
  });
  it("all ticks have position in [0, 1]", () => {
    const ticks = getTicks("U100", 0.5);
    ticks.forEach((t) => {
      expect(t.position).toBeGreaterThanOrEqual(0);
      expect(t.position).toBeLessThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Anchor ↔ total mode consistency
// ---------------------------------------------------------------------------

// GLOW blend: GHK-Cu 50mg + TB-500 10mg + BPC-157 10mg (anchor), 2 mL BAC
// Total blend = 70 mg, concentration = 35 mg/mL
// BPC-157 is anchor (10/70 = 1/7 of total)
// 250 mcg BPC-157 anchor → total dose = 250 / (1/7) = 1750 mcg → draw = 1750/1000/35 = 0.05 mL
// Total mode 1750 mcg → draw = 1750/1000/35 = 0.05 mL — same draw, same breakdown

const GLOW = [
  { name: "GHK-Cu",  amount_mg: 50, is_anchor: false },
  { name: "TB-500",  amount_mg: 10, is_anchor: false },
  { name: "BPC-157", amount_mg: 10, is_anchor: true  },
];

describe("GLOW anchor mode — 250 mcg BPC-157", () => {
  const r = calculateBlend(GLOW, 2, 250, "anchor");

  it("returns a result", () => expect(r).not.toBeNull());
  it("concentration = 35 mg/mL", () => expect(r!.concentrationMgPerMl).toBe(35));
  it("draw volume ≈ 0.05 mL", () => expect(r!.drawVolumeMl).toBeCloseTo(0.05, 6));
  it("doses per vial = 40", () => expect(r!.dosesPerVial).toBe(40));
  it("GHK-Cu component = 1250 mcg", () => {
    const ghk = r!.componentBreakdown.find((c) => c.name === "GHK-Cu");
    expect(ghk!.dose_mcg).toBe(1250);
  });
  it("TB-500 component = 250 mcg", () => {
    const tb = r!.componentBreakdown.find((c) => c.name === "TB-500");
    expect(tb!.dose_mcg).toBe(250);
  });
  it("BPC-157 component = 250 mcg", () => {
    const bpc = r!.componentBreakdown.find((c) => c.name === "BPC-157");
    expect(bpc!.dose_mcg).toBe(250);
  });
  it("BPC-157 is_anchor = true", () => {
    const bpc = r!.componentBreakdown.find((c) => c.name === "BPC-157");
    expect(bpc!.is_anchor).toBe(true);
  });
});

describe("GLOW total mode — 1750 mcg (equivalent to 250 mcg BPC-157 anchor)", () => {
  const r = calculateBlend(GLOW, 2, 1750, "total");

  it("returns a result", () => expect(r).not.toBeNull());
  it("draw volume ≈ 0.05 mL", () => expect(r!.drawVolumeMl).toBeCloseTo(0.05, 6));
  it("GHK-Cu component = 1250 mcg", () => {
    const ghk = r!.componentBreakdown.find((c) => c.name === "GHK-Cu");
    expect(ghk!.dose_mcg).toBe(1250);
  });
  it("TB-500 component = 250 mcg", () => {
    const tb = r!.componentBreakdown.find((c) => c.name === "TB-500");
    expect(tb!.dose_mcg).toBe(250);
  });
  it("BPC-157 component = 250 mcg", () => {
    const bpc = r!.componentBreakdown.find((c) => c.name === "BPC-157");
    expect(bpc!.dose_mcg).toBe(250);
  });
});

describe("GLOW anchor vs total produce identical breakdowns", () => {
  const anchor = calculateBlend(GLOW, 2, 250, "anchor");
  const total  = calculateBlend(GLOW, 2, 1750, "total");

  it("both non-null", () => { expect(anchor).not.toBeNull(); expect(total).not.toBeNull(); });
  it("draw volumes match", () =>
    expect(anchor!.drawVolumeMl).toBeCloseTo(total!.drawVolumeMl, 6));
  it("component breakdown matches per component", () => {
    for (const comp of anchor!.componentBreakdown) {
      const match = total!.componentBreakdown.find((c) => c.name === comp.name);
      expect(match).toBeDefined();
      expect(comp.dose_mcg).toBe(match!.dose_mcg);
    }
  });
});

describe("calculateBlend — user-overridden anchor (GHK-Cu as anchor instead of BPC-157)", () => {
  // Override: GHK-Cu becomes anchor, BPC-157 is not
  const GLOW_GHK_ANCHOR = GLOW.map((c) => ({ ...c, is_anchor: c.name === "GHK-Cu" }));
  // 250 mcg GHK-Cu anchor → fraction = 50/70 → total = 250 / (50/70) = 350 mcg
  // draw = 350/1000/35 = 0.01 mL
  const r = calculateBlend(GLOW_GHK_ANCHOR, 2, 250, "anchor");

  it("returns a result", () => expect(r).not.toBeNull());
  it("draw volume ≈ 0.01 mL", () => expect(r!.drawVolumeMl).toBeCloseTo(0.01, 6));
  it("GHK-Cu component = 250 mcg", () => {
    const ghk = r!.componentBreakdown.find((c) => c.name === "GHK-Cu");
    expect(ghk!.dose_mcg).toBe(250);
  });
  it("GHK-Cu is_anchor = true", () => {
    const ghk = r!.componentBreakdown.find((c) => c.name === "GHK-Cu");
    expect(ghk!.is_anchor).toBe(true);
  });
  it("BPC-157 is_anchor = false", () => {
    const bpc = r!.componentBreakdown.find((c) => c.name === "BPC-157");
    expect(bpc!.is_anchor).toBe(false);
  });
});
