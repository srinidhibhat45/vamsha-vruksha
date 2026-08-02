"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PersonPicker, type PickedPerson } from "./PersonPicker";

interface RelateResult {
  a: { id: string; name: string };
  b: { id: string; name: string };
  kind: string;
  term: { english: string; konkani?: string; gloss?: string; alt?: string[] };
  reciprocal: { english: string; konkani?: string };
  degrees?: { a: number; b: number };
  distance: number;
  consanguinity?: number;
  commonAncestors: { id: string; name: string }[];
  path: { via: string; toId: string; label: string }[];
}

export function RelateTool({
  initialA,
  initialB,
}: {
  initialA?: PickedPerson;
  initialB?: PickedPerson;
}) {
  const [a, setA] = useState<PickedPerson | null>(initialA ?? null);
  const [b, setB] = useState<PickedPerson | null>(initialB ?? null);
  const [result, setResult] = useState<RelateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!a || !b) {
      setResult(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/relate?a=${a.id}&b=${b.id}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("lookup failed");
        return r.json();
      })
      .then(setResult)
      .catch((e) => {
        if (e.name !== "AbortError") setError("Could not work that one out.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [a, b]);

  const swap = () => {
    setA(b);
    setB(a);
  };

  return (
    <>
      <div className="surface p-6">
        <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <PersonPicker label="Start from" value={a} onChange={setA} autoFocus />
          <button
            type="button"
            onClick={swap}
            disabled={!a && !b}
            className="btn btn-outlined btn-icon mb-1"
            aria-label="Swap the two people"
          >
            <span aria-hidden>⇄</span>
          </button>
          <PersonPicker label="…to" value={b} onChange={setB} />
        </div>
      </div>

      {/* One live region for both states, so the answer is announced when
          it lands rather than appearing silently below the pickers. */}
      <div role="status" aria-live="polite" aria-busy={loading}>
        {loading && (
          <p className="mt-6 text-center text-[0.95rem] text-[var(--fg-faint)]">
            Walking the graph…
          </p>
        )}
        {error && (
          <p className="mt-6 text-center text-[0.95rem] text-[var(--accent)]">
            {error}
          </p>
        )}
      </div>

      {result && !loading && (
        <div className="mt-6 space-y-5">
          <div className="surface rangoli-field p-8 text-center">
            <p className="text-[0.95rem] text-[var(--fg-soft)]">
              {result.b.name} is {result.a.name}&rsquo;s
            </p>

            {result.kind === "unrelated" ? (
              <>
                <h2 className="mt-2 font-display text-[1.9rem] font-medium">
                  no recorded connection
                </h2>
                <p className="mx-auto mt-3 max-w-md text-[0.98rem] leading-relaxed text-[var(--fg-soft)]">
                  These two are in separate parts of the archive. That does not
                  mean they are unrelated — it means no marriage or parentage
                  has yet been recorded that joins their families. If you know
                  of one, it is worth adding.
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-2 font-display text-[2.4rem] font-medium leading-tight">
                  {result.term.english}
                </h2>
                {result.term.konkani && (
                  <p className="deva mt-2 text-[1.6rem] text-[var(--accent)]" lang="kok">
                    {result.term.konkani}
                  </p>
                )}
                {result.term.alt?.length ? (
                  <p className="mt-1.5 text-[0.85rem] text-[var(--fg-faint)]">
                    also {result.term.alt.join(" · ")}
                  </p>
                ) : null}
                {result.term.gloss && (
                  <p className="mx-auto mt-3 max-w-md text-[0.98rem] leading-relaxed text-[var(--fg-soft)]">
                    {result.term.gloss}
                  </p>
                )}
                <p className="mt-5 text-[0.92rem] text-[var(--fg-faint)]">
                  Read the other way: {result.a.name} is {result.b.name}&rsquo;s{" "}
                  <strong className="font-medium text-[var(--fg-soft)]">
                    {result.reciprocal.english}
                  </strong>
                  {result.reciprocal.konkani && (
                    <span className="deva" lang="kok">
                      {" "}
                      ({result.reciprocal.konkani})
                    </span>
                  )}
                </p>
              </>
            )}
          </div>

          {result.commonAncestors.length > 0 && (
            <div className="surface p-5">
              <h3 className="eyebrow mb-2">Common ancestors</h3>
              <div className="flex flex-wrap gap-2">
                {result.commonAncestors.map((anc) => (
                  <Link
                    key={anc.id}
                    href={`/person/${anc.id}`}
                    className="chip chip-accent"
                  >
                    {anc.name}
                  </Link>
                ))}
              </div>
              {result.degrees && (
                <p className="mt-3 text-[0.92rem] leading-relaxed text-[var(--fg-soft)]">
                  {result.a.name} is {result.degrees.a}{" "}
                  {result.degrees.a === 1 ? "generation" : "generations"} below
                  them; {result.b.name} is {result.degrees.b}.
                  {result.consanguinity != null && result.consanguinity > 0 && (
                    <>
                      {" "}
                      Their coefficient of relationship is about{" "}
                      <strong className="font-medium">
                        {(result.consanguinity * 100).toFixed(
                          result.consanguinity < 0.01 ? 2 : 1,
                        )}
                        %
                      </strong>
                      .
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {result.path.length > 0 && (
            <div className="surface p-5">
              <h3 className="eyebrow mb-3">
                The chain · {result.path.length} steps
              </h3>
              <ol className="space-y-0">
                <li className="flex items-center gap-3 py-1.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[0.7rem] text-[var(--accent-fg)]">
                    ●
                  </span>
                  <Link
                    href={`/person/${result.a.id}`}
                    className="link-underline text-[0.98rem] font-semibold"
                  >
                    {result.a.name}
                  </Link>
                </li>
                {result.path.map((step, i) => (
                  <li key={i} className="flex items-center gap-3 py-1.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--bg-sunken)] text-[0.65rem] text-[var(--fg-faint)]">
                      {i + 1}
                    </span>
                    <span className="text-[0.95rem] text-[var(--fg-soft)]">
                      <span className="text-[var(--fg-faint)]">
                        {step.via === "spouse"
                          ? "married to "
                          : step.via === "child"
                            ? "then their "
                            : "then their "}
                      </span>
                      <Link
                        href={`/person/${step.toId}`}
                        className="link-underline"
                      >
                        {step.label}
                      </Link>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
                <Link
                  href={`/tree?person=${result.a.id}&mode=hourglass`}
                  className="btn btn-outlined btn-sm"
                >
                  See {result.a.name.split(" ")[0]} in the tree
                </Link>
                <Link
                  href={`/tree?person=${result.b.id}&mode=hourglass`}
                  className="btn btn-outlined btn-sm"
                >
                  See {result.b.name.split(" ")[0]} in the tree
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {!a || !b ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Konkani is more precise than English",
              body: "English has one word for four different uncles. Konkani distinguishes your father's elder brother, his younger brother, your mother's brother and your aunt's husband — and each carries a different set of obligations.",
            },
            {
              title: "Cousins are brothers and sisters",
              body: "A first cousin is addressed as bhav or bhoin, the same word as a sibling. The archive still tells you the exact degree, because that is what the records need, but it names the relationship the way a family would.",
            },
            {
              title: "It works through marriage too",
              body: "When there is no shared ancestor, the search routes through marriages instead — your brother's wife's father, and so on — and tells you plainly that there is no blood link.",
            },
          ].map((card) => (
            <div key={card.title} className="surface p-5">
              <h2 className="font-display text-[1.2rem] font-medium">{card.title}</h2>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
                {card.body}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
