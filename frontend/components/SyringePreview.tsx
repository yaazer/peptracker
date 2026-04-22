"use client";

import { getTicks, type SyringeType } from "@/lib/reconstitution";

interface Props {
  syringeType: SyringeType;
  syringeMl: number;
  drawVolumeMl: number;
  totalMarkings: number;
  markingValue: number;
  markingUnit: "units" | "mL";
  warnings: string[];
}

// SVG layout constants
const SVG_W = 160;
const SVG_H = 300;
const BARREL_X = 52;        // left edge of barrel
const BARREL_W = 44;        // barrel inner width
const BARREL_TOP = 20;      // y of 0-mark (plunger end = top of scale)
const BARREL_BOT = 260;     // y of max-mark (needle end = bottom of scale)
const BARREL_H = BARREL_BOT - BARREL_TOP;
const NEEDLE_X = BARREL_X + BARREL_W / 2;

// position=0 → needle end (bottom), position=1 → plunger end (top)
function posToY(position: number): number {
  return BARREL_BOT - position * BARREL_H;
}

export default function SyringePreview({
  syringeType,
  syringeMl,
  drawVolumeMl,
  totalMarkings,
  markingValue,
  markingUnit,
  warnings,
}: Props) {
  const ticks = getTicks(syringeType, syringeMl);
  const drawFraction = Math.min(drawVolumeMl / syringeMl, 1);
  const drawY = posToY(drawFraction);
  const hasWarning = warnings.length > 0;

  // Format marking value for display
  const markingDisplay =
    markingUnit === "mL"
      ? markingValue.toFixed(2)
      : markingValue % 1 === 0
      ? String(Math.round(markingValue))
      : markingValue.toFixed(1);

  const unitWord = markingUnit === "units" ? "units" : "mL";

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={SVG_W}
        height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="overflow-visible"
        aria-label="Syringe diagram"
      >
        {/* ── Needle ── */}
        <line
          x1={NEEDLE_X}
          y1={BARREL_BOT}
          x2={NEEDLE_X}
          y2={BARREL_BOT + 28}
          stroke="#94a3b8"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* Needle tip bevel */}
        <line
          x1={NEEDLE_X}
          y1={BARREL_BOT + 28}
          x2={NEEDLE_X + 5}
          y2={BARREL_BOT + 36}
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeLinecap="round"
        />

        {/* ── Barrel background ── */}
        <rect
          x={BARREL_X}
          y={BARREL_TOP}
          width={BARREL_W}
          height={BARREL_H}
          rx={6}
          fill="white"
          stroke="#cbd5e1"
          strokeWidth={1.5}
          className="dark:fill-gray-800 dark:stroke-gray-600"
        />

        {/* ── Fluid fill (0 at bottom = needle end, fill upward) ── */}
        {drawFraction > 0 && (
          <rect
            x={BARREL_X + 1}
            y={hasWarning ? BARREL_TOP + 1 : drawY}
            width={BARREL_W - 2}
            height={hasWarning ? BARREL_H - 2 : BARREL_BOT - drawY}
            rx={hasWarning ? 5 : 0}
            fill={hasWarning ? "#fca5a5" : "#bfdbfe"}
            className={hasWarning ? "dark:fill-red-900" : "dark:fill-blue-900"}
          />
        )}

        {/* ── Tick marks ── */}
        {ticks.map((tick, i) => {
          const y = posToY(tick.position);
          const tickLen = tick.isMajor ? 12 : 6;
          const tickX = BARREL_X + BARREL_W; // right side of barrel
          return (
            <g key={i}>
              <line
                x1={tickX}
                y1={y}
                x2={tickX + tickLen}
                y2={y}
                stroke={tick.isMajor ? "#64748b" : "#94a3b8"}
                strokeWidth={tick.isMajor ? 1.5 : 1}
              />
              {tick.label && (
                <text
                  x={tickX + tickLen + 3}
                  y={y + 4}
                  fontSize={9}
                  fill="#64748b"
                  className="dark:fill-gray-400"
                >
                  {tick.label}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Draw mark (red line + label) ── */}
        {drawFraction > 0 && !hasWarning && (
          <g>
            <line
              x1={BARREL_X - 2}
              y1={drawY}
              x2={BARREL_X + BARREL_W + 2}
              y2={drawY}
              stroke="#ef4444"
              strokeWidth={2}
            />
            <text
              x={BARREL_X - 4}
              y={drawY + 4}
              fontSize={9}
              fill="#ef4444"
              textAnchor="end"
              fontWeight="600"
            >
              ▶
            </text>
          </g>
        )}

        {/* ── Plunger ── */}
        <rect
          x={BARREL_X - 4}
          y={BARREL_TOP - 16}
          width={BARREL_W + 8}
          height={18}
          rx={3}
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth={1.5}
          className="dark:fill-gray-700 dark:stroke-gray-500"
        />
        {/* Plunger rod */}
        <rect
          x={NEEDLE_X - 3}
          y={BARREL_TOP - 32}
          width={6}
          height={18}
          fill="#cbd5e1"
          className="dark:fill-gray-600"
        />
        {/* Plunger thumb flange */}
        <rect
          x={NEEDLE_X - 14}
          y={BARREL_TOP - 40}
          width={28}
          height={10}
          rx={2}
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth={1.5}
          className="dark:fill-gray-700 dark:stroke-gray-500"
        />
      </svg>

      {/* ── Caption ── */}
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {syringeMl} mL / {totalMarkings} {unitWord}
      </p>

      {/* ── Marking readout ── */}
      {drawFraction > 0 ? (
        <div className="text-center">
          <p className={`text-4xl font-bold tabular-nums ${hasWarning ? "text-red-500" : "text-blue-600 dark:text-blue-400"}`}>
            {hasWarning ? "—" : markingDisplay}
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {hasWarning ? "" : unitWord}
          </p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 tabular-nums">
            {hasWarning ? "" : `${drawVolumeMl < 0.001 ? "<0.001" : drawVolumeMl.toFixed(3)} mL`}
          </p>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-4xl font-bold text-gray-200 dark:text-gray-700">—</p>
          <p className="text-xs text-gray-300 dark:text-gray-600">enter values</p>
        </div>
      )}

      {/* ── Warnings ── */}
      {warnings.map((w, i) => (
        <p
          key={i}
          className="max-w-[180px] text-center text-xs font-medium text-amber-600 dark:text-amber-400"
        >
          {w}
        </p>
      ))}
    </div>
  );
}
