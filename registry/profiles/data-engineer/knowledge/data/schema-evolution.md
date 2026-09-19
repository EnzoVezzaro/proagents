# Reference: Schema Evolution

**Owner profile:** data-engineer · **Covers:** "Schema evolution" · **Type:** practice reference

Schemas change; consumers' code doesn't change itself. Schema evolution is the planned movement of data contracts so that producers and consumers never surprise each other.

## The compatibility matrix

| Change | Backward-compatible (old readers fine) | Forward-compatible (new readers read old data) |
|---|---|---|
| Add optional column with default | Yes | Yes |
| Add required column | No — old data lacks it | — |
| Remove column | No for readers that select it | — |
| Rename | **No — treat as add-then-remove** | — |
| Widen type (int → bigint) | Usually yes | Yes |
| Narrow type / change semantics | No | No |
| Re-partition / re-grain | Contract change | Contract change |

## The procedure

1. **Inventory consumers before changing anything:** who queries this (dashboard, downstream pipeline, reverse-ETL)? Column-level lineage makes this a query, not an archaeology dig.
2. **Expand → migrate → contract (the expand/contract pattern):**
   - *Expand:* add the new column/table alongside the old; both stay correct.
   - *Migrate:* consumers move over on their own schedule; dual-write/dual-read during the window.
   - *Contract:* remove the old only when usage telemetry shows zero — not when the migration PR merges.
3. **Renames are doubles:** ship `new_name` populated, deprecate `old_name` with a sunset date, remove after the window. "It's just a rename" has broken more dashboards than any outage.
4. **Historical data has a policy:** new column on old rows = default? backfill? null-with-documented-meaning? The choice is written down and consistent across the warehouse.
5. **Announce like a release:** changelog entry, consumer notification, contract diff in the PR.

## Rules

- No breaking change without a migration note and a sunset date — surprises are the one forbidden outcome.
- Schema changes ride the same review bar as code: tests updated, lineage checked, contracts diffed.
