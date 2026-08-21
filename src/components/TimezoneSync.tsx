"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the stored timezone matching the device's.
 *
 * The server decides which calendar day an entry belongs to, so it needs to
 * know where the user is. Detected rather than asked: nobody wants a timezone
 * dropdown during signup, and it has to follow them if they move or travel.
 * Only writes when the value actually changed.
 */
export default function TimezoneSync({ current }: { current: string }) {
  const router = useRouter();

  useEffect(() => {
    let detected: string | undefined;
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!detected || detected === current) return;

    void fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: detected }),
    })
      .then((res) => {
        // Dates on screen were rendered against the old zone.
        if (res.ok) router.refresh();
      })
      .catch(() => {
        // Offline. It will correct itself on a later visit.
      });
  }, [current, router]);

  return null;
}
