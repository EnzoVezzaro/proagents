# Reference: Batch and Streaming Pipeline Design

**Owner profile:** data-engineer · **Covers:** "Batch and streaming pipeline design" · **Type:** practice reference

Pipelines are production systems: they have SLOs, failure modes, and consumers who build businesses on their output. Design them like it.

## Choosing the processing model

| | Batch | Streaming |
|---|---|---|
| Latency | minutes–hours | seconds |
| Correctness model | rerun the window | exactly-once / effective-once semantics |
| Cost profile | cheap at scale | always-on |
| Use when | freshness is measured in hours | freshness is the product (alerts, dashboards, fraud) |

The hybrid is the norm: streaming for the live surface, batch backfill for corrections and history. Design the two to produce **compatible semantics** — the same query should agree across paths, and the batch layer is the arbiter when they disagree.

## The design procedure

1. **Start from the consumer's question** ("daily revenue by region, fresh by 07:00"), not from the source system's tables. Work backwards to contracts: freshness, correctness, granularity.
2. **Model state explicitly:** what is aggregated, what is deduplicated, what is joined. State is where streaming systems die — know what lives there and how it recovers.
3. **Handle late and out-of-order data deliberately:** watermarks or window closes chosen and documented; corrections arrive via the batch path with a defined merge rule.
4. **Every pipeline has a freshness SLO and a monitoring query** ("is the latest partition present and non-trivial?") — staleness detection is automated, never discovered by a consumer's spreadsheet.
5. **Design for partial failure:** stages checkpoint; windows are idempotent; the rerun of any window is safe (see idempotency-and-replay.md).

## Rules

- A pipeline without an owner and an SLO is an orphan the moment its author changes teams.
- The batch backfill path exists for every streaming dataset — "we can't reprocess history" is an architecture bug, not a fact of life.
