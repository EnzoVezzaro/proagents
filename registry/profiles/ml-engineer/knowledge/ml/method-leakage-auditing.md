# Method: Leakage Auditing

**Owner profile:** ml-engineer · **Type:** procedure playbook

Audit a dataset, its features, and its splits for every leakage class *before* results are believed — because a leaked evaluation flatters the model, ships it, and defers the discovery to production.

## When to run

- Before trusting any evaluation result; whenever a feature is "suspiciously" predictive; after any dataset rebuild; when train metrics and production reality diverge.

## Procedure

1. **Reconstruct the timeline.** For a sampled prediction, list what was knowable at prediction time. Every feature's value must be computable from that knowledge set — anything requiring the future (outcome, post-hoc fields, "total" aggregates including later events) is time leakage.
2. **Trace each feature to its source.** Fields derived from the target (directly or through a business process: "refunded" flags, "closed by agent X" fields, chargeback markers) are target leakage — document and drop or re-point to point-in-time sources.
3. **Audit the splits.** Entities repeated across rows (users, documents, cards) must not straddle train/eval — group-aware splits. Near-duplicates across splits (templates, re-uploads) counted and handled.
4. **Audit the preprocessing order.** Scalers, encoders, imputers, feature selectors: fit on train only, enforced by pipeline structure. Global statistics computed before splitting are processing leakage.
5. **Run the "too good" test.** AUC/accuracy wildly above domain plausibility triggers a per-feature importance review: the top feature's provenance gets the same trace as step 2.
6. **Compare against production.** Offline metrics far above online/shadow performance is the classic leakage symptom — investigate the delta, don't celebrate the offline number.
7. **Record the audit:** leakage classes checked, findings, actions taken. The audit travels with the evaluation, so "did we check?" is a lookup.

## Rules

- An evaluation without a leakage audit is a hypothesis, not a result.
- Fixing leakage drops your metrics — that's the point; report the corrected numbers without nostalgia.
