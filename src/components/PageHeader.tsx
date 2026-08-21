import type { ReactNode } from "react";

export default function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
