# Method: Paved Road Design

**Owner profile:** platform-engineer · **Type:** procedure playbook

Design the paved road: the supported, documented, monitored path for a recurring engineering task — and make it genuinely the fastest path so it wins on merit.

## When to run

- A recurring task appears three or more times with three different hand-rolled solutions; a compliance or reliability requirement needs a default; a new service type joins the fleet.

## Procedure

1. **Pick the task by repetition × pain:** something many teams do often, badly, and differently. One team's exotic need is a library, not a road.
2. **Study the existing workarounds:** collect the scripts, wikis and tribal rituals currently in use. They are the requirements document and the competitor — the road must beat them.
3. **Design the golden path end-to-end:** scaffold → develop → test → deploy → operate → decommission. A road that only covers the fun 80% (and leaves decommissioning in the woods) isn't done.
4. **Encode guardrails in tooling:** security baselines, resource limits, observability bundle, cost caps — enforced by the road's own scripts, not by a compliance deck.
5. **Pilot with 2–3 real teams** doing real work. Measure their time-to-X on the road vs their old path. Fix what the pilot exposes — the pilot exists to be embarrassing.
6. **Publish with numbers:** "preview envs: 3 days → 4 minutes" is the announcement; the feature list is the appendix.
7. **Staff the whole lifecycle:** docs, support channel, roadmap, deprecation policy. A road without maintenance becomes the toll road everyone routes around.

## Rules

- The road never wins by mandate alone; if adoption requires force, the design has failed and the mandate hides it.
- Every paved road has a named owner and an SLO — unpaged infrastructure is a liability with a logo.
