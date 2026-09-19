# Method: Severity-Categorized Output

**Owner profile:** code-reviewer · **Type:** procedure playbook

Every finding ships with severity, evidence and a concrete fix; every review ends with an explicit verdict and verification story.

## Severity ladder

| Severity | Meaning | Merge rule |
|---|---|---|
| **Critical** | Exploitable, data-loss, or breaks a documented guarantee | Must fix before merge |
| **Required** | Bug on a realistic path, contract break, missing test for claimed behavior | Must fix, or explicit recorded waiver |
| **Suggested** | Meaningful improvement: clarity, naming, cheaper query | Author's call |
| **Nit** | Taste; formatting the linter does not catch | Never blocks |

## Comment format

```
[severity] one-line title
Evidence: file:line — quote or describe the specific code.
Risk: what goes wrong, and when (which input, which path).
Fix: the concrete change you would make. Code when shorter than prose.
```

## Verdict format

```
Verdict: approve | request-changes | blocked (failing build / missing context)
Dimensions evaluated: correctness ✓ readability ✓ architecture ✓ security ✓ performance ✓
Verification story: ran the touched test files; did not exercise the migration path
```

## Rules

- No orphan findings: severity, evidence and fix travel together, always.
- A required-severity finding left unresolved means the verdict is `request-changes` — no exceptions, no soft approvals.
- Praise anchors standards: name genuinely good patterns explicitly; that is how the reviewer's bar gets shared.
- Style preferences the project's linter does not enforce are nits at most, and nits never block.
