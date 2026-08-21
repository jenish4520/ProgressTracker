"use client";

import { useMemo, useState } from "react";
import type { TrendPoint } from "@/lib/trend";
import type { UnitSystem } from "@/db/schema";
import { displayWeight, weightUnit } from "@/lib/units";
import { formatDayLabel, type IsoDate } from "@/lib/dates";
import { linePath, niceScale, ticks, xAt } from "./chart-utils";

const W = 360;
const H = 190;
const PAD = { top: 12, right: 12, bottom: 24, left: 38 };

interface Props {
  points: TrendPoint[];
  targetKg?: number | null;
  unitSystem: UnitSystem;
  /** The server's idea of "today", so SSR and hydration label days alike. */
  todayRef: IsoDate;
}

/**
 * Weight over time: the smoothed trend as the primary line, raw weigh-ins as
 * recessive dots behind it.
 *
 * The trend leads deliberately — the raw scale readings are the noise the user
 * is trying to see past, so they are present for honesty but never the thing
 * the eye lands on first.
 */
export default function WeightTrendChart({ points, targetKg, unitSystem, todayRef }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const plot = useMemo(() => {
    const values = points.map((p) => p.trend);
    const actuals = points.map((p) => p.actual).filter((v): v is number => v !== null);
    const all = [...values, ...actuals, ...(targetKg != null ? [targetKg] : [])];
    const scale = niceScale(all, PAD.top, H - PAD.bottom);

    const coords = points.map((p, i) => ({
      x: xAt(i, points.length, PAD.left, W - PAD.right),
      y: scale.y(p.trend),
      actualY: p.actual !== null ? scale.y(p.actual) : null,
      point: p,
    }));
    return { scale, coords };
  }, [points, targetKg]);

  if (points.length < 2) {
    return (
      <div className="flex h-[190px] items-center justify-center px-6 text-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Log your weight on two different days and your trend line appears here.
        </p>
      </div>
    );
  }

  const { scale, coords } = plot;
  const active = hover !== null ? coords[hover] : null;
  const unit = weightUnit(unitSystem);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto", touchAction: "pan-y" }}
        role="img"
        aria-label={`Body weight trend over ${points.length} days`}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const ratio = (px - PAD.left) / (W - PAD.left - PAD.right);
          const idx = Math.round(ratio * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, idx)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {/* Recessive gridlines and tick labels. */}
        {ticks(scale, 4).map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={scale.y(t)}
              y2={scale.y(t)}
              stroke="var(--grid)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PAD.left - 6}
              y={scale.y(t) + 3.5}
              textAnchor="end"
              fontSize={9}
              className="tnum"
              fill="var(--text-muted)"
            >
              {displayWeight(t, unitSystem, 0)}
            </text>
          </g>
        ))}

        {/* Goal weight as an annotation, not a series. */}
        {targetKg != null && targetKg >= scale.min && targetKg <= scale.max && (
          <>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={scale.y(targetKg)}
              y2={scale.y(targetKg)}
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            <text x={W - PAD.right} y={scale.y(targetKg) - 5} textAnchor="end" fontSize={9} fill="var(--text-muted)">
              goal
            </text>
          </>
        )}

        {/* Raw weigh-ins sit behind the trend. */}
        {coords.map((c, i) =>
          c.actualY !== null ? (
            <circle key={i} cx={c.x} cy={c.actualY} r={2} fill="var(--axis)" />
          ) : null,
        )}

        <path
          d={linePath(coords)}
          fill="none"
          stroke="var(--series-1)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {active && (
          <g pointerEvents="none">
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--axis)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/* 2px surface ring keeps the marker legible over the line. */}
            <circle cx={active.x} cy={active.y} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}

        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          stroke="var(--axis)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <text x={PAD.left} y={H - 8} fontSize={9} fill="var(--text-muted)">
          {formatDayLabel(points[0].date, todayRef)}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={9} fill="var(--text-muted)">
          {formatDayLabel(points[points.length - 1].date, todayRef)}
        </text>
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
        {/* Two series, so identity is never carried by colour alone. */}
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--series-1)" }} />
            Trend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--axis)" }} />
            Weigh-in
          </span>
        </div>
        <p className="tnum text-xs" style={{ color: "var(--text-secondary)" }}>
          {active ? (
            <>
              {formatDayLabel(active.point.date, todayRef)} · {displayWeight(active.point.trend, unitSystem)} {unit}
              {active.point.actual !== null && (
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}
                  (scale {displayWeight(active.point.actual, unitSystem)})
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>Touch the chart for a day</span>
          )}
        </p>
      </figcaption>
    </figure>
  );
}
