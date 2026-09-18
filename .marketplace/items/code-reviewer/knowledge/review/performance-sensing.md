# Reference: Performance Sensing

**Owner profile:** code-reviewer · **Covers:** "Performance sensing — N+1 patterns, unbounded loops, sync-where-async-needed, redundant re-renders, missing pagination" · **Type:** practice reference

Review-time performance work is pattern recognition, not optimization: spot the shapes that become incidents at production scale, and demand evidence proportional to the risk.

## The shapes that recur

| Shape | Smell | The question to ask |
|---|---|---|
| N+1 | a query/IO call inside a loop over results | how many round-trips for N items? batch or join? |
| Unbounded work | loop over user-controlled collection; no LIMIT on list endpoints | what's the worst-case count? who caps it? |
| Sync where async matters | awaited sequential calls that could parallelize; blocking IO in a request path | is this in the hot path? what's the added latency × traffic? |
| Redundant recompute/re-render | derived value rebuilt per item; component re-rendering on unrelated state | is the derivation memoizable without risk? |
| Missing pagination | list endpoints returning "all" | what happens at 10k rows? 1M? |
| Hidden allocation | building the full result set to return one page | can it stream / early-exit? |

## Calibrating the response

- **Hot path × realistic scale × cheap fix** → Required: "this is O(n²) on the 10k-row path; here's the O(n) shape".
- **Cold path or small n forever** → Suggested, or nothing. Performance review that blocks on micro-optimizations teaches people to ignore performance review.
- **Can't tell?** Ask for the number that would settle it (measured latency, row counts, profile) — before blocking, not after.

## The budget connection

Recurring hot-path shapes deserve budgets (see DX engineer's inner-loop work for the method). A pattern the reviewer flags three times in a quarter is a budget candidate, not a review comment.

## Rules

- Every performance finding states the scale at which it hurts; findings without a scale are taste.
- "Add caching" is not a fix until invalidation is answered — a stale cache is a correctness bug wearing a performance costume.
