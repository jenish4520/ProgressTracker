"use client";

import { useMemo, useState } from "react";
import { formatDayLabel, type IsoDate } from "@/lib/dates";
import { zeroScale, ticks, xAt, barPath } from "./chart-utils";

const W = 360;
const H = 170;
const PAD = { top: 12, right: 12, bottom: 24, left: 40 };

export interface DayBar {
  date: IsoDate;
  kcal: number;
}

interface Props {
  days: DayBar[];
  target?: number | null;
  label?: string;
  /** The server's idea of "today", so SSR and hydration label days alike. */
  todayRef: IsoDate;
}

/**
 * Daily intake as bars against the target.
 *
 * One series only, so the target is drawn as a reference line rather than
 * colouring bars red and green: over/under is read from position against the
 * line, which survives colourblindness and printing.
 */
export default function CalorieBars({ days, target, label = "kcal", todayRef }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const { scale, barW } = useMemo(() => {
    const values = [...days.map((d) => d.kcal), ...(target ? [target] : [])];
    const s = zeroScale(values, PAD.top, H - PAD.bottom);
    const available = W - PAD.left - PAD.right;
    // 2px surface gap between adjacent bars.
    const w = Math.max(3, Math.min(22, available / Math.max(days.length, 1) - 2));
    return { scale: s, barW: w };
  }, [days, target]);

  if (!days.length) {
    return (
      <div className="flex h-[170px] items-center justify-center px-6 text-center">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Nothing logged yet — your daily intake will chart here.
        </p>
      </div>
    );
  }

  const active = hover !== null ? days[hover] : null;
  const baseline = H - PAD.bottom;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label={`Daily ${label} for the last ${days.length} days`}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const ratio = (px - PAD.left) / (W - PAD.left - PAD.right);
          setHover(Math.max(0, Math.min(days.length - 1, Math.round(ratio * (days.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks(scale, 3).map((t) => (
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
            <text x={PAD.left - 6} y={scale.y(t) + 3.5} textAnchor="end" fontSize={9} className="tnum" fill="var(--text-muted)">
              {Math.round(t)}
            </text>
          </g>
        ))}

        {days.map((d, i) => {
          const x = xAt(i, days.length, PAD.left + barW / 2, W - PAD.right - barW / 2);
          const y = scale.y(d.kcal);
          return (
            // Rounded data-end, square where it meets the axis.
            <path
              key={d.date}
              d={barPath(x - barW / 2, y, barW, baseline)}
              fill="var(--series-1)"
              opacity={hover === null || hover === i ? 1 : 0.45}
            />
          );
        })}

        {target ? (
          <>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={scale.y(target)}
              y2={scale.y(target)}
              stroke="var(--text-secondary)"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              vectorEffect="non-scaling-stroke"
            />
            <text x={PAD.left + 3} y={scale.y(target) - 4} fontSize={9} fill="var(--text-secondary)">
              target
            </text>
          </>
        ) : null}

        <line x1={PAD.left} x2={W - PAD.right} y1={baseline} y2={baseline} stroke="var(--axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <text x={PAD.left} y={H - 8} fontSize={9} fill="var(--text-muted)">
          {formatDayLabel(days[0].date, todayRef)}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={9} fill="var(--text-muted)">
          {formatDayLabel(days[days.length - 1].date, todayRef)}
        </text>
      </svg>

      <figcaption className="mt-2 px-1 text-xs tnum" style={{ color: "var(--text-secondary)" }}>
        {active ? (
          <>
            {formatDayLabel(active.date, todayRef)} · {Math.round(active.kcal).toLocaleString("en-GB")} {label}
            {target ? (
              <span style={{ color: "var(--text-muted)" }}>
                {" "}
                ({active.kcal >= target ? "+" : ""}
                {Math.round(active.kcal - target).toLocaleString("en-GB")} vs target)
              </span>
            ) : null}
          </>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>Touch a bar for the day&rsquo;s total</span>
        )}
      </figcaption>
    </figure>
  );
}
