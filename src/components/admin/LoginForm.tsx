"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * `next` is where to go after signing in. Omitted, the form stays on the
 * current URL and simply refreshes it — which is what the secure layout wants,
 * because the URL the reader asked for is already the right destination.
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not sign in");
        setPassword("");
        return;
      }
      if (next) router.replace(next);
      // The guard runs on the server, so the cached tree has to be dropped or
      // the redirect lands back on the login page it just came from. With no
      // `next`, this refresh is the whole navigation: the current URL is a
      // guarded admin page rendering its sign-in form, and re-rendering it
      // with a session in hand turns it into the page itself.
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div>
        <label className="label" htmlFor="admin-username">
          Username
        </label>
        <input
          id="admin-username"
          name="username"
          className="field mt-1.5"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="admin-password">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          className="field mt-1.5"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {/* Announced rather than merely shown — a failed sign-in with focus
          still in the password field is otherwise silent. */}
      <p role="alert" className="min-h-[1.25rem] text-[0.9rem] text-[var(--accent)]">
        {error}
      </p>

      <button type="submit" className="btn btn-filled w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
