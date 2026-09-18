# Method: Isolation

**Owner profile:** test-automator · **Type:** procedure playbook

Prove that every test passes alone and in the suite, on any machine — and eliminate every dependency that makes that untrue.

## When to run

- New tests land; a flake appears; suite runtime or ordering changes; quarterly hygiene.

## Procedure

1. **Prove the baseline:** run each new/changed test alone (green), then the whole suite (green). Both facts recorded.
2. **Randomize the order** (the runner's `--shuffle` or equivalent) and run the suite a few times. Any new failure is an order dependence — find what state the earlier test leaked.
3. **Hunt the shared state:** singletons, module-level caches, DB rows, files, ports, env vars, locale/timezone assumptions, working directory. Each one either gets per-test setup/teardown or a documented reason to be shared.
4. **Kill sleeps:** any `sleep`/timeout-based waiting becomes a condition wait (`await eventually(...)`).
5. **Prove environment independence:** run the suite once in a container with a different OS/locale/core count than your daily machine. Differences are bugs in the tests (or the code).
6. **Wire it in:** order randomization + per-test isolation reporting run in CI on a schedule, not just once by hand.

## Rules

- A test that only passes in a specific order is two bugs: the hidden dependency and the false confidence.
- Isolation work never ends with "we'll remember which tests conflict" — the machine must remember, not people.
