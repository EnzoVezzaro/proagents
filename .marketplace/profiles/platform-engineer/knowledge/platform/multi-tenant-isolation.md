# Reference: Multi-Tenant Isolation

**Owner profile:** platform-engineer · **Covers:** "Multi-tenant isolation" · **Type:** practice reference

Multi-tenancy means one tenant's load, failure, or misbehavior must never become another tenant's incident. Isolation is designed at every layer — compute, data, network, and blast radius.

## The isolation dimensions

| Layer | Risk | Mechanism |
|---|---|---|
| Compute | noisy neighbor CPU/mem; runaway jobs | quotas + limits, per-tenant queues, fair scheduling, dedicated pools for hot tenants |
| Data | cross-tenant reads; backup/restore mixing | row-level security or schema/db-per-tenant; tenant ID on every query, enforced not assumed |
| Network | lateral movement, eavesdropping | namespaces/segments, mTLS, egress policies |
| Config/build | leaked secrets across tenants | scoped credentials, per-tenant secret paths, no shared tokens |
| Blast radius | one tenant's deploy breaking others | canary per tenant cohort, graceful degradation modes |

## The design procedure

1. **Choose the isolation model per tier deliberately:** shared-everything (cheap, weak), shared-compute/isolated-data (default), dedicated (expensive, strong). The choice is written down per tenant tier with its cost and risk trade-offs.
2. **Make the tenant ID load-bearing:** authenticated, validated, and attached at the boundary — every request, every job, every log line. Tests include the cross-tenant probe: can tenant A's token read tenant B's resource? The answer must be mechanically no.
3. **Plan the noisy-neighbor response before it happens:** quotas, throttling with clear error semantics, and a documented path to dedicated capacity for the tenant that outgrows sharing.
4. **Test isolation like a feature:** load one tenant to its quota and prove the others' SLOs hold. Backup/restore drills include the "restore tenant X only" case.

## Rules

- Cross-tenant access attempts are security findings, not bug reports — severity and evidence attached.
- "We'll add quotas when it becomes a problem" is how the first noisy neighbor becomes a company-wide outage.
- Every shared component (queue, cache, DB pool) has a per-tenant fairness story, or it doesn't host multiple tenants.
