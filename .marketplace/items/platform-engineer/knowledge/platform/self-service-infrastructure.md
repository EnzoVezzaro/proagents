# Reference: Self-Service Infrastructure

**Owner profile:** platform-engineer · **Covers:** "Self-service infrastructure" · **Type:** practice reference

Self-service means a developer can get what they need — environment, database, deploy, rollback — by running a command or merging a config, in minutes, without a ticket and without talking to the platform team.

## The self-service ladder

| Level | Experience | Verdict |
|---|---|---|
| 0 | Ticket to platform team, days | help desk, not platform |
| 1 | Documented manual steps | docs debt, still days |
| 2 | One command, minutes | **self-service** |
| 3 | Merged config → environment, guarded by policy | product-grade |

Target level 3 for standard requests; level 2 is the floor.

## Designing a self-service capability

1. **Name the request** ("ephemeral preview env", "new service scaffold", "postgres instance"). One catalog entry per request — a catalog nobody can find is a secret menu.
2. **Encode the guardrails in the tooling:** resource limits, naming conventions, mandatory observability, cost caps. Policies enforced by the tool beat policies enforced by review meetings.
3. **Default to ephemeral and TTL'd.** Preview environments expire; databases are provided with sane defaults and a deletion path. Untagged resource cleanup runs automatically — the cloud bills you either way.
4. **Failures teach:** an error in the self-service flow prints what broke, why (quota? policy? name collision?), and the exact next action. A dead-end error turns self-service back into a ticket.
5. **Instrument usage:** who requests what, success rate, time-to-fulfilled, cost per capability. This data drives the platform roadmap (see platform-adoption-measurement.md).

## Rules

- A capability is not self-service until a developer who has never met the platform team completes it from docs alone — verified with a real user, not assumed.
- Every self-service capability has a deletion story; creation without deletion is how clouds get expensive and audits get exciting.
