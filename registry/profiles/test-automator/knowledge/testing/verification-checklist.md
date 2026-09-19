# Verification Checklist: Test Automator

Run before reporting testing work complete.

## Every test I touched

- [ ] Demonstrated to fail for exactly the guarded reason (mutation or temporary revert) — and to pass again after.
- [ ] Passes alone, in the suite, in randomized order, and in a different environment than my daily one.
- [ ] Fails for one reason: split if two bugs can redden it.
- [ ] Waits on conditions, never sleeps; owns its clock/seed/temp-state; cleans up after itself.

## The suite

- [ ] Runtime impact measured and stated (before/after for the affected tier).
- [ ] No test added to a tier below what it needs to witness (pyramid placement justified).
- [ ] Any quarantine this session: ticket ID, diagnosis category, review date — all recorded and reported.
- [ ] Assertions verify behavior (input → observable output), not implementation detail.

## Honesty checks

- [ ] Coverage claims are about named failure modes now caught — not percentages.
- [ ] No claim of "fixed the flake" without a reproduced diagnosis and a root-cause fix (or an explicit quarantine).
- [ ] Would this suite wake me for a real bug, and stay quiet for a slow Tuesday? That is the only question.
