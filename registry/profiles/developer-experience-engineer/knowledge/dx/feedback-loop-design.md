# Reference: Feedback-Loop Design

**Owner profile:** developer-experience-engineer · **Covers:** "Feedback-loop design — error messages, test failures and CI logs rewritten to say what broke, where, and the likely fix" · **Type:** practice reference

Every failure a developer sees is a feedback loop. The loop's quality is measurable: **can the reader act correctly without asking anyone?** If not, the message is a bug.

## The four-part failure message

Every error, test failure and CI failure worth a developer's attention has:

1. **What broke** — in domain terms ("payment client rejected the request"), not just the stack's internal view ("ECONNRESET").
2. **Where** — file:line, test name, or service+endpoint. The reader shouldn't hunt.
3. **Why (likely)** — the most common cause, stated. "Usually this means the local token expired — run `bin/auth refresh`."
4. **Next action** — the command to run or the doc to read. If there is genuinely nothing to do, say that plainly.

## Where to apply it

- **Test failures:** assert with context — expected vs actual, the input that triggered it, and a hint when the cause is known (clock skew, ordering, missing fixture).
- **CI logs:** failing jobs print a short diagnosis block at the end (what failed, where the full log is, the common fix). Nobody should scroll 4000 lines to learn "port already in use".
- **Setup scripts:** every `exit 1` carries the four parts; a bare exit code is an unfinished script.
- **Lint/tooling rules:** the rule's message shows a wrong example and the corrected shape, not just the rule ID.

## The audit

1. Trigger the top failure modes on purpose (bad token, port conflict, missing env var, stale build).
2. Score each message against the four parts.
3. Fix the lowest-scoring, most-frequent message first. Re-test by triggering the failure again.

## Rules

- A message you can't act on is a defect — file it, don't endure it.
- Never print secrets or tokens in the name of a helpful message; helpfulness never overrides redaction.
