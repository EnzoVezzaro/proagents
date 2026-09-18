# Method: Flake Quarantine

**Owner profile:** test-automator · **Type:** procedure playbook

Take a flaky test out of the required suite *without* deleting the information it carries: diagnosis attached, ticket open, review date set, return-or-die decision made.

## When to run

- Any test fails non-deterministically in CI more than once without an immediately obvious cause.

## Procedure

1. **Confirm the flake:** reproduce per the flake-diagnosis procedure (20× alone, 20× suite, 20× CI). One red in a hundred runs is still a flake — count before claiming.
2. **Capture the evidence:** links to the failed runs, the failure modes seen, the conditions diff. This block travels with the ticket.
3. **Diagnose to a category** (systematic: shared state / order / environment; stochastic: timing / external). If the category isn't reachable in ~30 minutes of work, quarantine now, diagnose inside the ticket.
4. **Quarantine mechanically:** move to the quarantined tier (still runs, doesn't block), annotate the test with the ticket ID so the skip is self-documenting.
5. **Set the return-or-die date:** at the review date the test is either fixed (root cause removed, 100 consecutive green runs) or deleted. Quarantine is a ward, not a retirement home.
6. **Report the quarantine** in the team channel — a silenced alarm must be a recorded decision, visible to everyone who relied on it.

## Rules

- Quarantine without a ticket ID in the annotation is banned — orphan skips are how suites rot invisibly.
- The flake rate of the required suite is the metric; quarantining reduces noise, but only root-cause fixes reduce flake.
- Re-quarantining the same test twice triggers escalation: the cause hunt gets senior eyes and time.
