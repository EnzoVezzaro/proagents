# Reference: Observability Baselines

**Owner profile:** platform-engineer · **Covers:** "Observability baselines" · **Type:** practice reference

The platform ships with observability pre-wired: every service onboarded to it starts with metrics, logs, traces and dashboards that answer "is it healthy?" before the first deploy — because asking each team to invent that is how you get forty monitoring philosophies.

## The baseline bundle

Every service on the platform gets, by default:

1. **The four golden signals** — latency, traffic, errors, saturation — exported in a standard format with standard label names (`service`, `env`, `tenant`, `version`).
2. **Structured logs** with trace correlation: one `trace_id` joins the log line, the span, and the alert.
3. **A generated dashboard** per service: golden signals, deploy markers, and the service's own SLO burn (if declared).
4. **Health checks with meaning:** liveness = "the process is wedged, restart it"; readiness = "this instance can serve traffic". Conflating them is how cascading restarts happen.
5. **Alert routing with an owner:** alerts must name a human or a team queue; orphan alerts get deleted, not ignored.

## Platform team's own observability

- The platform monitors itself: runner queue times, pipeline SLOs, self-service fulfillment latency, cost per capability. The platform's outages are tenant outages — its SLOs are real.
- Every abstraction's failure modes are observable: when the deploy tool errors, the dashboard shows the error class spike before the first ticket arrives.

## Evolution without chaos

Teams extend the baseline (custom metrics, business KPIs) — they never *replace* it. The standard labels and health-check semantics are platform API: versioned, documented, backwards-compatible.

## Rules

- A service cannot deploy through the platform without the baseline bundle — that is the point of a platform.
- Dashboards answer questions; if a dashboard has no question it answers, it is decoration and gets removed.
