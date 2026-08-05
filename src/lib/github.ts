/**
 * Committing straight to the archive's GitHub repository.
 *
 * Netlify Functions run on a read-only, ephemeral filesystem — anything an
 * admin action writes to disk there is gone the moment that container
 * recycles, which is what makes approvals and edits appear to vanish in
 * production. A database would fix that, but it would also break the
 * project's stated design principle: records live in git, not in a table,
 * so every change to every person keeps an author, a date and a reason
 * forever (see README).
 *
 * So the deployed write path is this module: it does automatically what a
 * maintainer running locally is asked to do by hand — commit the change —
 * using the GitHub Contents API. Netlify rebuilds on the push (this site is
 * connected to the repo), so the change is live for every reader within a
 * couple of minutes; the in-memory overlay in dataFiles.ts covers the gap so
 * the admin who just made the change sees it immediately without waiting.
 *
 * Configuration (server-only env vars, never sent to the browser):
 *   GITHUB_TOKEN   a fine-grained personal access token scoped to Contents:
 *                  Read and write on this one repository only. Required —
 *                  without it dataFiles.ts falls back to local disk, which is
 *                  correct for `npm run dev` and wrong for a deployment.
 *   GITHUB_REPO    "owner/name". Defaults to this project's own repo.
 *   GITHUB_BRANCH  Defaults to "main".
 */

const API = "https://api.github.com";
const DEFAULT_REPO = "srinidhibhat45/vamsha-vruksha";

/** The bot identity used as the GitHub *committer* on every automated write.
 *  The human who actually made the change is named in the commit message and,
 *  where a real name is known, as the commit *author* — GitHub does not
 *  require the author to be a registered account or a deliverable address. */
const BOT_NAME = "Vansh Vriksha Archive";
const BOT_EMAIL = "archive@vanshvriksha.srinidhibhat.com";

function repo(): string {
  return process.env.GITHUB_REPO || DEFAULT_REPO;
}

function branch(): string {
  return process.env.GITHUB_BRANCH || "main";
}

function token(): string | undefined {
  return process.env.GITHUB_TOKEN;
}

/** Whether writes in this environment should go to GitHub at all. */
export function gitBackendConfigured(): boolean {
  return !!token();
}

async function api(pathname: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "vansh-vriksha-archive",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

/** Git rejects some characters in an identity name; a contributor's typed
 *  name is free text and could contain any of them. */
function sanitizeIdentity(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const cleaned = name.replace(/[<>\n\r]/g, "").trim();
  return cleaned || undefined;
}

export interface CommitMeta {
  /** The commit message — should say what changed and why, in one line. */
  message: string;
  /** The contributor or maintainer credited as the change's author. */
  authorName?: string;
  authorEmail?: string;
}

/**
 * Write one file's full contents as a single commit.
 *
 * Contents-API writes are whole-file (there is no patch/diff endpoint), which
 * is exactly what dataFiles.ts already produces — the store modules rewrite a
 * complete JSON document on every mutation, never a fragment.
 */
export async function commitFile(
  repoRelativePath: string,
  content: string,
  meta: CommitMeta,
): Promise<void> {
  if (!token()) {
    throw new Error(
      "GITHUB_TOKEN is not set — this environment cannot commit writes. " +
        "Set GITHUB_TOKEN (and GITHUB_REPO if this is not srinidhibhat45/vamsha-vruksha) " +
        "as a Netlify environment variable.",
    );
  }

  const getRes = await api(
    `/repos/${repo()}/contents/${repoRelativePath}?ref=${encodeURIComponent(branch())}`,
  );
  let sha: string | undefined;
  if (getRes.ok) {
    const found = (await getRes.json()) as { sha: string };
    sha = found.sha;
  } else if (getRes.status !== 404) {
    throw new Error(
      `GitHub read of ${repoRelativePath} failed: ${getRes.status} ${await getRes.text()}`,
    );
  }

  const authorName = sanitizeIdentity(meta.authorName) || BOT_NAME;
  const authorEmail = meta.authorEmail || BOT_EMAIL;

  const putRes = await api(`/repos/${repo()}/contents/${repoRelativePath}`, {
    method: "PUT",
    body: JSON.stringify({
      message: meta.message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: branch(),
      sha,
      author: { name: authorName, email: authorEmail },
      committer: { name: BOT_NAME, email: BOT_EMAIL },
    }),
  });

  if (!putRes.ok) {
    throw new Error(
      `GitHub write of ${repoRelativePath} failed: ${putRes.status} ${await putRes.text()}`,
    );
  }
}
