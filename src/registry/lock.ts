/**
 * Lock — write and verify `proagents.lock`.
 *
 * The lock makes the environment reproducible (NEW_CHANGES.md §12), the
 * package-lock.json of agent environments. Hard invariants (AGENTS.md §1):
 * no timestamps, no randomness — the same spec + same catalog + same
 * findings always produce a byte-identical file. Keys are sorted; checksums
 * are "sha256:…" of canonical manifest bytes when the catalog item carries
 * content, "unverified" when offline.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";
import { LOCK_SCHEMA, type LockFile, type ResolvedImplementation, type SpecDocument, type SpecFinding } from "./types.js";
import { specHash } from "./spec.js";

/** The lock file name at repo root. */
export const LOCK_FILE = "proagents.lock";

/** Canonicalize one resolved entry: fixed key order, no optional churn. */
function canonicalResolved(resolved: Record<string, ResolvedImplementation>): Record<string, ResolvedImplementation> {
  const out: Record<string, ResolvedImplementation> = {};
  for (const capability of Object.keys(resolved).sort()) {
    const r = resolved[capability]!;
    out[capability] = {
      source: r.source,
      artifact: r.artifact,
      version: r.version,
      ...(r.checksum ? { checksum: r.checksum } : {}),
      ...(r.title ? { title: r.title } : {}),
    };
  }
  return out;
}

/**
 * Build a LockFile from a spec + resolution graph. Pure. `checksums` maps
 * "kind:id" → checksum string; missing entries become "unverified".
 */
export function buildLock(
  spec: SpecDocument,
  resolved: Record<string, ResolvedImplementation>,
  checksums: Record<string, string> = {},
): LockFile {
  const withChecksums: Record<string, ResolvedImplementation> = {};
  for (const [capability, r] of Object.entries(resolved)) {
    const checksum = checksums[r.artifact];
    withChecksums[capability] = { ...r, ...(checksum ? { checksum } : { checksum: "unverified" }) };
  }
  return {
    schema: LOCK_SCHEMA,
    specHash: specHash(spec),
    resolved: canonicalResolved(withChecksums),
  };
}

/** Serialize the lock deterministically (sorted keys, no timestamps). */
export function serializeLock(lock: LockFile): string {
  return yamlStringify(
    { schema: lock.schema, specHash: lock.specHash, resolved: canonicalResolved(lock.resolved) },
    { sortMapEntries: false, lineWidth: 100 },
  );
}

/** sha256 of arbitrary bytes ("sha256:…" form), the checksum primitive. */
export function sha256Of(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Verification (PA510 / PA511 / PA512)
// ---------------------------------------------------------------------------

export interface VerifyResult {
  ok: boolean;
  findings: SpecFinding[];
}

/** PA512 — structural check of a parsed lock document. */
function validateLockSchema(doc: unknown): { lock?: LockFile; finding?: SpecFinding } {
  if (typeof doc !== "object" || doc === null) return { finding: pa512("lock must be a YAML mapping") };
  const d = doc as Record<string, unknown>;
  if (d.schema !== LOCK_SCHEMA) return { finding: pa512(`schema must be "${LOCK_SCHEMA}"`) };
  if (typeof d.specHash !== "string" || !/^sha256:[0-9a-f]{64}$/.test(d.specHash)) {
    return { finding: pa512("specHash must be a sha256:<64 hex> string") };
  }
  if (typeof d.resolved !== "object" || d.resolved === null) return { finding: pa512("resolved must be a mapping") };
  const resolved: Record<string, ResolvedImplementation> = {};
  for (const [capability, value] of Object.entries(d.resolved as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) return { finding: pa512(`resolved.${capability} must be a mapping`) };
    const r = value as Record<string, unknown>;
    if (typeof r.source !== "string" || typeof r.artifact !== "string" || typeof r.version !== "string") {
      return { finding: pa512(`resolved.${capability} needs source, artifact and version strings`) };
    }
    if (r.checksum !== undefined && typeof r.checksum !== "string") {
      return { finding: pa512(`resolved.${capability}.checksum must be a string`) };
    }
    resolved[capability] = {
      source: r.source,
      artifact: r.artifact,
      version: r.version,
      ...(typeof r.checksum === "string" ? { checksum: r.checksum } : {}),
      ...(typeof r.title === "string" ? { title: r.title } : {}),
    };
  }
  return { lock: { schema: LOCK_SCHEMA, specHash: d.specHash, resolved } };
}

function pa512(message: string): SpecFinding {
  return {
    code: "PA512",
    severity: "error",
    message,
    suggestion: "Regenerate the lock with `proagent lock` — hand-edited locks are not supported.",
  };
}

/**
 * Verify a lock against a spec:
 *  - PA512 when the lock file is structurally invalid
 *  - PA510 when specHash ≠ hash of the current spec (lock is stale)
 *  - PA511 when a recorded checksum ≠ checksum of the artifact's current
 *    content (or is "unverified" — reported, never treated as tamper-proof)
 */
export async function verifyLock(lockRaw: string, spec: SpecDocument, checksums: Record<string, string> = {}): Promise<VerifyResult> {
  let doc: unknown;
  try {
    doc = yamlParse(lockRaw);
  } catch (err) {
    return { ok: false, findings: [pa512(`invalid YAML: ${(err as Error).message}`)] };
  }
  const { lock, finding } = validateLockSchema(doc);
  if (!lock || finding) return { ok: false, findings: [finding!] };

  const findings: SpecFinding[] = [];
  const currentHash = specHash(spec);
  if (lock.specHash !== currentHash) {
    findings.push({
      code: "PA510",
      severity: "error",
      message: `lock is stale: specHash ${lock.specHash.slice(0, 15)}… does not match the current spec (${currentHash.slice(0, 15)}…)`,
      suggestion: "Run `proagent lock` to re-resolve, or restore the proagents.yaml the lock was generated from.",
      entities: ["specHash"],
    });
  }
  for (const [capability, r] of Object.entries(lock.resolved)) {
    if (r.checksum === "unverified") {
      findings.push({
        code: "PA511",
        severity: "warning",
        message: `capability "${capability}" (${r.artifact}) has no verified checksum`,
        suggestion: "Re-run `proagent lock` with registry access to pin checksums.",
        entities: [capability],
      });
      continue;
    }
    const expected = checksums[r.artifact];
    if (expected && expected !== r.checksum) {
      findings.push({
        code: "PA511",
        severity: "error",
        message: `checksum mismatch for "${capability}" (${r.artifact}): lock ${r.checksum} ≠ current ${expected}`,
        suggestion: "If the change is intended, re-run `proagent lock`; otherwise investigate the artifact source.",
        entities: [capability, r.artifact],
      });
    }
  }
  return { ok: findings.every((f) => f.severity !== "error"), findings };
}

/** Load proagents.lock text from a repo root (undefined when absent). */
export async function loadLockRaw(root: string = process.cwd(), file: string = LOCK_FILE): Promise<string | undefined> {
  try {
    return await fs.readFile(path.resolve(root, file), "utf8");
  } catch {
    return undefined;
  }
}

/** Write the lock to a repo root (canonical serialization). */
export async function saveLock(lock: LockFile, root: string = process.cwd(), file: string = LOCK_FILE): Promise<string> {
  const filePath = path.resolve(root, file);
  await fs.writeFile(filePath, serializeLock(lock), "utf8");
  return filePath;
}
