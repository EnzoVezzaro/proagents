# Method: Schema Evolution Planning

**Owner profile:** data-engineer · **Type:** procedure playbook

Plan a schema change end-to-end: consumer inventory, compatibility classification, expand/contract execution, and a announced sunset — so no downstream consumer is ever surprised.

## When to run

- Any change to a shared dataset's schema or semantics: new required fields, renames, type changes, re-graining, metric redefinition.

## Procedure

1. **Inventory the consumers** via column-level lineage and the query log: dashboards, downstream pipelines, reverse-ETL, ad-hoc power users. Unknown consumers ⇒ freeze the change until discovery runs (query logs don't lie).
2. **Classify every delta** with the compatibility matrix (see schema-evolution.md): additive, backward-compatible, or breaking. Semantics ("`status` now means a different lifecycle") count as breaking even when types don't.
3. **Plan expand → migrate → contract:**
   - Expand: new shapes alongside old; both correct; dual-write where needed.
   - Migrate: consumers move on their schedule; you provide the mapping queries and support.
   - Contract: removal only after usage telemetry shows zero for the full window.
4. **Decide history policy:** backfill, default, or null-with-documented-meaning for old rows — consistent across the warehouse, written into the migration note.
5. **Announce like a release:** changelog, direct notification to every inventoried consumer, sunset dates, and a contract diff attached to the PR.
6. **Verify with telemetry at contract time:** the column/table dies when reads die — measured, not presumed.

## Rules

- Renames are add-then-remove, never in-place.
- Breaking changes without sunset dates and notifications are blocked at review — the definition of "breaking" includes "somebody's query fails quietly".
