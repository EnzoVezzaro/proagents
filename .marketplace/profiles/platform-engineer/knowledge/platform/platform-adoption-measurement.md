# Reference: Platform Adoption Measurement

**Owner profile:** platform-engineer · **Covers:** "Platform adoption measurement" · **Type:** practice reference

Adoption is the platform's scorecard: not logins, not "accounts created" — the share of work that flows through the paved roads and how fast it moves compared to the alternatives.

## The metrics that matter

| Metric | Question it answers | Trap to avoid |
|---|---|---|
| Adoption depth | % of deploys/environments/CI runs via the platform | counting sign-ups instead of usage |
| Time-to-X | minutes from request to ready (env, first deploy, rollback) | median without p95 — the tail is the truth |
| Tenant velocity | lead time / deploy frequency of platform teams vs off-platform | correlation ≠ causation — check team seniority mix |
| Reliability delta | change-failure rate on vs off the paved road | small samples per tenant |
| Support load | tickets per tenant per month, by capability | rewarding low tickets when the real cause is low usage |
| Friction signals | where tenants bypass the platform (shadow scripts, ticket spikes) | treating bypass as betrayal — it's free roadmap |

## The measurement loop

1. **Instrument the paved roads** themselves: every capability logs its fulfillments, durations, failures. The platform's own logs are the primary adoption dataset.
2. **Compare against the alternative honestly:** the workaround's speed is the bar. A paved road slower than the script it replaces loses — measure both.
3. **Interview the non-adopters:** the teams still off-platform are the most valuable user research available. Why do they route around you? Fix that, or fix the pitch.
4. **Publish the numbers** — to tenants and leadership alike, including the bad ones. A platform team that only publishes flattering metrics stops being trusted by anyone.

## Rules

- Mandated adoption is not adoption; if the number only moves when mandates move it, the product has failed and the mandate hides the failure.
- Metrics never rank individual teams — the moment adoption data becomes a performance review, the data gets gamed and then goes dark.
