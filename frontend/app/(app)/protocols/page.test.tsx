/**
 * Protocol form — anchor dropdown behaviour tests
 *
 * Verifies:
 *  1. Anchor dropdown is populated from the selected compound's blend_components
 *  2. Switching to a different blend refreshes the dropdown with the new blend's components
 *  3. Single-ingredient compounds hide the anchor dropdown entirely
 *  4. Anchor defaults to the compound's is_anchor component
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks — must be declared before static imports of the page
// ---------------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/icons", () => ({
  Bell:   () => <span data-testid="icon-bell" />,
  Pencil: () => <span data-testid="icon-pencil" />,
  Plus:   () => <span data-testid="icon-plus" />,
  Trash2: () => <span data-testid="icon-trash" />,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GLOW = {
  id: 1, name: "GLOW", is_blend: true,
  blend_components: [
    { id: 10, name: "GHK-Cu",  amount_mg: 50, is_anchor: false, position: 0, linked_compound_id: null },
    { id: 11, name: "TB-500",  amount_mg: 10, is_anchor: false, position: 1, linked_compound_id: null },
    { id: 12, name: "BPC-157", amount_mg: 10, is_anchor: true,  position: 2, linked_compound_id: null },
  ],
  concentration_mg_per_ml: null, vial_size_mg: null, bac_water_ml: 2,
  notes: null, archived: false, preset_vial_sizes: null,
  default_syringe_type: null, default_syringe_ml: null,
  aliases: null, reference_url: null, reference_notes: null,
  molecular_weight: null, half_life_hours: null,
  typical_dose_mcg_min: null, typical_dose_mcg_max: null,
  user_id: 1, created_at: "2026-01-01T00:00:00",
};

const STACK2 = {
  id: 2, name: "Stack2", is_blend: true,
  blend_components: [
    { id: 20, name: "Peptide-A", amount_mg: 5, is_anchor: true,  position: 0, linked_compound_id: null },
    { id: 21, name: "Peptide-B", amount_mg: 5, is_anchor: false, position: 1, linked_compound_id: null },
  ],
  concentration_mg_per_ml: null, vial_size_mg: null, bac_water_ml: null,
  notes: null, archived: false, preset_vial_sizes: null,
  default_syringe_type: null, default_syringe_ml: null,
  aliases: null, reference_url: null, reference_notes: null,
  molecular_weight: null, half_life_hours: null,
  typical_dose_mcg_min: null, typical_dose_mcg_max: null,
  user_id: 1, created_at: "2026-01-01T00:00:00",
};

const SINGLE = {
  id: 3, name: "BPC-157 Solo", is_blend: false,
  blend_components: [],
  concentration_mg_per_ml: 5, vial_size_mg: 5, bac_water_ml: 1,
  notes: null, archived: false, preset_vial_sizes: null,
  default_syringe_type: null, default_syringe_ml: null,
  aliases: null, reference_url: null, reference_notes: null,
  molecular_weight: null, half_life_hours: null,
  typical_dose_mcg_min: null, typical_dose_mcg_max: null,
  user_id: 1, created_at: "2026-01-01T00:00:00",
};

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (url.includes("/api/protocols")) {
      return { ok: true, json: async () => [] };
    }
    if (url.includes("/api/compounds")) {
      return { ok: true, json: async () => [GLOW, STACK2, SINGLE] };
    }
    return { ok: true, json: async () => [] };
  }),
}));

// Static import AFTER mocks are declared
import ProtocolsPage from "./page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

afterEach(() => { cleanup(); });

async function renderAndOpenAdd() {
  await act(async () => { render(<ProtocolsPage />); });
  // Wait for the async data load (apiFetch resolves next tick)
  await act(async () => {});
  const addBtn = screen.getByRole("button", { name: /\badd\b/i });
  await act(async () => { fireEvent.click(addBtn); });
}

async function pickCompound(compoundValue: string) {
  const sel = screen.getByTestId("compound-select");
  await act(async () => { fireEvent.change(sel, { target: { value: compoundValue } }); });
}

function getAnchorSelect(): HTMLSelectElement {
  return screen.getByTestId("anchor-component-select") as HTMLSelectElement;
}

async function switchToAnchorMode() {
  const btn = screen.getByRole("button", { name: /by anchor component/i });
  await act(async () => { fireEvent.click(btn); });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Protocol form — anchor dropdown", () => {
  it("no anchor dropdown when no compound is selected", async () => {
    await renderAndOpenAdd();
    expect(screen.queryByLabelText(/anchor component/i)).toBeNull();
  });

  it("blend compound + anchor mode shows all 3 components in the dropdown", async () => {
    await renderAndOpenAdd();
    await pickCompound("1"); // GLOW
    await switchToAnchorMode();

    const anchorSel = getAnchorSelect();
    const options = Array.from(anchorSel.options).map((o) => o.text);
    expect(options.some((t) => t.includes("GHK-Cu"))).toBe(true);
    expect(options.some((t) => t.includes("TB-500"))).toBe(true);
    expect(options.some((t) => t.includes("BPC-157"))).toBe(true);
  });

  it("anchor defaults to the compound's is_anchor component (BPC-157, id=12)", async () => {
    await renderAndOpenAdd();
    await pickCompound("1"); // GLOW
    await switchToAnchorMode();

    expect(getAnchorSelect().value).toBe("12");
  });

  it("switching compound refreshes anchor options to the new blend's components", async () => {
    await renderAndOpenAdd();

    // Start with GLOW
    await pickCompound("1");
    await switchToAnchorMode();
    expect(screen.getByText(/GHK-Cu \(50 mg\)/)).toBeDefined();

    // Switch to Stack2 — mode resets to total, then re-enable anchor
    await pickCompound("2");
    await switchToAnchorMode();

    const opts = Array.from(getAnchorSelect().options).map((o) => o.text);
    expect(opts.some((t) => t.includes("Peptide-A"))).toBe(true);
    expect(opts.some((t) => t.includes("Peptide-B"))).toBe(true);
    expect(opts.some((t) => t.includes("GHK-Cu"))).toBe(false);
    expect(opts.some((t) => t.includes("TB-500"))).toBe(false);
  });

  it("single-ingredient compound hides dose mode toggle and anchor dropdown", async () => {
    await renderAndOpenAdd();
    await pickCompound("3"); // BPC-157 Solo

    expect(screen.queryByRole("button", { name: /by anchor component/i })).toBeNull();
    expect(screen.queryByTestId("anchor-component-select")).toBeNull();
  });
});
