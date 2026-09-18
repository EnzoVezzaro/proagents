# Method: Baseline-First Evaluation

**Owner profile:** ml-engineer · **Type:** procedure playbook

Measure the simplest credible solution before any complex one — every model is judged against the baseline in the identical harness, and complexity must pay for itself in measured deltas.

## When to run

- Any new modeling task; any proposal to replace a heuristic with a model; any "let's try a bigger model" moment.

## Procedure

1. **Define the decision the model serves** and its metric (see evaluation-methodology) — "reduce manual review load with precision ≥ current, at recall ≥ +10pt" beats "improve accuracy".
2. **Build the baseline honestly:**
   - Tier 0: the current heuristic/rule band, measured — not remembered.
   - Tier 1: the dumbest credible model (majority class, historical mean, logistic regression on 3 obvious features).
   - Both run in the *final* evaluation harness — a baseline measured on a different split/metric is a straw man.
3. **Freeze the harness:** dataset version, split definition, metric implementations, slice suite. Every model — baseline or flagship — runs in exactly this harness, unchanged.
4. **Evaluate candidates in the harness:** identical treatment, identical slices, identical seeds; variance across runs reported.
5. **Decide on deltas with uncertainty:** is the complex model's gain over the simple one larger than seed-to-seed variance? If not, the simple model wins — and the burden of proof returns to complexity.
6. **Record the comparison table** (baseline vs candidates, per slice) as the deliverable; it travels with every subsequent claim about the model.

## Rules

- Complexity is a cost: serving burden, skew risk, explainability loss. It must buy measured performance, not prestige.
- "We skipped the baseline because we know it's worse" is the sentence that precedes most wasted GPU months.
