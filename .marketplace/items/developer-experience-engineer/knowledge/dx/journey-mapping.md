# Reference: Developer Journey Mapping

**Owner profile:** developer-experience-engineer · **Covers:** "Developer journey mapping" · **Type:** practice reference

The developer journey is the funnel from zero to a merged PR. Map it like a product funnel: stages, drop-offs, instrumentation, owners.

## The canonical stages

```
clone → install → configure → build → test → run locally → change something → verify → open PR → merged
```

Every stage has: an expected duration, a measured duration, and a known failure mode list. A stage with no numbers is unmapped.

## How to map it

1. **Instrument each stage** with a command that reports its own duration (`time npm ci`, build timing output, CI step timings). If a stage can't self-report, wrap it in a script that logs.
2. **Collect real numbers** from a cold run (fresh container or CI) — warm-machine numbers flatter and hide stalls.
3. **Find the drop-off points:** where do new contributors stall in the onboarding-audit? Where do CI runs most often fail on the first attempt? Those are the stages to attack.
4. **Give every stage an owner** (or own it yourself) — unowned stages rot silently.
5. **Re-map after any tooling change** — journey maps decay as fast as dependency trees.

## Using the map

- Improvements target the **worst ratio of (time cost × people hit) to fix effort**, never the most interesting problem.
- The map is the shared picture that turns "everything is slow" into "install takes 9 minutes because of X" — which is fixable.

## Rules

- No stage is "done" until its expected duration matches reality within tolerance.
- Journey data lives in the repo (docs or benchmark outputs), not in someone's memory.
