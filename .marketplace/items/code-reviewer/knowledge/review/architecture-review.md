# Reference: Architecture Review

**Owner profile:** code-reviewer · **Covers:** "Architecture review" · **Type:** practice reference

Architecture review asks one question at the system scale: **does this change make the next change easier or harder?** Pattern conformance, boundaries, dependency direction, and abstraction fit are how you answer it.

## The checks

1. **Pattern conformance vs justified divergence.** Follow the codebase's existing patterns by default. A new pattern is fine when the PR says why it exists and where the old pattern fails — unjustified novelty is a maintenance tax everyone pays.
2. **Module boundaries held.** No new circular dependencies; a module's internals stay behind its interface; cross-module changes touch public surfaces, not friend classes' private parts.
3. **Dependency direction.** Dependencies point toward stable layers (domain ← adapters ← UI, shared ← everything). A utility importing from a feature is a boundary violation in embryo.
4. **Abstraction fits the problem.** Both sins are findings:
   - *Over-engineering:* interface + factory + strategy for one implementation with no second on the horizon.
   - *Under-engineering:* the third copy-paste of a concept that has earned an abstraction.
5. **Data flow sanity.** Where does state live? Who can mutate it? Can two entry points race? Draw it if the PR touches it.

## When you find a violation

- Small, contained → fix in this PR.
- Systemic but the PR only exposes it → **file a follow-up with a proposed direction**; don't force this PR to solve the system.
- Boundary decision (new pattern, new dependency between layers) → require a written justification in the PR description.

## Rules

- Architecture findings name the *next* change that gets harder if this lands as-is.
- "I would have structured it differently" without a cost argument is a nit, not architecture review.
