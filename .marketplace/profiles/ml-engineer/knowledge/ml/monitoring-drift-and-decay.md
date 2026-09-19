# Reference: Monitoring for Drift and Decay

**Owner profile:** ml-engineer · **Covers:** "Monitoring for drift and decay" · **Type:** practice reference

Models decay silently: the code is fine, the SLOs are green, and the predictions get worse because the world moved. Monitoring exists to make that decay loud while it's still cheap.

## What to monitor (three layers)

1. **Input drift:** feature distributions vs the training snapshot (PSI/KL, per-feature, sliced). Drifting inputs are the earliest warning — they fire before quality does.
2. **Output drift:** prediction distributions and rates (positive rate, score bands, per slice). A sudden rate change is often a business event or a pipeline break, not the model "learning".
3. **Quality decay:** true performance where ground truth exists (delayed labels are normal — monitor the lag and evaluate on the matured cohort). Where truth is slow or absent, proxy metrics + sampled human review carry the signal.

## The alerting design

- **Thresholds with owners:** each monitor names who gets paged and what the first response is (rollback? investigate data? freeze retrain?).
- **Business metrics on the same dashboard:** the model serves a decision — monitor that decision's outcome (conversion, fraud caught, handle time). Model metrics without the business metric allow slow failures nobody notices for a quarter.
- **Retrain triggers defined in advance:** drift threshold, quality floor, or calendar — with a retrain pipeline that is itself tested and replayable. Scheduled retraining with no trigger awareness just automates decay tracking.

## The loop

Decay findings feed the next iteration: the slice that degraded, the input that drifted, the error types sampled — straight into the evaluation suite as new named slices (see evaluation-methodology.md).

## Rules

- A production model without input/output monitoring is an unmonitored dependency on the world staying frozen — banned.
- "Retrain and ship" is not a fix until the drift cause is understood; sometimes retraining enshrines the new bug.
