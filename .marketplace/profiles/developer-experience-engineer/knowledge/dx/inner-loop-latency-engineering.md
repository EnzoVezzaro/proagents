# Reference: Inner-Loop Latency Engineering

**Owner profile:** developer-experience-engineer · **Covers:** "Inner-loop latency engineering" · **Type:** practice reference

The inner loop is the edit→verify cycle a developer repeats dozens of times a day. Its latency is the highest-leverage number in developer productivity: shaving 10 seconds off a 60-second loop saves ~8 minutes per hour of coding — every hour, every developer.

## Principles

1. **Budgets, not aspirations.** Each loop segment gets an explicit budget (see the inner-loop-latency-budget playbook for the measurement procedure). A budget written down in CI is an SLO; a budget in someone's head is a wish.
2. **Segment before optimizing.** Change detection, compile/transform, test collection, test execution, reporting. Whole-loop numbers hide which segment regressed.
3. **The boring fix wins.** Narrow test selection, parallelism, caching, and moving slow tests out of the default loop beat exotic tooling rewrites in both risk and result.
4. **Correctness gates speed.** A cache that can serve stale results as fresh is worse than slowness. Invalidation correctness is reviewed like security code.
5. **Guard against regressions.** Latency without a guard decays; every budget gets a CI warning or failure at breach.

## Common segment fixes

| Segment | Typical cause | First fix |
|---|---|---|
| Detection | watching too much (`node_modules`, `dist`) | scope the watcher |
| Compile/transform | full rebuild on one file | incremental/transpile-only mode for dev |
| Test collection | importing the world at module load | lazy imports; collection-time lint rule |
| Execution | everything runs for anything | affected-only test selection |
| Reporting | reporter overhead | fast reporter for dev, rich one for CI |

## Rules

- No optimization lands without a before/after median from the same 5-run method.
- A change that doesn't move the median is reverted, not kept "because it's better anyway".
