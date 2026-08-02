import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Submission } from "./types.ts";

/**
 * The moderation queue.
 *
 * Submissions are appended to a JSON Lines file rather than written into the
 * archive. Two reasons, and the second is the important one:
 *
 * 1. Append-only writes are safe under concurrency without a lock — two people
 *    submitting at the same moment cannot corrupt each other's record.
 *
 * 2. Nothing anonymous should ever land in a public genealogy unreviewed. The
 *    failure mode of an open family tree is not spam, it is a confidently
 *    wrong parent link that quietly rewrites three hundred people's ancestry
 *    and is believed because it is written down. A human reads every one.
 *
 * Approved records are promoted into data/people/*.json and committed to git,
 * which is what gives the archive an auditable history of who claimed what.
 *
 * Deploying to a serverless host with an ephemeral filesystem means replacing
 * the two functions below with a database or object-store write. Nothing else
 * in the app touches the queue.
 */

const QUEUE_DIR = path.join(process.cwd(), "data", "submissions");
const QUEUE_FILE = path.join(QUEUE_DIR, "queue.jsonl");

function ensureDir() {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
}

export function appendSubmission(
  submission: Omit<Submission, "id" | "submittedAt" | "status">,
): Submission {
  ensureDir();
  const record: Submission = {
    ...submission,
    id: `s-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
    status: "pending",
    submittedAt: new Date().toISOString(),
  };
  fs.appendFileSync(QUEUE_FILE, JSON.stringify(record) + "\n", "utf8");
  return record;
}

export function readSubmissions(): Submission[] {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  const lines = fs.readFileSync(QUEUE_FILE, "utf8").split("\n").filter(Boolean);

  // Later lines supersede earlier ones with the same id, so a status change is
  // itself just an append. The file is the log; this is the projection.
  const byId = new Map<string, Submission>();
  for (const line of lines) {
    try {
      const record = JSON.parse(line) as Submission;
      byId.set(record.id, record);
    } catch {
      // A truncated final line can happen if a write was interrupted. Skipping
      // it loses at most one submission rather than the whole queue.
    }
  }
  return [...byId.values()].sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt),
  );
}

export function updateSubmission(
  id: string,
  changes: Partial<Pick<Submission, "status" | "reviewerNote">>,
): Submission | null {
  const existing = readSubmissions().find((s) => s.id === id);
  if (!existing) return null;
  const updated: Submission = {
    ...existing,
    ...changes,
    reviewedAt: new Date().toISOString(),
  };
  ensureDir();
  fs.appendFileSync(QUEUE_FILE, JSON.stringify(updated) + "\n", "utf8");
  return updated;
}

export function queueCounts() {
  const all = readSubmissions();
  return {
    pending: all.filter((s) => s.status === "pending").length,
    approved: all.filter((s) => s.status === "approved").length,
    rejected: all.filter((s) => s.status === "rejected").length,
    total: all.length,
  };
}

/**
 * Simple shared-secret gate for the review queue.
 *
 * The archive has no user accounts by design — everything readable is public
 * and contributing needs no login. Moderation is the one action that must not
 * be open, so it sits behind a secret held by whoever maintains the archive.
 * If the variable is unset the queue is refused outright rather than left open.
 */
export function isReviewer(token: string | null | undefined): boolean {
  const secret = process.env.ARCHIVE_REVIEW_KEY;
  if (!secret) return false;
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
