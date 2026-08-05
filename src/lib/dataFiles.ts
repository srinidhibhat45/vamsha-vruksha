import fs from "node:fs";
import path from "node:path";
import { commitFile, gitBackendConfigured, type CommitMeta } from "./github.ts";

/**
 * Read/write for everything under data/people/ and data/reference/.
 *
 * Reading is always safe against the local filesystem: those files ship as
 * part of the deployment bundle. Writing is not — see github.ts for why a
 * Netlify Function cannot just call fs.writeFileSync and expect it to stick.
 *
 * This module is the seam: peopleStore.ts and vocabStore.ts call
 * readDataFile/writeDataFile instead of node:fs directly, and everything
 * downstream of that (atomic-write-to-disk locally, commit-to-GitHub in a
 * deployment) is decided here from the environment, the same pattern
 * mediaStore.ts already uses for photographs.
 *
 * The one wrinkle a git-commit backend introduces: committing to GitHub does
 * not change the files this warm function instance booted from — it changes
 * what the *next* deploy will boot from. Without something in between, a
 * maintainer who edits one record and then immediately edits a second would
 * have the second edit's read-modify-write start from the stale pre-edit
 * copy, silently undoing the first. The overlay below is that something: the
 * latest content of every file written this process is kept in memory and
 * always wins over what is on disk, so a warm instance always reads its own
 * writes back correctly. It is not shared across instances or across a
 * restart — Netlify's rebuild-on-push is what makes the change durable and
 * visible to everyone else, typically within a couple of minutes.
 */

const DATA_DIR = path.join(process.cwd(), "data");

const overlay = new Map<string, string>();
/** relDir -> filenames that exist only in the overlay (not yet on disk). */
const overlayDirs = new Map<string, Set<string>>();

function absPath(relPath: string): string {
  return path.join(DATA_DIR, relPath);
}

export function usesGitBackend(): boolean {
  return gitBackendConfigured();
}

/** Read a file's text, checking this process's own unpublished writes first. */
export function readDataFile(relPath: string): string | null {
  const overlaid = overlay.get(relPath);
  if (overlaid !== undefined) return overlaid;
  try {
    return fs.readFileSync(absPath(relPath), "utf8");
  } catch {
    return null;
  }
}

/** `.json` filenames directly inside a data/ subdirectory, disk ∪ overlay. */
export function listDataFiles(relDir: string): string[] {
  const names = new Set<string>();
  try {
    for (const name of fs.readdirSync(absPath(relDir))) {
      if (name.endsWith(".json")) names.add(name);
    }
  } catch {
    // Directory not present in this bundle — fine, the overlay may still hold
    // a file minted this process (e.g. the first record ever committed).
  }
  for (const name of overlayDirs.get(relDir) ?? []) names.add(name);
  return [...names].sort();
}

/**
 * Replace a file's full contents.
 *
 * `meta.message` should say what changed in one line — it becomes the commit
 * message when this lands on GitHub, which is the whole point of writing this
 * way rather than to a database: `git log data/people/community.json` is the
 * archive's provenance trail.
 */
export async function writeDataFile(
  relPath: string,
  content: string,
  meta: CommitMeta,
): Promise<void> {
  overlay.set(relPath, content);
  const dir = path.posix.dirname(relPath.split(path.sep).join("/"));
  const name = path.posix.basename(relPath.split(path.sep).join("/"));
  const set = overlayDirs.get(dir) ?? new Set<string>();
  set.add(name);
  overlayDirs.set(dir, set);

  if (usesGitBackend()) {
    await commitFile(`data/${relPath}`, content, meta);
    return;
  }

  const file = absPath(relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, file);
}
