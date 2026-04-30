"use client";

import { useEffect, useRef, useState } from "react";
import { CompoundRead, HouseholdUser, ProtocolRead } from "@/lib/types";
import { getUserHexColor } from "@/lib/colors";
import { apiFetch } from "@/lib/api";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const DAY_PX = 14;       // pixels per day
const ROW_H = 44;        // px per protocol row
const HEADER_H = 48;     // month + week tick row combined height
const SIDEBAR_W = 0;     // compound sidebar is rendered above, not beside
const CANVAS_DAYS = 308; // 44 weeks total in scrollable area
const MIN_DRAG_PX = 4;   // below this threshold a pointer move = click

// ---------------------------------------------------------------------------
// Date helpers (no library)
// ---------------------------------------------------------------------------
function toDateStr(d: Date): string {
  // Use local date parts — toISOString() converts to UTC first, which shifts
  // the date for users in UTC+ timezones (midnight local = previous day UTC).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function weekLabel(d: Date): string {
  return String(d.getDate());
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  protocols: ProtocolRead[];
  compounds: CompoundRead[];
  householdUsers: HouseholdUser[];
  isAdmin: boolean;
  onProtocolUpdated: () => void;
  onCreateProtocol: (compoundId: number, startDate: string) => void;
  onEditProtocol: (p: ProtocolRead) => void;
}

