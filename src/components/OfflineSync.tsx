"use client";

import { useCallback, useEffect, useState } from "react";
import { flushQueue, pendingCount } from "@/lib/offline";

/**
 * Background reconciliation plus an honest connection indicator.
 *
 * The pill only appears when there is something to say. A permanently visible
 * "online" badge is noise; a "3 workouts waiting" badge is information.
 */
export default function OfflineSync() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPending(await pendingCount());
    } catch {
      // IndexedDB can be unavailable (private mode, storage disabled). The app
      // still works online; there is simply no queue.
    }
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    if ((await pendingCount()) === 0) return;

    setSyncing(true);
    try {
      await flushQueue();
      await refresh();
      // Server-rendered totals are now stale.
      window.dispatchEvent(new CustomEvent("tracker:synced"));
    } catch {
      // Stays queued for the next attempt.
    } finally {
      setSyncing(false);
    }
  }, [refresh, syncing]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh();
    void sync();

    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    const onQueued = () => void refresh();

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("tracker:queued", onQueued);

    // Catches the case where a sync failed and the connection never "changed".
    const timer = setInterval(() => void sync(), 60_000);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("tracker:queued", onQueued);
      clearInterval(timer);
    };
  }, [refresh, sync]);

  if (online && pending === 0) return null;

  const message = !online
    ? pending > 0
      ? `Offline · ${pending} to sync`
      : "Offline · logging still works"
    : syncing
      ? "Syncing…"
      : `${pending} waiting to sync`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}
    >
      <span
        className="rounded-full px-3 py-1.5 text-xs font-medium shadow-sm"
        style={{
          background: online ? "var(--surface-raised)" : "var(--status-serious)",
          color: online ? "var(--text-secondary)" : "#1a1a19",
          border: "1px solid var(--border)",
        }}
      >
        {message}
      </span>
    </div>
  );
}
