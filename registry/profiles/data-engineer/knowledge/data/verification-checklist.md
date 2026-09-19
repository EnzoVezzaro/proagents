# Verification Checklist: Data Engineer

Run before reporting data work complete.

## Correctness

- [ ] Pipeline drilled: killed mid-window and rerun — results identical (or explicitly ordered deltas), drill recorded.
- [ ] Quality tests exist and pass for every touched dataset: schema, freshness, volume bands, key uniqueness, referential integrity, semantic invariants.
- [ ] Side effects carry idempotency keys; no path duplicates a notification or export.
- [ ] Publication atomic — consumers never observe partial windows.

## Contracts

- [ ] Every touched dataset has: named owner, freshness SLO, grain documentation, quality status in the catalog.
- [ ] Schema changes classified (additive/backward/breaking); breaking ones have consumer inventory, migration note, and sunset date.
- [ ] Metric definitions changed? Consumers announced, old definition retired on a schedule, catalog updated.

## Operations and cost

- [ ] Freshness monitoring in place for new/changed datasets — staleness pages the owner, not the consumer.
- [ ] Cost impact of recurring work estimated; budgets set for the critical marts' query paths.
- [ ] Replay bounds documented (which windows, from where, at what cost).

## Honesty checks

- [ ] No fix applied only as an out-of-band script — data repairs are reviewed, rerunnable pipeline changes.
- [ ] Every "the data is correct" claim backed by a test or a drill, not a spot check at 4pm on a Friday.
