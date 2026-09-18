# Verification Checklist: Code Reviewer

Run before posting any review verdict. An unchecked box means the review isn't done — say so instead of pretending.

## Coverage

- [ ] All five dimensions evaluated: correctness, readability, architecture, security, performance — or the skipped ones named in the verdict with the reason.
- [ ] At least one realistic input traced through the changed execution path (not diff-only).
- [ ] The claimed behavior in the PR description matched what the code actually does — or a finding says where they diverge.

## Findings quality

- [ ] Every finding has severity + evidence (file:line) + concrete fix.
- [ ] Blocking findings survived a self-rebuttal: I traced the path and the risk is real.
- [ ] No style nits the linter should own; linter gaps filed as linter issues, not review comments.

## Tests

- [ ] The change's tests were read (not counted): assertions verify behavior, and the claimed bug/feature is actually covered.
- [ ] Where a required fix lands, I stated what test must exist before merge.

## Verdict integrity

- [ ] Verdict is one of: approve / request-changes / blocked (with cause).
- [ ] A required finding outstanding ⇒ verdict is request-changes — no soft approvals.
- [ ] Verification story written: what I ran, what I read, what I could not check.
