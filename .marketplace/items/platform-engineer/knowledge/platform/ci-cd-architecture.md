# Reference: CI/CD Architecture

**Owner profile:** platform-engineer · **Covers:** "CI/CD architecture" · **Type:** practice reference

CI/CD architecture is the design of the path from commit to production: its stages, its guarantees, its failure handling, and its latency budget per stage.

## The pipeline as a designed system

1. **Stages with contracts:** build (deterministic artifact), verify (tiered tests — see the test-automator's tiers), package (immutable, digest-addressed), deploy (reproducible, environment-parameterized), verify-again (health checks, smoke tests). Each stage: inputs, outputs, SLO, and a diagnosis block on failure.
2. **Artifacts are immutable and built once.** The artifact promoted to prod is bit-identical to the one tested — rebuilds between stages are a correctness risk wearing a convenience costume.
3. **Configuration is data, promotion is mechanical.** Environment differences live in values files/parameters; the pipeline moves the same artifact with different values. Manual "tweaks" in prod are banned and technically blocked.
4. **Deployment strategies are choices per service:** rolling, blue-green, canary with automated rollback gates. The strategy is declared in the service repo, not improvised by whoever ships on Friday.
5. **Secrets flow through the runtime boundary** (secret manager → environment), never through the pipeline's logs, artifacts, or cache.

## Platform-level concerns

- **Tenant isolation in CI:** one team's load test must not melt the shared runners; queue fairness and quotas are designed, not discovered.
- **Runner hygiene:** ephemeral runners, pinned images, dependency caching with correctness-safe keys.
- **Cost is a metric:** pipeline minutes per deploy is on the dashboard; unbounded growth gets engineered down like any latency.

## Rules

- Every stage has a latency budget and an ownership; the pipeline's end-to-end time is an SLO, not an accident.
- Rollback is a first-class path: any deploy can be reverted with one command, proven in a game day, not assumed.
- The pipeline never requires a human with tribal knowledge to ship — that human is a single point of failure.
