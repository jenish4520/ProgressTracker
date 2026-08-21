"use client";

import { useEffect } from "react";

/** Registers the service worker that makes the app installable and offline-capable. */
export default function ServiceWorkerBridge() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // dev HMR and SW caching fight

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed", err);
      });
    };
    // Registering after load keeps it off the critical path.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
