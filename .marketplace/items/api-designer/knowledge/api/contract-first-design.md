# Method: Contract-First Design

**Owner profile:** api-designer · **Type:** procedure playbook

Design the contract, then the implementation — never the reverse.

## When to run

- Adding or changing endpoints, resources, fields, or error behavior.
- A consumer reports the contract no longer matches reality (that is a bug, not docs debt).

## Procedure

1. **Model resources, not actions.** List the nouns and their states (draft → published → archived). Endpoints are state transitions on nouns; anything that resists noun-modeling gets an explicit written justification.
2. **Draw the state machine.** Which transitions exist, who may trigger them, what happens on failure. Every transition maps to an endpoint — or is intentionally not exposed, and that is recorded.
3. **Shape payloads around consumers:** read models flattened for their use case; write models minimal. Never echo the database schema — storage is not a contract.
4. **Design errors as part of the contract:** enumerate failure modes per endpoint, give each a machine-readable code, decide retryability, define the validation-error shape with field-level detail.
5. **Choose pagination per list endpoint:** cursor (stable, no cheap totals) vs offset (random access, expensive deep pages). Document the sort-key stability guarantee — clients page with it.
6. **Write the OpenAPI/GraphQL schema first.** Review it like code. Then implement against it, with CI validating the implementation against the schema in both directions.
7. **Document idempotency:** which methods are safe to retry, and how clients pass idempotency keys for unsafe ones.

## Rules

- The schema is the source of truth; divergent code is a bug even when tests pass.
- An endpoint whose error cases are not enumerated is a happy path with a name, not a design.
- Design for client flows you can name; speculative generality is paid for by every future reader.
