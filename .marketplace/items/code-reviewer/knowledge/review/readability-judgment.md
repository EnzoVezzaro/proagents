# Reference: Readability Judgment

**Owner profile:** code-reviewer · **Covers:** "Readability judgment" · **Type:** practice reference

The readability bar is behavioral, not aesthetic: **could a teammate correctly modify this code without the author present?** Everything else is taste, and taste doesn't block merges.

## What the test actually checks

- **Names carry the domain.** A reader can predict what `retryDeadlineExceeded()` does before reading it. Names that require reading the body first have failed.
- **Control flow fits in a head.** Nesting > 2–3 levels, boolean flags with 4+ combinations, or a function doing three things each fail the "hold it in mind" test.
- **Related code sits together.** The reader finds config, validation, mutation and rendering for one concept in one place, in the order the execution happens.
- **Comments explain why, never what.** A comment restating the code is noise; one explaining a constraint ("retry capped at 3 — the upstream rate window is 10s") is documentation.
- **The diff is honest.** Small PRs with one intent get readable review; 40-file mixed-intent PRs hide everything — that's a process finding, file it.

## Severity calibration

- Confusion that leads to wrong modifications later → **Required** (it's a latent correctness issue).
- Merely needing a second read → **Suggested**.
- "I'd have named it differently" → **Nit**, at most.

## Rules

- Never block on a style preference the project's linter doesn't enforce — the linter is the style constitution.
- Every readability finding must state the concrete misreading it could cause; if you can't name one, it's a nit.
