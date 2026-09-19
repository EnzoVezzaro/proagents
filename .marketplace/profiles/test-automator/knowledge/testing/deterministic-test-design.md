# Reference: Deterministic Test Design

**Owner profile:** test-automator · **Covers:** "Deterministic test design" · **Type:** practice reference

A deterministic test fails **if and only if** the behavior it guards is broken. Every nondeterminism source is an enemy: time, randomness, ordering, concurrency, network, environment.

## The nondeterminism inventory

| Source | Smell | Fix |
|---|---|---|
| Wall-clock time | fails at midnight, month end, DST switch | inject a clock; assert on the injected timeline |
| Randomness | seed-dependent failures | fixed seed; or assert on properties, not values |
| Ordering | fails on parallel/CI-core-count differences | no shared mutable state; explicit ordering only when ordering *is* the behavior |
| Concurrency | passes alone, fails in suite; passes locally, fails in CI | real synchronization (await the condition), never sleeps |
| Network | depends on external services | stub at the boundary; contract tests cover the stub's honesty |
| Environment | passes on macOS, fails on Linux | path/case/line-ending hygiene; containerize the test env |

## Design rules

1. **One reason to fail.** If two different bugs can produce the same red test, split it — the test's message must be diagnostic on its own.
2. **Control time and randomness at the seams.** The test owns the clock, the RNG seed, and the temp directory; the code under test receives them.
3. **Wait on conditions, never durations.** `await eventually(() => visible(x))` — a `sleep(2000)` is both slow and flaky.
4. **Same result anywhere.** The test passes on any machine, any core count, any locale, any timezone. Verify once by running in a different environment than usual.
5. **Cleanup is part of the test.** Anything created (files, rows, ports) is torn down deterministically; leaked state becomes the *next* test's flake.

## The one-reason proof

Before merging a new test: break the guarded behavior on purpose (mutation or temporary revert). The test must fail with a message pointing at the behavior — then pass again when restored. A test you've never seen fail is not a test; it's decoration.
