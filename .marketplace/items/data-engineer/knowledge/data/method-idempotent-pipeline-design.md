# Method: Idempotent Pipeline Design

**Owner profile:** data-engineer · **Type:** procedure playbook

Design (or retrofit) a pipeline so that any window can be killed mid-run and rerun safely, producing identical results — turning partial failure into a retry instead of an incident.

## When to run

- Building a new pipeline; an incident revealed rerun danger; taking ownership of a pipeline with unknown replay semantics.

## Procedure

1. **Make time an explicit input.** Every stage parameterized by its window (`ds`, `hour`, `offset`); no implicit "now", "today", or cross-window reads without a documented reason.
2. **Choose the write model per stage:**
   - Batch tables → replace-the-partition semantics (atomic overwrite of exactly the window).
   - Append-only events → event IDs with dedup on read or idempotent sink.
   - Side effects (emails, exports, webhooks) → idempotency keys.
3. **Publish atomically.** Stage into staging/`__tmp` structures and swap; consumers never observe partial windows.
4. **Declare replay bounds:** which windows rebuild from which sources at what cost; document next to the pipeline. Unbounded replay claims get tested, not trusted.
5. **Prove it by drill:** kill the pipeline mid-window, rerun, and diff the results (row counts, checksums, spot metrics) against the original. The drill result is recorded; first drill exposes every hidden `MERGE`-without-dedup and forgotten side effect.
6. **Wire the rerun path into operations:** "rerun window X" is a one-command, monitored operation — the on-call should not need the author's brain at 3am.

## Rules

- A pipeline that cannot be drilled is not idempotent; it is *believed* idempotent — different thing, different risk.
- Manual fixes applied outside the pipeline evaporate on the next replay; the fix goes in the code.
