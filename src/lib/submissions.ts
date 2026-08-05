import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Submission } from "./types.ts";

/**
 * The moderation queue.
 *
 * Every submission — and every status change made to it afterwards — is kept
 * as a version in an append-only log, one log per submission id. Two reasons,
 * and the second is the important one:
 *
 * 1. Append-only writes are safe under concurrency without a lock — two people
 *    submitting at the same moment cannot corrupt each other's record.
 *
 * 2. Nothing anonymous should ever land in a public genealogy unreviewed. The
 *    failure mode of an open family tree is not spam, it is a confidently
 *    wrong parent link that quietly rewrites three hundred people's ancestry
 *    and is believed because it is written down. A human reads every one.
 *
 * Approved records are promoted into data/people/*.json — see peopleStore.ts
 * — and, in a deployment, committed straight to git; see dataFiles.ts and
 * github.ts. The queue itself does *not* go through that git-backed path: a
 * raw incoming submission is not yet part of the archive of record, it is
 * anonymous and comes from a public unauthenticated endpoint, and putting
 * every one of them through a GitHub commit would both flood the repository's
 * history with unreviewed material and hand a public endpoint the ability to
 * trigger commits. So the queue instead lives in whichever key/value store
 * mediaStore.ts already picked for photographs — Netlify Blobs in a
 * deployment, the local filesystem in development — because it needs to
 * outlive one function invocation but does not need git's provenance
 * guarantees until a maintainer has actually looked at it.
 */

export type SubmissionsBackend = "blobs" | "local";

export function submissionsBackend(): SubmissionsBackend {
  const forced = process.env.SUBMISSIONS_BACKEND;
  if (forced === "blobs" || forced === "local") return forced;
  // Set by Netlify in every build and every function invocation.
  return process.env.NETLIFY ? "blobs" : "local";
}

const QUEUE_DIR = path.join(process.cwd(), "data", "submissions");
const STORE_NAME = process.env.SUBMISSIONS_STORE_NAME || "vansh-submissions";

/** One log per submission: every version it has ever had, oldest first. */
interface SubmissionLog {
  versions: Submission[];
}

/* ------------------------------------------------------------------ */
/* Netlify Blobs                                                       */
/* ------------------------------------------------------------------ */

type BlobStore = {
  set(key: string, value: string): Promise<unknown>;
  get(key: string, options: { type: "json" }): Promise<unknown>;
  list(options?: { prefix?: string }): Promise<{ blobs: { key: string }[] }>;
};

let blobStorePromise: Promise<BlobStore> | null = null;

async function blobStore(): Promise<BlobStore> {
  blobStorePromise ??= (async () => {
    const mod = (await import("@netlify/blobs")) as {
      getStore: (options: string | Record<string, unknown>) => BlobStore;
    };
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
    if (siteID && token) {
      return mod.getStore({ name: STORE_NAME, siteID, token, consistency: "strong" });
    }
    return mod.getStore({ name: STORE_NAME, consistency: "strong" });
  })();
  return blobStorePromise;
}

/* ------------------------------------------------------------------ */
/* Local filesystem (development)                                      */
/* ------------------------------------------------------------------ */

function ensureDir() {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
}

function localFile(id: string): string {
  // Ids are minted by this module (never taken from outside input), so no
  // extra sanitising is needed before it becomes a path segment.
  return path.join(QUEUE_DIR, `${id}.json`);
}

function localReadLog(id: string): SubmissionLog | null {
  const file = localFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as SubmissionLog;
  } catch {
    return null;
  }
}

function localWriteLog(id: string, log: SubmissionLog): void {
  ensureDir();
  const file = localFile(id);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(log, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function localAllIds(): string[] {
  if (!fs.existsSync(QUEUE_DIR)) return [];
  return fs
    .readdirSync(QUEUE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length));
}

/* ------------------------------------------------------------------ */
/* Backend-agnostic log access                                         */
/* ------------------------------------------------------------------ */

async function readLog(id: string): Promise<SubmissionLog | null> {
  if (submissionsBackend() === "blobs") {
    const store = await blobStore();
    const found = await store.get(`queue/${id}.json`, { type: "json" });
    return (found as SubmissionLog | null) ?? null;
  }
  return localReadLog(id);
}

async function writeLog(id: string, log: SubmissionLog): Promise<void> {
  if (submissionsBackend() === "blobs") {
    const store = await blobStore();
    await store.set(`queue/${id}.json`, JSON.stringify(log));
    return;
  }
  localWriteLog(id, log);
}

async function allIds(): Promise<string[]> {
  if (submissionsBackend() === "blobs") {
    const store = await blobStore();
    const { blobs } = await store.list({ prefix: "queue/" });
    return blobs
      .map((b) => b.key.slice("queue/".length))
      .filter((k) => k.endsWith(".json"))
      .map((k) => k.slice(0, -".json".length));
  }
  return localAllIds();
}

/* ------------------------------------------------------------------ */
/* Public interface                                                    */
/* ------------------------------------------------------------------ */

export async function appendSubmission(
  submission: Omit<Submission, "id" | "submittedAt" | "status">,
): Promise<Submission> {
  const record: Submission = {
    ...submission,
    id: `s-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
    status: "pending",
    submittedAt: new Date().toISOString(),
  };
  await writeLog(record.id, { versions: [record] });
  return record;
}

export async function readSubmissions(): Promise<Submission[]> {
  const ids = await allIds();
  const logs = await Promise.all(ids.map((id) => readLog(id)));
  const current = logs
    .filter((l): l is SubmissionLog => !!l && l.versions.length > 0)
    .map((l) => l.versions[l.versions.length - 1]);
  return current.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function updateSubmission(
  id: string,
  changes: Partial<
    Pick<Submission, "status" | "reviewerNote" | "appliedTo" | "appliedAt">
  >,
): Promise<Submission | null> {
  const log = await readLog(id);
  const existing = log?.versions[log.versions.length - 1];
  if (!existing) return null;
  const updated: Submission = {
    ...existing,
    ...changes,
    reviewedAt: new Date().toISOString(),
  };
  await writeLog(id, { versions: [...(log?.versions ?? []), updated] });
  return updated;
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const log = await readLog(id);
  return log?.versions[log.versions.length - 1] ?? null;
}

/** Every version of a submission, oldest first — what a moderator sees was
 *  sent back for changes on Tuesday and approved on Friday, not just its
 *  current state. */
export async function submissionHistory(id: string): Promise<Submission[]> {
  const log = await readLog(id);
  return log?.versions ?? [];
}

export async function queueCounts() {
  const all = await readSubmissions();
  const count = (status: Submission["status"]) =>
    all.filter((s) => s.status === status).length;
  return {
    pending: count("pending"),
    changesRequested: count("changes-requested"),
    approved: count("approved"),
    rejected: count("rejected"),
    merged: count("merged"),
    total: all.length,
  };
}
