"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/queue", label: "Review queue" },
  { href: "/admin/people", label: "Records" },
];

export function AdminNav({ pending }: { pending: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <div className="border-b border-[var(--line)] bg-[var(--bg-inset)]">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-1 gap-y-2 px-4 py-2.5">
        <span className="mr-3 text-[0.7rem] font-semibold uppercase tracking-[0.11em] text-[var(--fg-faint)]">
          Maintainer
        </span>

        <nav aria-label="Maintainer" className="flex flex-wrap items-center gap-1">
          {LINKS.map((link) => {
            // Overview would otherwise stay lit on every child route.
            const active =
              link.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className="btn btn-text btn-sm"
                data-active={active || undefined}
                style={
                  active
                    ? {
                        background: "var(--accent-container)",
                        color: "var(--accent-on-container)",
                      }
                    : undefined
                }
              >
                {link.label}
                {link.href === "/admin/queue" && pending > 0 && (
                  <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 py-px text-[0.7rem] font-semibold text-[var(--accent-fg)]">
                    {pending}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link href="/" className="btn btn-text btn-sm">
            View site
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="btn btn-text btn-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
