# Reference: Compatibility Analysis

**Owner profile:** api-designer · **Covers:** "Compatibility analysis — which changes break which clients" · **Type:** practice reference

Compatibility is a property you check with tooling and reason about with tables — never an intuition. The output of analysis is a classification of every contract delta.

## What actually breaks clients

**Wire-breaking (old requests/responses fail to parse):**
- Adding a required request field; removing or renaming any field or endpoint.
- Changing a type (string → enum, number → string), or the cardinality (field ↔ array).

**Semantics-breaking (parses fine, behaves differently):**
- Adding enum values when consumers do exhaustive matching.
- Tightening validation — previously-valid requests now rejected.
- Changing an error's code, or its retryability.
- Reordering pagination with an unstable sort key.
- Changing the meaning of a field while keeping its name and type ("we're reusing `status` for a new state machine").

## The procedure

1. **Run the diff tool** (openapi-diff, graphql-inspector) against the published contract. This is a gate, not a formality.
2. **Classify each delta** with the table above. Uncertain ⇒ treat as breaking — optimism is the expensive mistake.
3. **Route breaking deltas through versioning:** new version alongside old, deprecation headers, sunset date, migration note (see breaking-change-review playbook).
4. **Prove it:** contract tests pinned to the old contract pass against the new implementation through the whole deprecation window.

## Rules

- Wire compatibility is checked mechanically; semantic compatibility is checked by a human reading the table — do both.
- "Optional" means "clients may ignore it" — it is a compatibility promise, not a suggestion.
- Internal-only APIs get the same analysis with a shorter window; "internal" does not mean "nobody calls it".
