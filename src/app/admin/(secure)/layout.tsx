import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import { queueCounts } from "@/lib/submissions";
import { listPending } from "@/lib/vocabStore";
import { AdminNav } from "@/components/admin/AdminNav";

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
 */
export default async function SecureAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) redirect("/admin/login");

  const counts = queueCounts();
  const proposals = listPending().length;

  return (
    <div className="admin-route min-h-full">
      <AdminNav pending={counts.pending} proposals={proposals} />
      {children}
    </div>
  );
}
