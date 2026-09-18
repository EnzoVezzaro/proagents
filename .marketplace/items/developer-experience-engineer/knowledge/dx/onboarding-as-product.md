# Reference: Onboarding as a Product

**Owner profile:** developer-experience-engineer · **Covers:** "Onboarding as a product" · **Type:** practice reference

Onboarding is the developer journey's acquisition funnel. Treat it like product onboarding: designed, measured, iterated, and owned.

## The product lens

- **Activation metric:** a contributor is "activated" when they have merged their first PR. Time-to-activation is the headline number.
- **Funnel stages** come from the journey map (see journey-mapping.md). Onboarding work targets the biggest drop-off, not the most documented step.
- **Users test the product:** the onboarding-audit playbook (cold, timed, evidence-capturing) is the usability test. Run it on every major tooling change and at least quarterly.

## What "good" looks like

1. **One command to a running system.** `git clone && ./bin/setup` reaches a green local run with no hidden prerequisites; anything the script can't automate is printed, with a link to why it exists.
2. **A first task that can be finished in one session.** The good-first-issue queue is curated: small, scoped, with a pointer to the exact files and the expected shape of the change.
3. **Errors teach.** Setup failures print what broke, the likely cause, and the fix — a setup error a newcomer can't act on is a bug in the setup.
4. **The docs match the cold run.** Docs are generated or verified from the same script that new contributors run; drift between them is a build failure, not a footnote.

## Rules

- Onboarding changes cite before/after time-to-activation or checkpoint timings — feelings don't ship.
- "Works on my machine" is the definition of failure here, not a defense.
- Setup steps that exist "for historical reasons" get investigated or deleted every quarter.
