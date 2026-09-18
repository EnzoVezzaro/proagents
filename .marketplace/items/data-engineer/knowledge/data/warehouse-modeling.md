# Reference: Warehouse Modeling

**Owner profile:** data-engineer · **Covers:** "Warehouse modeling" · **Type:** practice reference

Warehouse modeling is the craft of arranging data so the business's recurring questions are cheap, unambiguous, and consistent — no matter which tool asks them.

## The layered model

| Layer | Content | Rules |
|---|---|---|
| Staging (raw) | source data as-landed, typed, 1:1 with source | append-only; no business logic; reproducible from source |
| Intermediate | cleaned, joined, conformed | disposable; rebuildable from staging; minimal |
| Marts (modeled) | dimensional models answering domain questions | the contract layer: tested, documented, versioned |

Consumers touch marts (and only marts). Every mart table has an owner, a freshness SLO, and a definition of each metric — the same number must not exist with two meanings.

## Dimensional modeling essentials

1. **Grain first:** declare what one row *is* ("one line item on one order") before writing columns. Grain drift is the root of most double-counting incidents.
2. **Facts are additive where possible:** store the atomic quantities; let consumers sum. Pre-aggregated "totals" in facts are how periods stop adding up.
3. **Dimensions are the join vocabulary:** conformed across marts (the same `dim_customer` everywhere), SCD strategy chosen deliberately (type 2 for history that must survive source updates).
4. **Slow changes and corrections have documented paths:** restatements are announced, versioned, and idempotent — consumers should never be surprised by a silent rewrite of history.

## Modeling hygiene

- One source of truth per metric: `revenue` means one thing, in one place, with a docstring others reference — synonyms get retired.
- Tests as models: nullability, uniqueness, referential integrity, freshness — declared alongside the model, run in CI.

## Rules

- No mart ships without grain documentation and quality tests — untested models are rumors with schemas.
- Logic that exists in two places is wrong in one of them; conformance beats copy-paste even at the cost of a refactor.
