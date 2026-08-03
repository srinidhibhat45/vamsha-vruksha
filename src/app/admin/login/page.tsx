import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin, usingDefaultCredentials } from "@/lib/adminAuth";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Params = Promise<{ next?: string }>;

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Params;
}) {
  const { next } = await searchParams;

  // Only same-site paths, so a link like /admin/login?next=https://elsewhere
  // cannot use this page to bounce someone off the archive after signing in.
  const destination = next && /^\/admin(\/|$)/.test(next) ? next : "/admin";

  if (await isAdmin()) redirect(destination);

  return (
    <div className="admin-route mx-auto max-w-sm px-4 py-20">
      <p className="eyebrow">Maintainers</p>
      <h1 className="mt-2 font-display text-[2rem] font-medium">Sign in</h1>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
        Reading and contributing to the archive need no account. This is only
        for the people who review what comes in.
      </p>

      <LoginForm next={destination} />

      {usingDefaultCredentials() && (
        <p className="mt-6 rounded-[var(--shape-md)] bg-[var(--bg-inset)] p-3.5 text-[0.85rem] leading-relaxed text-[var(--fg-soft)]">
          This deployment is still on the built-in{" "}
          <code className="font-medium">admin</code> /{" "}
          <code className="font-medium">admin</code>. Set{" "}
          <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD</code> in the
          environment before it faces the public.
        </p>
      )}
    </div>
  );
}
