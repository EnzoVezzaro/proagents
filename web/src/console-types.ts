/** One normalized inspection finding (doctor/audit). */
export interface Finding {
  code: string;
  severity: "error" | "warning";
  file: string;
  line?: number | null;
  message: string;
  suggestion?: string;
}

export interface InstalledProfile {
  dir: string;
  slug: string;
  version: string;
  hasManifest: boolean;
  hasSkill: boolean;
  canonical: boolean;
}

export interface InstalledCrew {
  dir: string;
  id: string;
  version: string;
  hasSkill: boolean;
}

export interface InstalledBlock {
  file: string;
  marker: string;
  line: number | null;
  closed: boolean;
  title: string;
}

export interface MemoryRecordView {
  key: string;
  value: string;
  scope?: string;
  tags: string[];
  provenance?: string;
  version: number;
}

/** Finding report with re-derived summary and exit (detector shares both). */
export interface FindingsReport {
  root: string;
  findings: Finding[];
  summary: { total: number; errors: number; warnings: number };
  exit: number;
}

/** The typed normalization of any accepted CLI report. */
export type ConsoleReport =
  | ({ kind: "doctor" } & FindingsReport)
  | ({ kind: "audit" } & FindingsReport)
  | {
      kind: "list-installed";
      root: string;
      profiles: InstalledProfile[];
      crews: InstalledCrew[];
      blocks: InstalledBlock[];
      summary: { profiles: number; crews: number; blocks: number };
    }
  | { kind: "memory-list"; records: MemoryRecordView[]; summary: { total: number } }
  | { kind: "memory-compile"; target: string; file: string; records: string[]; block: string | null; note: string };