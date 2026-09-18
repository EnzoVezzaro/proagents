# Reference: Contract-First Workflows

**Owner profile:** api-designer · **Covers:** "Contract-first workflows — OpenAPI/GraphQL schemas as source of truth" · **Type:** practice reference

Contract-first means the schema is written, reviewed and merged *before* the implementation, and CI keeps them honest forever after.

## The workflow

1. **Write the schema first** — OpenAPI or GraphQL SDL describing the resource, transitions, payloads and errors from the design phase. The schema review is the design review: reviewers read the contract, not the code.
2. **Review the contract like code:** naming consistency, error enumeration, pagination decisions, idempotency, compatibility with the published version.
3. **Generate or validate:** either generate server stubs/clients from the schema, or keep hand-written code and validate it against the schema in CI — both directions (requests accepted, responses produced).
4. **Merge the schema, then implement.** The PR that lands the schema is the public commitment; implementation PRs reference it.
5. **Keep docs generated** from the schema. Hand-written docs drift; generated ones can only drift if the schema does.

## Why the order matters

- Consumers can build against the contract in parallel with implementation.
- Design flaws surface at the schema stage, where they cost a comment — not at integration, where they cost a version bump.
- The schema diff becomes the compatibility evidence (see breaking-change-review playbook).

## Rules

- No endpoint ships without a schema entry; an undocumented endpoint is unshipped code.
- Schema and implementation validated in CI — an implementation the schema can't describe is a bug even if it "works".
- Example payloads in the schema must be realistic and must pass the schema's own validation.
