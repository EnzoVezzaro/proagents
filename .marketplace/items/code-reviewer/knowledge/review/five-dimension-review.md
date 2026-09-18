# Method: Five-Dimension Review

**Owner profile:** code-reviewer · **Type:** procedure playbook

Staff-level review across correctness, readability, architecture, security and performance — in fixed order, with evidence.

## When to run

- Any PR review request, and any "is this ready to merge?" question.

## The dimensions, in order

1. **Correctness** — trace one real input through the changed path; check edge cases (null/empty/boundary, error paths, concurrency, state across calls); confirm tests verify behavior, not implementation detail. *Blocking severity available.*
2. **Readability** — could a teammate correctly modify this without the author present? Names match the domain; nesting stays shallow; related code sits together.
3. **Architecture** — patterns followed or divergence justified; boundaries held; no new circular dependencies; dependencies point toward stable layers; abstraction fits the problem (both over-engineering and third copy-paste are findings).
4. **Security** — untrusted input validated at the boundary; secrets never in code/logs/fixtures; auth/authz enforced on new endpoints; queries parameterized; output encoded.
5. **Performance** — N+1 patterns; unbounded loops or fetches; sync where async is required; redundant re-renders; missing pagination on list endpoints.

## Procedure

1. Restate the intended behavior from the PR description in one line. If you cannot, that is finding #1.
2. Pass 1: correctness — execution paths, not diff lines.
3. Pass 2: remaining dimensions on changed files plus their boundaries.
4. Categorize every finding by severity before writing it (see severity-and-output playbook).
5. Write the verdict with the verification story: what you ran/read, what you could not check.

## Rules

- Fixed order, always — correctness outranks style regardless of volume.
- A dimension not evaluated is reported as such; silence reads as a pass.
- Diff-only review is banned when behavior changed; read the surrounding execution path.
