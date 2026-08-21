"use client";

import { useEffect, useState } from "react";

/**
 * Counts up from the last completed set.
 *
 * Counts up rather than down: rest targets vary by exercise and by how the set
 * felt, and a countdown that hits zero implies an instruction the app is in no
 * position to give.
 */
export default function RestTimer({ startedAt, onDismiss }: { startedAt: number; onDismiss: () => void }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}
      role="status"
      aria-live="off"
    >
      <div
        className="flex items-center gap-3 rounded-full px-4 py-2 shadow-lg"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--border-strong)" }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Rest
        </span>
        <span className="tnum text-lg font-semibold">
          {mins}:{String(secs).padStart(2, "0")}
        </span>
        <button onClick={onDismiss} aria-label="Dismiss rest timer" style={{ color: "var(--text-muted)" }}>
          ✕
        </button>
      </div>
    </div>
  );
}
