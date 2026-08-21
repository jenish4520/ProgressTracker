interface Props {
  consumed: number;
  target: number;
  burned?: number;
}

const SIZE = 96;
const STROKE = 9;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * The day's intake as a single ring.
 *
 * A hero figure with one arc, not a chart: there is exactly one quantity here
 * and its relationship to one target. Overshoot is shown by the arc completing
 * and the status colour changing, always beside a written number.
 */
export default function CalorieRing({ consumed, target, burned = 0 }: Props) {
  const ratio = target > 0 ? consumed / target : 0;
  const clamped = Math.max(0, Math.min(1, ratio));
  const over = ratio > 1.02;

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--grid)" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={over ? "var(--status-serious)" : "var(--series-1)"}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - clamped)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum text-lg font-semibold leading-none">
          {target > 0 ? `${Math.round(ratio * 100)}%` : "—"}
        </span>
        {burned > 0 && (
          <span className="tnum mt-0.5 text-[0.62rem]" style={{ color: "var(--text-muted)" }}>
            +{burned} burned
          </span>
        )}
      </div>
    </div>
  );
}
