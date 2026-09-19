# Reference: Data Quality Enforcement

**Owner profile:** data-engineer · **Covers:** "Data quality enforcement" · **Type:** practice reference

Data quality is not a dashboard where problems go to be admired — it is enforcement at the boundary: bad data is blocked, quarantined, or loudly announced before consumers build on it.

## The quality contract per dataset

1. **Schema:** types, nullability, allowed values. Enforced at landing — a violating row is rejected or quarantined with a record, never silently coerced.
2. **Freshness:** "data for hour H is present by H+30min". Monitored by an automated probe; breaches page the owner, not the consumer.
3. **Volume sanity:** row counts and distincts within expected bands (learned from history, bounded by sense). A 95% row drop is an incident even if every row is perfectly valid.
4. **Integrity:** uniqueness of keys, referential integrity to conformed dimensions, no orphans.
5. **Semantic tests:** the business's invariants ("refunds never exceed gross", "every active user has a segment"). These live with the model, in version control, tested in CI.

## Where enforcement happens

| Stage | Mechanism |
|---|---|
| Landing | schema validation, quarantine tables, dead-letter queues |
| Transformation | assertion tests blocking promotion of bad builds |
| Serving | freshness probes; stale data marked or withheld |
| Consumption | data catalog shows quality status per dataset |

## The incident path

When quality fails: consumers are notified with the affected datasets, windows and severity; the fix is a reviewed, rerunnable pipeline change (or a documented backfill); a postmortem records why upstream validation missed it. Silent fixes rebreak silently.

## Rules

- Every dataset has a named owner; "the data team" is not a name.
- Quality tests are code: reviewed, versioned, and removed only by decision — not by rot.
- The quarantine path is monitored; a dead-letter queue nobody reads is a slow data leak with extra steps.
