import type { Metadata } from "next";
import { isAdmin, productionLockedOut, usingDefaultCredentials } from "@/lib/adminAuth";
import { queueCounts } from "@/lib/submissions";
import { listPending } from "@/lib/vocabStore";
import { AdminNav } from "@/components/admin/AdminNav";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = {
  title: { default: "Maintainer", template: "%s · Maintainer" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The gate.
 *
 * Every maintainer page sits inside this route group, so the session check
 * happens once and cannot be forgotten when a page is added. The sign-in page
 * is deliberately outside it — guarding the door you knock on is a redirect
 * loop.
 *
 * This is not the only check. The API routes verify the session again for
 * themselves, because a page guard protects what is rendered and says nothing
 * about what can be posted.
 *
 * Signed out, it renders the sign-in form *in place* rather than redirecting.
 * Redirecting threw away the destination — a maintainer who opened a bookmark
 * to the review queue, or whose twelve-hour session expired while they were
 * reading it, was bounced to /admin/login with no `next` and landed on the
 * overview afterwards, one navigation short of where they had asked to be.
 * A server layout has no way to read the pathname it is guarding, and the one
 * mechanism that could tell it — middleware — would put an edge function in
 * front of every request to a site that is otherwise prerendered. Rendering
 * the form here needs neither: the URL never changes, so `router.refresh()`
 * after a successful sign-in re-renders this same page as the real thing.
 */
export default async function SecureAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) {
    return (
      <div className="admin-route mx-auto max-w-sm px-4 py-20">
        <p className="eyebrow">Maintainers</p>
        <h1 className="mt-2 font-display text-[2rem] font-medium">Sign in</h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
          This page is for the people who review what comes in. Sign in and it
          will open where you left off.
        </p>

        {productionLockedOut() ? (
          <p className="mt-6 rounded-[var(--shape-md)] border-2 border-[var(--accent)] p-3.5 text-[0.85rem] leading-relaxed text-[var(--fg-soft)]">
            Sign-in is disabled on this deployment because{" "}
            <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD</code> have
            not been set — a production build refuses the built-in{" "}
            <code className="font-medium">admin</code> /{" "}
            <code className="font-medium">admin</code> pair rather than
            leaving it reachable from the internet. Set both in the
            environment and redeploy.
          </p>
        ) : (
          <>
            <LoginForm />
            {usingDefaultCredentials() && (
              <p className="mt-6 rounded-[var(--shape-md)] bg-[var(--bg-inset)] p-3.5 text-[0.85rem] leading-relaxed text-[var(--fg-soft)]">
                This deployment is still on the built-in{" "}
                <code className="font-medium">admin</code> /{" "}
                <code className="font-medium">admin</code>. Set{" "}
                <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD</code> in
                the environment before it faces the public.
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  const counts = await queueCounts();
  const proposals = listPending().length;

  return (
    <div className="admin-route min-h-full">
      <AdminNav pending={counts.pending} proposals={proposals} />
      {children}
    </div>
  );
}
