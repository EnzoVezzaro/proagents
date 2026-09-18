# Reference: Feature Engineering and Leakage

**Owner profile:** ml-engineer · **Covers:** "Feature engineering and leakage" · **Type:** practice reference

Features are where domain knowledge becomes model signal — and where leakage hides. A feature that's too good to be true usually is.

## Feature engineering discipline

1. **Features are code:** versioned, tested, shared between training and serving. The serving path computes *the same feature values* from *the same definitions* — a feature store or shared library, never a reimplementation.
2. **Point-in-time correctness:** every historical feature value is computed with only what was knowable at prediction time. Aggregations join on event time, not on processing time — the "AS OF" join is the single most important pattern in the discipline.
3. **Defaults for missingness are part of the feature:** what does the model see when the value isn't there? Defined in the feature definition, not improvised by the serving framework.
4. **Documented semantics:** each feature carries an owner, a source-of-truth table, and a plain-language meaning. Features without documented meaning become technical debt that no one dares remove.

## The leakage taxonomy (audit all of them)

| Type | Shape | Classic example |
|---|---|---|
| Time leakage | future information in training features | "days since last purchase" computed over the full dataset |
| Group leakage | same entity in train and eval | user IDs split randomly across sessions |
| Target leakage | feature derived from the outcome | "cancelled" flag inside the pre-cancellation feature set |
| Processing leakage | aggregates computed over all data before splitting | global mean-encoding, scaler fit on train+test |
| Duplicate leakage | near-duplicate rows across splits | template documents, same image re-uploaded |

## Rules

- Split first, then fit every scaler/encoder/imputer on train only — enforced by pipeline structure, not by memory.
- Any feature with suspiciously strong signal gets a provenance audit before the result is believed.
- Train/serve skew is a defect with a test: recorded production inputs replayed through the training featurizer must match the served values.
