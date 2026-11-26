/**
 * Registry validation — the PA5xx aggregator.
 *
 * Each PA5xx code is raised where its evidence lives (spec.ts: PA501/505/506,
 * resolver.ts: PA502/503/504, lock.ts: PA510/511/512); this module composes
 * them into one end-to-end check for `proagent validate` and `setup`:
 * spec parse → semantic checks → resolution findings → lock verification.
 * Deterministic: same files → same findings, same order.
 */

import type { MarketplaceItem, SpecDocument, SpecFinding } from "./types.js";
import { parseSpec, validateSpec, type ParsedSpec } from "./spec.js";
import { resolveSpec, type ResolveInput } from "./resolver.js";
import { verifyLock } from "./lock.js";

export interface ValidateRegistryInput {
  /** Raw proagents.yaml text. */
  specRaw: string;
  /** Raw proagents.lock text (optional — lock checks skip when absent). */
  lockRaw?: string;
  /** Native catalog entries (artifact-ref checks + PA505 compatibility). */
  catalog?: MarketplaceItem[];
  /** Federated findings already gathered (resolver consumes results only). */
  findings?: import("./types.js").RegistryFinding[];
  /** Taxonomy for alias resolution. */
  taxonomy?: import("./types.js").CapabilityDefinition[];
  /** Explicit capability → artifact selections. */
  selections?: Record<string, string>;
  /** Checksums of current artifact content, "kind:id" → "sha256:…". */
  checksums?: Record<string, string>;
}

export interface ValidateRegistryResult {
  spec?: SpecDocument;
  findings: SpecFinding[];
  /** True when no error-severity finding exists. */
  ok: boolean;
}

/**
 * Full registry validation of a spec (+ optional lock). Pure aside from the
 * lock verification's file-independent hashing — no network, no timestamps.
 */
export async function validateRegistry(input: ValidateRegistryInput): Promise<ValidateRegistryResult> {
  const parsed: ParsedSpec = parseSpec(input.specRaw);
  const spec = parsed.spec;
  if (!spec) return { findings: parsed.findings, ok: false };

  const findings: SpecFinding[] = [...parsed.findings];

  // PA505/PA506 — semantic checks with catalog compatibility metadata.
  const catalogCompat: Record<string, string[]> = {};
  for (const item of input.catalog ?? []) {
    if (item.compatibility && item.compatibility.length > 0) catalogCompat[item.id] = item.compatibility;
  }
  findings.push(...validateSpec(spec, catalogCompat));

  // PA502/PA503/PA504 — resolution findings.
  const resolveInputs: Omit<ResolveInput, "capabilities" | "specEnvironment"> = {
    catalog: input.catalog ?? [],
    ...(input.findings ? { findings: input.findings } : {}),
    ...(input.taxonomy ? { taxonomy: input.taxonomy } : {}),
    ...(input.selections ? { selections: input.selections } : {}),
  };
  const { findings: resolutionFindings } = resolveSpec(spec, resolveInputs);
  findings.push(...resolutionFindings);

  // PA510/PA511/PA512 — lock verification (only when a lock is present).
  if (input.lockRaw !== undefined) {
    const { checksums = {} } = input;
    const verify = await verifyLock(input.lockRaw, spec, checksums);
    findings.push(...verify.findings);
  }

  return { spec, findings, ok: findings.every((f) => f.severity !== "error") };
}
