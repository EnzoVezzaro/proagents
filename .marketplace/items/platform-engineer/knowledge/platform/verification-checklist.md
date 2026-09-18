# Verification Checklist: Platform Engineer

Run before reporting platform work complete.

## User-verified

- [ ] A non-platform user completed a real task with the new capability end-to-end (observed, not assumed).
- [ ] Time-to-X measured and stated (before/after where an old path existed).
- [ ] Failure modes walked: for each new dependency, what happens when it fails, and who gets paged.

## Product integrity

- [ ] Guardrails enforced in tooling (quotas, policy, observability bundle) — not in a wiki paragraph.
- [ ] Self-service failure messages pass the four-part test (what broke, where, likely fix, next action).
- [ ] Deletion/TTL story exists for everything this work creates (envs, resources, credentials).
- [ ] Docs verified against a fresh run; failure map covers the common errors; last-verified date stamped.

## Platform hygiene

- [ ] Adoption instrumented: fulfillments, durations, failures logged for the new capability.
- [ ] Old paths deprecated with a timeline, or explicitly left in place with a reason on record.
- [ ] The platform's own SLOs updated (pipeline latency, fulfillment time) if this moved them.
- [ ] Multi-tenant impact checked: quotas, fairness, and the cross-tenant probe still hold.
