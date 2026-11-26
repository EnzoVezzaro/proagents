export type AuditSeverity = "error" | "warning";

export interface AuditFinding {
  /** Stable machine code (AU001 secrets, AU003 remote-exec, AU004 MCP transport, AU005 MCP pinning, AU006 permissions). */
  code: string;
  severity: AuditSeverity;
  /** Path relative to the scan root. */
  file: string;
  /** 1-based line; 0 when the finding is file-level. */
  line: number;
  message: string;
  suggestion: string;
}