# Method: Breaking-Change Review

**Owner profile:** api-designer · **Type:** procedure playbook

Classify every contract change as additive, wire-breaking, or semantics-breaking — and route breaking changes through versioning with a deprecation window.

## When to run

- Any change to a published contract (REST, GraphQL, events, gRPC).

## Classification table

| Change | Wire-compatible? | Notes |
|---|---|---|
| Add optional field | Yes | Still document it; "optional" is a promise to consumers |
| Add required request field | **No** — old clients omit it | Version bump |
| Remove/rename field or endpoint | **No** | Version bump + deprecation window |
| Narrow a type / add enum values consumers switch on | Semantically breaking | Exhaustive client matches break |
| Tighten validation | Semantically breaking | Requests that used to pass now fail |
| Change an error's code or retryability | Semantically breaking | Client retry logic breaks silently |

## Procedure

1. **Run the contract diff tool** (openapi-diff or equivalent) against the published contract. Running it is the review's first gate, not eyeballing.
2. **Classify every delta** against the table. When unsure, treat as breaking — the asymmetry punishes optimism correctly.
3. **Breaking → version strategy:** new version alongside old, deprecation headers from day one, published sunset date, migration note per consumer type.
4. **Prove compatibility:** contract tests pinned to the *old* contract must pass against the new implementation throughout its deprecation window.
5. **Write the changelog as a client would read it:** what changed, what they must do, by when.

## Rules

- Semantics are part of the contract: a field that changes meaning without changing shape is still a breaking change.
- "Nobody uses that field yet" is not evidence — usage data or a search across consumer repos is.
- A deprecation without an alternative endpoint and a removal date is not a deprecation; it is an eviction notice.
