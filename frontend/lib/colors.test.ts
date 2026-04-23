import { describe, expect, it } from "vitest";
import {
  USER_HEX_COLORS,
  USER_TAILWIND_COLORS,
  COMPOUND_HEX_COLORS,
  getUserHexColor,
  getUserTailwindColor,
  getCompoundHexColor,
} from "./colors";

describe("getUserHexColor", () => {
  it("returns the same color for the same userId", () => {
    expect(getUserHexColor(1)).toBe(getUserHexColor(1));
    expect(getUserHexColor(42)).toBe(getUserHexColor(42));
  });

  it("returns different colors for different userIds (within palette size)", () => {
    const colors = new Set(
      Array.from({ length: USER_HEX_COLORS.length }, (_, i) => getUserHexColor(i))
    );
    expect(colors.size).toBe(USER_HEX_COLORS.length);
  });

  it("wraps around the palette for large userIds", () => {
    expect(getUserHexColor(0)).toBe(getUserHexColor(USER_HEX_COLORS.length));
    expect(getUserHexColor(1)).toBe(getUserHexColor(USER_HEX_COLORS.length + 1));
  });

  it("returns a valid hex color string", () => {
    const hex = getUserHexColor(3);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("getUserTailwindColor", () => {
  it("returns the same Tailwind class for the same userId", () => {
    expect(getUserTailwindColor(5)).toBe(getUserTailwindColor(5));
  });

  it("wraps around at palette boundary", () => {
    expect(getUserTailwindColor(0)).toBe(getUserTailwindColor(USER_TAILWIND_COLORS.length));
  });

  it("hex and Tailwind arrays are the same length (same index = same conceptual color)", () => {
    expect(USER_HEX_COLORS.length).toBe(USER_TAILWIND_COLORS.length);
  });
});

describe("getCompoundHexColor", () => {
  it("returns the same color for the same index", () => {
    expect(getCompoundHexColor(0)).toBe(getCompoundHexColor(0));
  });

  it("wraps around the palette", () => {
    expect(getCompoundHexColor(0)).toBe(getCompoundHexColor(COMPOUND_HEX_COLORS.length));
  });

  it("returns a valid hex color string", () => {
    expect(getCompoundHexColor(1)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
