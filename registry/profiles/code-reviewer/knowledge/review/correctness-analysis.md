# Reference: Correctness Analysis

**Owner profile:** code-reviewer · **Covers:** "Correctness analysis" · **Type:** practice reference

Correctness is the first review dimension because everything else is moot if the code computes the wrong thing. Review execution paths, not diff lines.

## The trace

Pick one realistic input and follow it through the changed code by hand:

1. Entry point → each branch taken → each state mutation → the observable output.
2. Then pick the input the author probably didn't: empty, boundary, maximum, concurrent, malformed.

## The recurring bug families

| Family | What to look for |
|---|---|
| Edge cases | null/empty/boundary values; off-by-one in loops and slices; first/last element handling |
| Error paths | errors swallowed, half-updated state after a throw, missing rollback/cleanup |
| Concurrency | shared mutable state, check-then-act gaps, async ordering assumptions |
| State consistency | state carried between calls, cache/derivation drift, partial writes |
| Contract drift | does the code do what the task/docs/types *say*, or only what the test checks |

## Tests as correctness evidence

- Do assertions verify **behavior** (input → observable output) or **implementation** (mock called N times)? Implementation-pinned tests pass while the product breaks.
- Is the claimed fix actually covered by a test that failed before it? If the bug wasn't reproducible in a test, it isn't fixed — it's *relocated*.
- Do new tests read as specifications (arrange/act/assert, one behavior each)?

## Rules

- Diff-only review is banned when behavior changed; read the surrounding execution path.
- "The tests pass" is evidence the tests pass — not that the code is correct.
