"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onDetected: (code: string) => void;
  onCancel: () => void;
}

/** Minimal shape of the native Barcode Detection API. */
interface DetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): DetectorLike;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

/**
 * Barcode scanner over the rear camera.
 *
 * Prefers the browser's native BarcodeDetector, which is hardware-accelerated
 * and costs nothing to ship. ZXing is loaded lazily only when the native API is
 * missing (notably iOS Safari), so most users never download it at all.
 */
export default function BarcodeScanner({ onDetected, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let zxingControls: { stop: () => void } | null = null;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot use the camera. Enter the food by hand instead.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera access was denied. Allow it in your browser settings, or enter the food by hand."
            : "Could not open the camera.",
        );
        return;
      }

      const video = videoRef.current;
      if (!video || stopped) return;
      video.srcObject = stream;
      // iOS refuses to play an inline video without these attributes.
      video.setAttribute("playsinline", "true");
      await video.play().catch(() => undefined);
      setReady(true);

      if (window.BarcodeDetector) {
        const detector = new window.BarcodeDetector({ formats: FORMATS });
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const hits = await detector.detect(videoRef.current);
            const code = hits.find((h) => /^\d{6,14}$/.test(h.rawValue))?.rawValue;
            if (code) {
              stopped = true;
              onDetected(code);
              return;
            }
          } catch {
            // A transient decode failure is normal between frames.
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return;
      }

      // Fallback for browsers without the native API.
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        zxingControls = await reader.decodeFromVideoElement(video, (result) => {
          const text = result?.getText();
          if (text && /^\d{6,14}$/.test(text) && !stopped) {
            stopped = true;
            onDetected(text);
          }
        });
      } catch {
        setError("Barcode scanning is not supported here. Try searching by name instead.");
      }
    }

    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      zxingControls?.stop();
      // Releasing every track is what actually turns the camera light off.
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl" style={{ background: "#000", aspectRatio: "4 / 3" }}>
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        {ready && !error && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-lg"
            style={{ border: "2px solid rgba(255,255,255,0.85)", boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }}
          />
        )}
      </div>

      <p className="mt-3 text-center text-sm" style={{ color: error ? "var(--status-critical)" : "var(--text-secondary)" }}>
        {error ?? "Point the camera at the barcode on the packet."}
      </p>

      <button className="btn btn-secondary mt-3 w-full" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
