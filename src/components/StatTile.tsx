import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Optional trend cue. Always paired with text, never colour alone. */
  tone?: "neutral" | "good" | "warning";
}

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  neutral: "var(--text-secondary)",
  good: "var(--success-text)",
  warning: "var(--status-serious)",
};

/** A single headline number. Not every figure deserves a chart. */
export default function StatTile({ label, value, sub, tone = "neutral" }: Props) {
  return (
    <div className="card p-3">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-tight">{value}</p>
      {sub ? (
        <p className="mt-0.5 text-xs" style={{ color: TONE[tone] }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}