// ---------------------------------------------------------------------------
// Drag state
// ---------------------------------------------------------------------------
interface DragState {
  protocolId: number;
  type: "move" | "resize";
  startClientX: number;
  originalStartDate: string | null;
  originalCycleLen: number | null;
  originalEndDate: string | null;
  currentDayDelta: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ProtocolCalendar({
  protocols,
  compounds,
  householdUsers,
  isAdmin,
  onProtocolUpdated,
  onCreateProtocol,
  onEditProtocol,
}: Props) {
  const today = startOfDay(new Date());

  // View start = 8 weeks before today, snapped to Monday
  const [viewStart, setViewStart] = useState<Date>(() => {
    const d = addDays(today, -56);
    const dow = d.getDay(); // 0=Sun
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    return addDays(d, mondayOffset);
  });

  const [drag, setDrag] = useState<DragState | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Map compound_id → its index in the non-archived compound list, which is the
  // same seed used by the chip palette so bars and chips share the same color.
  const compoundColorIndex = new Map(
    compounds.filter((c) => !c.archived).map((c, i) => [c.id, i])
  );

  // Scroll today into view on mount
  useEffect(() => {
    if (!canvasRef.current) return;
    const todayOffset = diffDays(today, viewStart) * DAY_PX;
    canvasRef.current.scrollLeft = Math.max(0, todayOffset - 120);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Pointer drag handlers
  // ---------------------------------------------------------------------------
  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const delta = e.clientX - drag.startClientX;
    const dayDelta = Math.round(delta / DAY_PX);
    setDrag((d) => d && { ...d, currentDayDelta: dayDelta });
  }

  async function handlePointerUp() {
    if (!drag) return;
    const { protocolId, type, currentDayDelta, originalStartDate, originalCycleLen, originalEndDate } = drag;
    setDrag(null);

    if (currentDayDelta === 0) return;

    const protocol = protocols.find((p) => p.id === protocolId);
    if (!protocol) return;

    setSaving(protocolId);
    try {
      const body: Record<string, unknown> = {};

      if (type === "move") {
        const base = originalStartDate ? parseDate(originalStartDate) : today;
        const newStart = addDays(base, currentDayDelta);
        body.schedule_start_date = toDateStr(newStart);
        if (originalEndDate) {
          body.cycle_end_date = toDateStr(addDays(parseDate(originalEndDate), currentDayDelta));
        }
      } else {
        // resize — cycle_end_date is the inclusive last day, so offset by newLen - 1
        const newLen = Math.max(1, (originalCycleLen ?? 56) + currentDayDelta);
        body.cycle_length_days = newLen;
        if (originalStartDate) {
          body.cycle_end_date = toDateStr(addDays(parseDate(originalStartDate), newLen - 1));
        }
      }

      await apiFetch(`/api/protocols/${protocolId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onProtocolUpdated();
    } finally {
      setSaving(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Compound drag-to-create
  // ---------------------------------------------------------------------------
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const compoundId = parseInt(e.dataTransfer.getData("compound_id") || "");
    if (!compoundId) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + (canvasRef.current?.scrollLeft ?? 0);
    const dayOffset = Math.round(x / DAY_PX);
    const startDate = toDateStr(addDays(viewStart, dayOffset));
    onCreateProtocol(compoundId, startDate);
  }

  // ---------------------------------------------------------------------------
  // Build header rows (months + week ticks)
  // ---------------------------------------------------------------------------
  const months: { label: string; left: number; width: number }[] = [];
  const weekTicks: { left: number; label: string }[] = [];

  let cur = new Date(viewStart);
  let lastMonth = -1;
  let monthStart = 0;
  let monthLabel = "";

  for (let d = 0; d < CANVAS_DAYS; d++) {
    const m = cur.getMonth();
    if (m !== lastMonth) {
      if (lastMonth !== -1) {
        months.push({ label: monthLabel, left: monthStart, width: d * DAY_PX - monthStart });
      }
      monthStart = d * DAY_PX;
      monthLabel = cur.toLocaleString("default", { month: "short", year: "numeric" });
      lastMonth = m;
    }
    // Week tick every Monday (day 1)
    if (cur.getDay() === 1) {
      weekTicks.push({ left: d * DAY_PX, label: weekLabel(cur) });
    }
    cur = addDays(cur, 1);
  }
  months.push({ label: monthLabel, left: monthStart, width: CANVAS_DAYS * DAY_PX - monthStart });

  const todayLeft = diffDays(today, viewStart) * DAY_PX;
  const canvasWidth = CANVAS_DAYS * DAY_PX;

  // ---------------------------------------------------------------------------
  // Render a single protocol bar
  // ---------------------------------------------------------------------------
  function renderBar(p: ProtocolRead) {
    const isSaving = saving === p.id;
    const isDragging = drag?.protocolId === p.id;
    const isHovered = hoveredId === p.id;
    const dayDelta = isDragging ? drag!.currentDayDelta : 0;
    const wasClicked = isDragging && Math.abs(drag!.currentDayDelta * DAY_PX) < MIN_DRAG_PX;

    const baseStart = p.schedule_start_date ? parseDate(p.schedule_start_date) : today;
    const displayStart = addDays(baseStart, drag?.type === "move" ? dayDelta : 0);
    const startLeft = diffDays(displayStart, viewStart) * DAY_PX;

    // Prefer cycle_length_days; fall back to cycle_end_date (inclusive last day → +1).
    // This handles protocols where only cycle_end_date was set via the form.
    const baseCycleLen: number | null =
      p.cycle_length_days != null
        ? p.cycle_length_days
        : p.cycle_end_date
          ? Math.max(1, diffDays(parseDate(p.cycle_end_date), baseStart) + 1)
          : null;

    const cycleLen = drag?.type === "resize" && isDragging
      ? Math.max(1, (baseCycleLen ?? 56) + dayDelta)
      : baseCycleLen;

    const isFixed = cycleLen != null;
    const barWidth = isFixed ? cycleLen! * DAY_PX : canvasWidth - Math.max(0, startLeft);
    const clampedLeft = Math.max(0, startLeft);
    const clampedWidth = isFixed
      ? Math.max(DAY_PX * 2, barWidth - Math.max(0, -startLeft))
      : barWidth - Math.max(0, -startLeft);

    // userHex = who is taking it → bar fill + outline
    // compoundHex = what compound it is → left border accent + text
    const userHex = getUserHexColor(p.assignee_user_id);
    const compoundHex = getUserHexColor(compoundColorIndex.get(p.compound_id) ?? 0);
    const weekCount = cycleLen ? Math.round(cycleLen / 7) : null;
    const showWeekBadge = weekCount != null && clampedWidth > 72;

    const bgOpacity = isHovered ? 0.20 : 0.13;
    const outlineOpacity = isHovered ? 0.55 : 0.35;
    const barStyle: React.CSSProperties = {
      left: clampedLeft,
      width: clampedWidth,
      height: ROW_H - 16,
      backgroundColor: hexToRgba(userHex, bgOpacity),
      border: `1px solid ${hexToRgba(userHex, outlineOpacity)}`,
      borderLeft: `4px solid ${compoundHex}`,
      boxShadow: isHovered ? `0 0 8px ${hexToRgba(userHex, 0.5)}` : undefined,
      cursor: isDragging && drag?.type === "move" ? "grabbing" : "grab",
      zIndex: isDragging ? 20 : 1,
    };

    return (
      <div
        key={p.id}
        className="relative"
        style={{ height: ROW_H }}
      >
        {/* Bar */}
        <div
          className={`absolute top-2 flex items-center gap-1 select-none rounded-md transition-[box-shadow,background-color,border-color,opacity] duration-150 ${isSaving ? "opacity-40" : ""} ${isDragging && !wasClicked ? "opacity-75" : ""}`}
          style={barStyle}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).dataset.resize) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag({
              protocolId: p.id,
              type: "move",
              startClientX: e.clientX,
              originalStartDate: p.schedule_start_date,
              originalCycleLen: p.cycle_length_days,
              originalEndDate: p.cycle_end_date,
              currentDayDelta: 0,
            });
          }}
          onMouseEnter={() => setHoveredId(p.id)}
          onMouseLeave={() => setHoveredId(null)}
          onClick={() => {
            if (drag === null || Math.abs((drag?.currentDayDelta ?? 0)) === 0) {
              onEditProtocol(p);
            }
          }}
        >
          {/* Compound name + dose */}
          <span
            className="pointer-events-none min-w-0 truncate pl-2 text-xs font-semibold"
            style={{
              color: compoundHex,
              maxWidth: clampedWidth - (showWeekBadge ? 48 : isFixed ? 16 : 24),
            }}
          >
            {p.compound_name}
            {p.dose_mcg != null && (
              <span
                className="font-normal"
                style={{ color: hexToRgba(compoundHex, 0.65) }}
              >
                {` · ${p.dose_mcg.toLocaleString()} mcg`}
              </span>
            )}
          </span>

          {/* Week count badge */}
          {showWeekBadge && (
            <span
              className="pointer-events-none ml-auto mr-1 shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none"
              style={{
                backgroundColor: hexToRgba(compoundHex, 0.18),
                color: compoundHex,
              }}
            >
              {weekCount}w
            </span>
          )}

          {/* Open-ended arrow */}
          {!isFixed && (
            <span
              className="ml-auto mr-1.5 shrink-0 text-xs pointer-events-none"
              style={{ color: hexToRgba(compoundHex, 0.7) }}
            >
              →
            </span>
          )}

          {/* Resize handle — fixed cycle only */}
          {isFixed && (
            <div
              data-resize="true"
              className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center"
              style={{ borderRadius: "0 5px 5px 0" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({
                  protocolId: p.id,
                  type: "resize",
                  startClientX: e.clientX,
                  originalStartDate: p.schedule_start_date,
                  originalCycleLen: p.cycle_length_days,
                  originalEndDate: p.cycle_end_date,
                  currentDayDelta: 0,
                });
              }}
            >
              <span
                className="text-[10px] pointer-events-none select-none"
                style={{ color: hexToRgba(compoundHex, 0.5) }}
              >
                ⋮
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Compound palette (drag source)
  // ---------------------------------------------------------------------------
  function CompoundPalette() {
    return (
      <div className="mb-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Drag to calendar to create protocol
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {compounds.filter((c) => !c.archived).map((c, i) => (
            <div
              key={c.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("compound_id", String(c.id))}
              className="shrink-0 cursor-grab rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm active:cursor-grabbing dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              style={{ borderLeftWidth: 3, borderLeftColor: getUserHexColor(i) }}
              title={`Drag to create a ${c.name} protocol`}
            >
              {c.name}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div>
      <CompoundPalette />

      {/* Navigation */}
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setViewStart((v) => addDays(v, -28))}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          ← 4 wk
        </button>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {viewStart.toLocaleString("default", { month: "short", year: "numeric" })}
          {" – "}
          {addDays(viewStart, CANVAS_DAYS - 1).toLocaleString("default", { month: "short", year: "numeric" })}
        </p>
        <button
          onClick={() => setViewStart((v) => addDays(v, 28))}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          4 wk →
        </button>
      </div>

      {/* Scrollable canvas */}
      <div
        ref={canvasRef}
        className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
        style={{ cursor: drag ? "grabbing" : "auto" }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div style={{ width: canvasWidth, minWidth: canvasWidth, position: "relative" }}>

          {/* Header: months */}
          <div className="sticky top-0 z-10 border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900" style={{ height: HEADER_H }}>
            {/* Month row */}
            <div className="relative" style={{ height: 24 }}>
              {months.map((m) => (
                <div
                  key={m.label + m.left}
                  className="absolute top-0 flex items-center border-r border-gray-100 px-2 dark:border-gray-800"
                  style={{ left: m.left, width: m.width, height: 24 }}
                >
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
                    {m.label}
                  </span>
                </div>
              ))}
            </div>
            {/* Week tick row */}
            <div className="relative" style={{ height: 24 }}>
              {weekTicks.map((t) => (
                <div
                  key={t.left}
                  className="absolute top-0 border-l border-gray-100 pl-1 dark:border-gray-800"
                  style={{ left: t.left, height: 24 }}
                >
                  <span className="text-[10px] text-gray-400 dark:text-gray-600">{t.label}</span>
                </div>
              ))}
              {/* Today marker in header */}
              {todayLeft >= 0 && todayLeft < canvasWidth && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-400"
                  style={{ left: todayLeft }}
                />
              )}
            </div>
          </div>

          {/* Protocol rows */}
          <div className="relative">
            {/* Today vertical line behind bars */}
            {todayLeft >= 0 && todayLeft < canvasWidth && (
              <div
                className="absolute top-0 bottom-0 z-0 w-0.5 bg-blue-100 dark:bg-blue-900/40"
                style={{ left: todayLeft, pointerEvents: "none" }}
              />
            )}

            {protocols.length === 0 && (
              <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                No protocols to show.
              </div>
            )}

            {protocols.map((p) => (
              <div
                key={p.id}
                className="relative border-b border-gray-50 dark:border-gray-800/60"
                style={{ height: ROW_H }}
              >
                {/* Assignee label pinned left — rendered outside scroll with sticky won't work in overflow-x,
                    so we place it as an absolutely-left non-overflow pill that floats above */}
                {renderBar(p)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      {protocols.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-3">
          {Array.from(new Set(protocols.map((p) => p.assignee_user_id))).map((uid) => {
            const name = protocols.find((p) => p.assignee_user_id === uid)?.assignee_name ?? "";
            return (
              <span key={uid} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: getUserHexColor(uid) }}
                />
                {name}
              </span>
            );
          })}
          <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-blue-200 dark:bg-blue-800" />
            Today
          </span>
        </div>
      )}
    </div>
  );
}
