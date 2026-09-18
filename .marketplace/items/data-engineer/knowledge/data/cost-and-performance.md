# Reference: Cost and Performance of Data Systems

**Owner profile:** data-engineer · **Covers:** "Cost and performance of data systems" · **Type:** practice reference

Data systems monetize inefficiency at scale: the wrong scan runs 1,000 times a day and bills you for each. Cost and performance are engineered properties with owners and budgets, like latency and correctness.

## The cost levers

1. **Scan discipline:** partition pruning and clustering aligned with the actual query patterns; `SELECT *` is a cost decision, not a style one.
2. **Incremental over full:** recompute only new/changed data where semantics allow; full refreshes are a documented, scheduled exception.
3. **Materialization strategy:** pre-aggregate what's queried often; keep the atomic layer for the long tail. Every materialized view is a trade — freshness and storage for query cost — made deliberately.
4. **Storage lifecycle:** TTLs on staging and ephemeral tables, old partitions archived to cold storage, orphan datasets deleted on a schedule. The warehouse's attic bills monthly.
5. **The always-on tax:** streaming clusters and always-warm warehouses bill 24/7 — right-size, autoscale, and schedule down known-quiet hours.

## The performance method

1. **Measure before optimizing:** query profiles (bytes scanned, shuffle, spill) — not vibes. The slowest query by cost × frequency is the target.
2. **Fix the shape, not the syntax:** filters pushed to the source, joins on clustered keys, fewer wide joins in favor of pre-conformed dimensions.
3. **Set budgets and watch for regressions:** per-query runtime/bytes budgets for the critical marts; a CI check on the expensive DAG paths. Regressions are reviewed like test failures.
4. **Report in money and minutes:** "this change cuts the nightly DAG by 18 minutes and ~$900/month" — engineers fund what they can read on an invoice.

## Rules

- Every recurring workload has a named owner and a rough monthly cost; unowned spend is unbounded spend.
- Performance work cites before/after from real profiles — never "should be faster".
