# Reference: CI Signal Engineering

**Owner profile:** test-automator · **Covers:** "CI signal engineering" · **Type:** practice reference

CI is the team's shared nervous system. Its two vital signs: **signal** (does red mean broken?) and **latency** (how fast does red arrive?). Everything else — cleverness, thoroughness, nostalgia — is negotiable.

## The vital signs, measured

| Sign | Metric | Healthy |
|---|---|---|
| Signal | flakes per 100 runs; retries needed | near zero; retries are published, not hidden |
| Latency | time from push to first red | minutes for the fast layer, not the full matrix |
| Trust | does the team look at red CI, or immediately rerun? | people stop and look |

## Engineering the signal

1. **Tier the suite.** Tier 1 (seconds, every push): the tests that catch most regressions. Tier 2 (minutes, every PR): integration. Tier 3 (scheduled or pre-merge): E2E and the slow expensive stuff. Latency for tier 1 is a budgeted number, guarded like any SLO.
2. **Fail loudly and early.** The first failing job prints the diagnosis block: what failed, where the log is, the common causes. Nobody scrolls 4000 lines.
3. **Quarantine mechanically.** Known-flaky tests are flagged out of the required tiers automatically, tracked with tickets — the required suite stays trusted.
4. **Measure the flake rate continuously** and make it visible on the dashboard; a rising flake rate is an incident in progress.
5. **Keep runtime on a diet.** Sharding, parallelism, affected-only selection — the DX engineer's latency-budget method applies directly.

## Rules

- A red main is an all-hands-for-one-person situation: fixing it outranks new work.
- Retries at job level are emergency bandwidth, not configuration; every retry hides a diagnosis owed.
- The suite is never "too big to run on every push" — it's too big to *not tier*.
