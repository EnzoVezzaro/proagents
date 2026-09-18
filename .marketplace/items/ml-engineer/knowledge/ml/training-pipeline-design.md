# Reference: Training Pipeline Design

**Owner profile:** ml-engineer · **Covers:** "Training pipeline design" · **Type:** practice reference

Training pipelines turn raw data into a reproducible model artifact. Design them like data pipelines with a science experiment inside: deterministic where possible, versioned everywhere, auditable always.

## The pipeline's stages (each versioned, each testable)

```
ingest → validate → preprocess/featurize → split → train → evaluate → register
```

1. **Ingest + validate:** quality gates on the training data (schema, volume, distribution bands) before compute is spent. Garbage-in costs a GPU-hour to discover, not a row.
2. **Preprocess as versioned code:** every transformation is a reviewed, tested function — no notebook-lore transforms that exist only in someone's session. The preprocessing artifact is what serves in production too; train/serve skew dies here or nowhere.
3. **Splits are designed, not default:** temporal splits when time matters (usually), stratification where classes are thin, and group-aware splits when entities repeat across rows. The split function is code with tests.
4. **Train deterministically where the budget allows:** seeds, pinned environments, deterministic ops. Non-determinism is documented with its variance across N runs.
5. **Evaluate against the registered baselines** and the slice suite — an aggregate metric alone does not promote a model.
6. **Register the artifact** with its lineage: data version, code commit, config, metrics. "Which data and code produced the model in prod?" must be a lookup, not an investigation.

## Rules

- A model that cannot be retrained from its recorded inputs is an artifact nobody can maintain.
- Notebook experiments are for exploration; anything promoted to production moves into the pipeline, reviewed and tested.
