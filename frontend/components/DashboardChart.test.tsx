import { describe, expect, it, vi, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import DashboardChart from "./DashboardChart";
import { TimelinePoint } from "@/lib/types";
import { HouseholdUser } from "@/lib/types";

// Recharts uses ResizeObserver for ResponsiveContainer.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Give the container a size so Recharts renders bars.
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    value: () => ({ width: 400, height: 200, top: 0, left: 0, right: 400, bottom: 200 }),
    configurable: true,
  });
  // Suppress recharts "width/height" warnings in test output.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => { cleanup(); });

// ---------------------------------------------------------------------------
// Fixtures — 2 users, 3 compounds, 7 days
// ---------------------------------------------------------------------------

const HOUSEHOLD_USERS: HouseholdUser[] = [
  { id: 1, name: "Yanie", role: "admin" },
  { id: 2, name: "Partner", role: "member" },
];

function makePoint(
  date: string,
  userId: number,
  userName: string,
  compoundId: number,
  compoundName: string,
  mcg: number,
): TimelinePoint {
  return { date, user_id: userId, user_name: userName, compound_id: compoundId, compound_name: compoundName, total_mcg: mcg, count: 1 };
}

const TIMELINE: TimelinePoint[] = [
  // Day 1 — both users inject
  makePoint("2026-04-16", 1, "Yanie", 1, "BPC-157", 500),
  makePoint("2026-04-16", 1, "Yanie", 2, "TB-500", 250),
  makePoint("2026-04-16", 2, "Partner", 1, "BPC-157", 500),
  // Day 2 — only Yanie
  makePoint("2026-04-17", 1, "Yanie", 1, "BPC-157", 500),
  makePoint("2026-04-17", 1, "Yanie", 3, "GHK-Cu", 1000),
  // Day 3 — only Partner
  makePoint("2026-04-18", 2, "Partner", 2, "TB-500", 250),
  // Day 4-7 — alternating
  makePoint("2026-04-19", 1, "Yanie", 1, "BPC-157", 500),
  makePoint("2026-04-20", 2, "Partner", 1, "BPC-157", 500),
  makePoint("2026-04-21", 1, "Yanie", 3, "GHK-Cu", 1000),
  makePoint("2026-04-22", 2, "Partner", 3, "GHK-Cu", 1000),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DashboardChart — empty state", () => {
  it("renders empty message when no data", () => {
    const { getByText } = render(
      <DashboardChart data={[]} householdUsers={HOUSEHOLD_USERS} />
    );
    expect(getByText(/no injections in the last 30 days/i)).toBeTruthy();
  });
});

describe("DashboardChart — By compound mode", () => {
  it("renders without crashing", () => {
    const { container } = render(
      <DashboardChart data={TIMELINE} householdUsers={HOUSEHOLD_USERS} />
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("shows the mode toggle with three options", () => {
    const { getByText } = render(
      <DashboardChart data={TIMELINE} householdUsers={HOUSEHOLD_USERS} />
    );
    expect(getByText("By compound")).toBeTruthy();
    expect(getByText("By person")).toBeTruthy();
    expect(getByText("Grouped")).toBeTruthy();
  });

  it("shows compound names in legend", () => {
    const { getByText } = render(
      <DashboardChart data={TIMELINE} householdUsers={HOUSEHOLD_USERS} />
    );
    expect(getByText("BPC-157")).toBeTruthy();
    expect(getByText("TB-500")).toBeTruthy();
    expect(getByText("GHK-Cu")).toBeTruthy();
  });
});

describe("DashboardChart — By person mode", () => {
  it("renders without crashing", () => {
    const { container, getByText } = render(
      <DashboardChart data={TIMELINE} householdUsers={HOUSEHOLD_USERS} />
    );
    getByText("By person").click();
    expect(container.firstChild).toBeTruthy();
  });

  it("shows user names in legend after switching to By person", () => {
    const { getByText } = render(
      <DashboardChart data={TIMELINE} householdUsers={HOUSEHOLD_USERS} />
    );
    getByText("By person").click();
    expect(getByText("Yanie")).toBeTruthy();
    expect(getByText("Partner")).toBeTruthy();
  });
});

describe("DashboardChart — Grouped mode", () => {
  it("renders without crashing", () => {
    const { container, getByText } = render(
      <DashboardChart data={TIMELINE} householdUsers={HOUSEHOLD_USERS} />
    );
    getByText("Grouped").click();
    expect(container.firstChild).toBeTruthy();
  });

  it("shows compound names in legend in Grouped mode", () => {
    const { getByText } = render(
      <DashboardChart data={TIMELINE} householdUsers={HOUSEHOLD_USERS} />
    );
    getByText("Grouped").click();
    expect(getByText("BPC-157")).toBeTruthy();
  });

  it("shows caption explaining bars represent different users", () => {
    const { getByText } = render(
      <DashboardChart data={TIMELINE} householdUsers={HOUSEHOLD_USERS} />
    );
    getByText("Grouped").click();
    expect(getByText(/each day shows one bar per active user/i)).toBeTruthy();
  });
});
