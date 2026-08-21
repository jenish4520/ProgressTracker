export const metadata = { title: "Offline · ProgressTracker" };

/** Served by the service worker when a navigation fails. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">You&rsquo;re offline</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        This page needs a connection. Any workout you log stays saved on your phone and syncs
        automatically once you have signal again.
      </p>
      <a href="/train" className="btn btn-primary mt-6">Go to training</a>
    </main>
  );
}
