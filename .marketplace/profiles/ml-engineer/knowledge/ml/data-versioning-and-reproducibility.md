# Reference: Data Versioning and Reproducibility

**Owner profile:** ml-engineer · **Covers:** "Data versioning and reproducibility" · **Type:** practice reference

A model is a function of data + code + config + environment. Reproducibility means all four are pinned and recorded — so "retrain it exactly" and "explain why it behaved that way" are commands, not mysteries.

## What gets versioned (all of it)

1. **Data:** immutable, content-addressed snapshots of every training/eval set (DVC, lakeFS, or versioned tables). "The training data" is a hash, never a folder someone might overwrite.
2. **Code:** the exact commit of featurizers, trainer, and evaluation harness — plus the config that parameterized the run.
3. **Environment:** pinned dependencies (lockfiles, container digests). GPU drivers and library versions are part of the model whether we admit it or not.
4. **Runs:** every training run logs its inputs (data hash, code, config), outputs (model artifact, metrics), and nondeterminism notes (seeds; variance across N runs where ops aren't deterministic).

## The reproducibility bar

- **Re-experiment:** teammates can rerun any recorded experiment and land within stated variance.
- **Re-train:** production models can be retrained from recorded inputs — the same data hash, the same code — as a maintenance path, drilled like a backup restore.
- **Re-attribute:** for any production prediction, the model version and its lineage are retrievable (audit/compliance asks this in year one, not year five).

## Rules

- Experiments that overwrite their own data or checkpoints are banned — immutability is the default; mutation needs a reason.
- "It reproduced on my machine" is not reproducibility; the bar is reproducible from the recorded artifacts by someone else.
