# Reference: Mobile Observability

**Owner profile:** mobile-engineer · **Covers:** "Mobile observability" · **Type:** practice reference

You can't SSH into a user's phone. Mobile observability is what you ship *inside the binary* so that "it's slow" and "it crashes" from a user in the wild becomes a reproducible, ranked, owned defect.

## The instrumentation baseline

1. **Crashes with readable stacks:** symbolicated, grouped by root cause, de-duplicated across builds; release binaries ship with mapping files uploaded at build time — symbolication is part of the release checklist, not an archaeology project.
2. **Performance metrics per release:** cold/warm launch (p50/p95), screen render times, jank rates, memory highs — compared against the previous release, trended across versions.
3. **Non-fatals and error paths:** caught exceptions, sync failures, API error rates — the quieter cousins of crashes; their trends are release gates too.
4. **Release health:** crash-free sessions/users, adoption curve per rollout stage, per-OS and per-device splits. "Crash-free 99.2% on the new release" is a sentence with a number in it.
5. **Funnel metrics for key flows:** signup, checkout, sync — where users stall is a product signal and an engineering signal at once.

## Designing for the field

- **Logs are local-first and privacy-aware:** ring-buffered on device, attached to crash reports with PII redaction — debugging info without building a surveillance system.
- **Feature flags carry telemetry:** every flag's state rides the crash report; "which variant crashed?" is answerable from the report alone.
- **A/B and rollout stages get health checks before widening:** the staged rollout halts on breach (see release-engineering), and the metrics that trigger halting are defined *before* the rollout starts.

## Rules

- No release ships without: mapping files uploaded, dashboards live, halt criteria defined.
- Every crash triage names an owner and a verdict (fixed / wontfix / investigated); unowned crash clusters are the definition of technical debt in the field.
