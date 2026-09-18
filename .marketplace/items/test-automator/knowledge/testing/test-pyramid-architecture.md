# Reference: Test Pyramid Architecture

**Owner profile:** test-automator · **Covers:** "Test pyramid architecture" · **Type:** practice reference

The pyramid is an economic model: cheap, fast, stable tests at the bottom carry most of the verification; expensive, slow, brittle tests sit at the top only where they're the sole witnesses of correct behavior.

## The layers and their contracts

| Layer | Verifies | Target share | Failure meaning |
|---|---|---|---|
| Unit | one function's logic, in memory | ~70% | code is wrong |
| Integration | one component against real collaborators (DB, queue, HTTP) | ~20% | wiring/contract is wrong |
| End-to-end | a user journey through the deployed system | ~10% | the product is broken for users |

The share is a symptom gauge, not a law: too many E2E tests means the lower layers don't model reality; too few means nobody knows what the system actually does for a user.

## Deciding where a test goes

1. **Default to the lowest layer that can witness the behavior.** If a unit test can fail for the same bug, it wins — 50ms over 5s, every time.
2. **Move up only for integration reality the unit can't fake:** SQL semantics, serialization, auth middleware, queue ordering.
3. **E2E only for journeys with business consequence** (signup, checkout, the money paths). One per journey, not per feature.
4. **Every layer needs a failure-isolation rule:** when an E2E test fails, the log tells you which lower-layer contract broke first — or the pyramid has no diagnostic value.

## When the pyramid is sick

- Unit tests full of mocks that mirror the implementation → they verify nothing, refactor to behavior.
- Integration tests taking minutes → the component boundaries are wrong or the fixtures are heavyweight.
- E2E flakes weekly → see flake-diagnosis; usually shared state, not the test.

## Rules

- No test is added without naming which layer and why that layer.
- Layer share drifts are reported in CI (test counts × runtime per layer), quarterly reviewed.
