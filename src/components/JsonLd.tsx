/**
 * Structured data, injected as a JSON-LD `<script>` tag.
 *
 * This is the one `dangerouslySetInnerHTML` in the codebase, and it is safe
 * for a reason worth stating rather than assuming: the content is always the
 * output of `JSON.stringify` on data this app already computed (never raw
 * user input rendered as markup), and `<` is escaped so a source title or
 * bio that happens to contain the literal text `</script>` cannot terminate
 * the tag early and inject sibling markup. It is also the pattern Next.js's
 * own documentation uses for JSON-LD under the App Router, for the same
 * reason: a script tag's text content cannot be safely produced any other
 * way through JSX children.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
