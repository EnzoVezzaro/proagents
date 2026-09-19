# Reference: Idempotency and Replay

**Owner profile:** data-engineer · **Covers:** "Idempotency and replay" · **Type:** practice reference

Every pipeline fails sometimes; the good ones make failure boring. Idempotency means rerunning any window produces the same result as running it once — which turns "incident" into "retry".

## The idempotency toolkit

1. **Deterministic partitioning:** every run is parameterized by its window (`ds`, `hour`) and touches only that window's data. No global state, no "today" implicit anywhere — time is an input.
2. **Replace, don't append (for batch):** the run writes its window atomically (`INSERT OVERWRITE` the partition / swap the table). A rerun replaces; it never duplicates.
3. **Deduplication as a first-class stage (for streams):** event IDs + idempotent sinks; the pipeline tolerates redelivery because the source will redeliver.
4. **Atomic publication:** consumers never see half a dataset — staging tables + swap, or single-transaction writes. Partial visibility is a correctness bug even when the numbers are right.
5. **Side effects are idempotent too:** emails, exports, downstream webhooks carry idempotency keys. "The data is fine but we sent the report twice" is still an incident.

## The replay design

- **Replayability is bounded and known:** which windows can be rebuilt, from which sources, at what cost. Documented per pipeline — "we can rebuild 90 days from the raw events; older only from backups" is a design statement, not a hope.
- **Backfills are pipelines, not scripts:** the same reviewed, tested code path, parameterized by window — run for a historical range with monitoring and a diff report against current data.
- **Drill it:** periodically rerun last Tuesday from scratch and compare. The first time you learn a pipeline isn't replayable must not be during an incident.

## Rules

- Any pipeline whose rerun duplicates data or corrupts state is a defect, prioritized like one.
- Manual data fixes outside the pipeline are banned — the fix belongs in the code so the next replay preserves it.
