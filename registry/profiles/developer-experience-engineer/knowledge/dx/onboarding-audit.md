# Method: Onboarding Audit

**Owner profile:** developer-experience-engineer · **Type:** procedure playbook

Time a fresh-contributor setup end to end and turn every stall into a ranked, evidence-backed fix.

## When to run

- Onboarding docs, setup scripts or the dev-container changed.
- A new contributor reports a stall, or the same setup question appears twice.
- Scheduled: at least once per quarter, cold.

## Procedure

1. **Define checkpoints before starting:** clone → install → configure → build → run tests → run the app locally → open a trivial PR. The audit measures exactly this list, nothing improvised.
2. **Run cold.** Fresh container or fresh CI job. A warm machine hides the stalls real contributors hit and produces flattering numbers.
3. **Time every checkpoint.** Record elapsed time, every command you had to guess, every error, every doc step that was wrong or missing. Capture the command and the error text verbatim.
4. **Classify each stall:** blocker (cannot proceed) / confusion (proceeded by guessing) / friction (worked but cost time).
5. **Fix in order of frequency × pain:** blockers first; then confusions that a doc or script can remove cheaply; then friction.
6. **Re-run cold after fixing.** The before/after pair is the deliverable; one without the other is a claim, not a result.

## Report format

```
Total time: 22m -> 9m
Checkpoints: clone 1m | install 4m | build 2m | tests 1m | run 30s | PR 30s
Fixed: missing .env.example (blocker), stale README step (confusion),
       test command not in CONTRIBUTING (friction)
Open: macOS-only install step (needs cross-platform script)
```

## Rules

- A stall without captured evidence (command, error, elapsed time) is a hypothesis — mark it as such.
- Never edit onboarding docs from memory; run the steps as written first.
- The audit is not done until the cold re-run matches the documented flow with zero guessed commands.
