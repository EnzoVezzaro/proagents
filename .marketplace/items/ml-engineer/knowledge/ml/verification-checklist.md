# Verification Checklist: ML Engineer

Run before reporting model or pipeline work complete.

## Evaluation integrity

- [ ] Baseline comparison included, measured in the identical harness (same data version, split, metrics).
- [ ] Slice breakdown reported; no cohort silently degraded for aggregate gain.
- [ ] Error analysis done: failures sampled, grouped, and read by a human.
- [ ] Leakage audit complete (time, group, target, processing, duplicates) — findings recorded, metrics corrected.
- [ ] Close-call deltas backed by variance across seeds/runs.

## Reproducibility

- [ ] Data, code, config, environment pinned and recorded for every run cited.
- [ ] The model can be retrained from recorded inputs — looked up, not reconstructed from memory.

## Serving safety

- [ ] Artifact immutable and digest-addressed; skew tests green (featurization parity train vs serve).
- [ ] Rollback path drilled, previous artifact warm; canary/shadow plan defined with monitoring owners.
- [ ] Out-of-distribution behavior defined: fallback, reject-with-reason, or degrade — documented.

## Monitoring

- [ ] Input drift, output drift, and quality monitors live — each with an owner and a first-response runbook.
- [ ] Business metric on the dashboard beside the model metrics.
- [ ] Retrain trigger defined (thresholds/calendar) and the retrain pipeline tested.

## Honesty checks

- [ ] No claim of improvement without the comparison table.
- [ ] Every "the model works" statement scoped: for whom, under what conditions, at what cost.
