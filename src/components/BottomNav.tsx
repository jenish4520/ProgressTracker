"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Thumb-reachable primary navigation.
 *
 * Bottom-anchored because this is used one-handed, standing at a rack — the
 * top of a phone screen is the hardest place to reach.
 */
const TABS = [
  { href: "/", label: "Today", icon: "M3 11.5 12 4l9 7.5M6 10v9h12v-9" },
  { href: "/food", label: "Food", icon: "M5 3v8a3 3 0 0 0 6 0V3M8 11v10M16 3c-1.5 2-2 4-2 6s.5 3 2 3v9" },
  { href: "/train", label: "Train", icon: "M4 9v6M8 7v10M16 7v10M20 9v6M8 12h8" },
  { href: "/body", label: "Body", icon: "M4 18l5-6 4 3 7-8" },
  { href: "/settings", label: "More", icon: "M4 7h16M4 12h16M4 17h16" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in srgb, var(--surface) 92%, transparent)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="mx-auto flex max-w-lg list-none items-stretch justify-around p-0">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[0.68rem] font-medium"
                style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
              >
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d={tab.icon}
                    stroke="currentColor"
                    strokeWidth={active ? 2.2 : 1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
