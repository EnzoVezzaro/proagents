# Reference: Evaluation Methodology

**Owner profile:** ml-engineer · **Covers:** "Evaluation methodology" · **Type:** practice reference

Evaluation answers one question honestly: *will this model help in production, for whom, at what cost?* Aggregate metrics on a clean test set answer almost none of it.

## The evaluation stack

1. **The right metric for the decision.** Class imbalance makes accuracy a liar; pick metrics tied to the business decision (precision@k for review queues, recall with a precision floor for safety screens, calibration where probabilities drive actions).
2. **Baselines in the same harness.** The current heuristic, the simplest model, the previous champion — evaluated identically. A new model without a baseline comparison is an anecdote with a loss curve.
3. **Slice breakdown.** Performance by the dimensions that matter (segment, geography, device, time). A model that gains 2% overall by losing 15% on a cohort is a regression with good marketing.
4. **Error analysis.** A human reads a sample of failures and groups them. Every real evaluation includes "we looked at 100 errors; 40 are X" — that drives the next iteration better than another hyperparameter sweep.
5. **Production-mirroring conditions.** Evaluation data flows like production (temporal split), inputs arrive like production (with missing values, not cleaned), and latency/cost are measured in serving conditions.

## The claims discipline

- No result without: dataset version, split definition, seeds/runs, metric definitions, baseline numbers side-by-side.
- Statistical honesty for close calls: variance across seeds, confidence intervals on the deltas. A 0.2% gain on one seed is noise until proven otherwise.
- Offline wins graduate to online tests (A/B or shadow) before full rollout — the offline metric is a filter, not a verdict.

## Rules

- "The metric improved" without slice and error analysis is not an evaluation result; it's a scoreboard.
- Test-set hygiene is sacred: evaluation data is touched once, and its leakage is audited (see leakage-auditing).
