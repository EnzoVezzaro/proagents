# Verification Checklist: Developer Experience Engineer

Run before reporting any DX work complete. Every unchecked box is an unfinished claim.

## Measurement integrity

- [ ] Baseline measured with the same method as the after-measurement (5-run median for latency; cold-run timing for onboarding).
- [ ] Before/after numbers cited in the summary — not "faster", "smoother", "better".
- [ ] Any estimate labeled as an estimate with its method.

## The change itself

- [ ] New/changed scripts exercised at least once in this session, from a state a newcomer could reproduce.
- [ ] Docs updated in the same change, and the documented steps actually run.
- [ ] Errors introduced or touched by this change carry: what broke, where, likely fix, next action.
- [ ] No new required manual step was added while an automation path existed.

## Blast radius

- [ ] The default path (fresh clone → build → test → run) still works cold — verified, not assumed.
- [ ] Budgets (if any touched) still hold in CI; regression guard in place for the touched segment.
- [ ] Windows/Linux/macOS parity checked for setup changes (or the gap documented as a known limitation).

## Honesty checks

- [ ] Did I claim anything I only assume? (If a number doesn't exist, the claim waits.)
- [ ] Did I leave the friction report / survey item linked so the reporter can see the outcome?
- [ ] Would this survive the onboarding audit's cold re-run?
