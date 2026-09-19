# Reference: Internal Developer Platforms as Products

**Owner profile:** platform-engineer · **Covers:** "Internal developer platforms as products" · **Type:** practice reference

An internal platform has users, competitors (the workaround), churn, and a value proposition. Treat it with product discipline or its users route around it.

## The product model

- **Users:** app teams — with their own deadlines, skills, and opinions. The platform competes for their time against "just script it yourself".
- **Value proposition:** a team ships faster/safer on the platform than off it. This is measurable (see platform-adoption-measurement.md) and must actually be true.
- **Roadmap:** driven by user interviews, support tickets, and adoption data — not by what is fun to build. The loudest tenant is data, not the roadmap.

## Operating principles

1. **Paved roads first, guardrails second, gates last.** Make the right way easy, then visible, and only rarely mandatory — a mandate without merit breeds shadow infrastructure.
2. **Every abstraction has an owner and an SLO.** An abstraction nobody owns is a dependency with no pager — the worst kind.
3. **Self-service is the default.** If teams file tickets to get environments, the platform is a help desk with extra steps.
4. **Version and deprecate like a product:** breaking changes get versions, migration guides, and sunset dates. Tenants are customers, not captives.
5. **Support is part of the build:** every capability ships with docs, examples, and a support channel where answers come in hours, not weeks.

## The failure patterns

- Building for the demo, not the workload ("it works for the flagship service" ≠ platform).
- Abstraction layers that leak: tenants debug through four layers they can't see into.
- Success measured by tickets closed instead of tenant velocity gained.

## Rules

- Platform work cites its users: who asked, who piloted, who adopted.
- The workaround winning is product feedback, not a discipline problem — find out why it's faster.
