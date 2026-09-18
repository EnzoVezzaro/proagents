# Method: Inner-Loop Latency Budget

**Owner profile:** developer-experience-engineer · **Type:** procedure playbook

Treat the edit→verify cycle as a latency-critical path with an explicit budget, the way performance engineers treat page load.

## When to run

- Build, test or hot-reload latency is reported as painful, or a `dx-budgets` request lands.
- Any change to build/test tooling that could move loop latency.
- Scheduled re-check when the default test suite grows.

## Procedure

1. **Measure the loop as developers actually run it:** edit one file → run the unit tests for that area → see the result. Time it 5 times; report median and worst.
2. **Segment the loop** — change detection, compile/transform, test collection, test execution, reporting. Instrument each segment once before optimizing anything; whole-loop numbers hide the real cost.
3. **Set budgets per segment.** Example: detect 0.2s · compile 1.5s · collect 0.5s · run 5s · report 0.3s. Encode them in CI as warnings at minimum.
4. **Attack the largest segment with the boring fix first:** narrow test selection, parallelize, cache transforms, move slow tests out of the default loop. Exotic rewrites come last.
5. **Re-measure with the same 5-run method.** A change that does not move the median is reverted, not kept.
6. **Guard the budget:** a CI job fails (or warns loudly) when the loop regresses past budget. An unguarded budget is a suggestion.

## Rules

- No optimization without segment-level measurement.
- Caches must be correctness-safe: an invalidation bug that lets a stale run pass is a data-loss-class bug.
- Budget changes are decisions, not drift — record who agreed to the new number and why in the PR.
