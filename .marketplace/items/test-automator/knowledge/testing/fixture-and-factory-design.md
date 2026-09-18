# Reference: Fixture and Factory Design

**Owner profile:** test-automator · **Covers:** "Fixture and factory design" · **Type:** practice reference

Fixtures are the test suite's data model. Good ones make each test declare only what matters to it; bad ones make every test depend on a cathedral of implicit state nobody dares to touch.

## The factory pattern (the good version)

```ts
const user = await makeUser({ role: "admin" });   // everything else defaulted
const order = await makeOrder({ user, status: "paid" });
```

1. **Sensible defaults, explicit overrides.** The factory supplies valid values for everything; the test overrides only the fields its behavior depends on. Reading the test tells you exactly what's under test.
2. **Validity is non-negotiable.** Factories produce *valid* domain objects — never half-filled records that pass by accident. Validity rules live in one place, and it's the factory.
3. **Composability.** Factories call factories: an order factory owns its line items and its user. One schema change touches one factory.
4. **No shared mutable fixtures.** `beforeAll` seeds shared rows that tests mutate → order dependence. Fresh state per test, from the factory, is the default; sharing is the documented exception.

## When handcrafted fixtures are right

- Golden files for parsers/renderers — but reviewed, minimal, and named by what they exercise.
- Complex scenario setups reused across many tests — wrapped in a named scenario function with a docstring, not copy-pasted JSON.

## Smells

- A 500-line fixture file nobody edits because "something depends on all of it".
- Tests that break in bulk when a column is renamed → the schema lives in fixtures, not in the factory.
- `JSON.parse(JSON.stringify(...))` chains — a factory is begging to exist.

## Rules

- Every test reads as: given *only these relevant facts*, when X, then Y.
- Adding a required field to a domain object means updating exactly one factory — if it means updating 40 tests, the factory layer is missing.
