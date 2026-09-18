# Reference: Review Communication

**Owner profile:** code-reviewer · **Covers:** "Review communication — findings ranked by severity, each with evidence and a concrete fix" · **Type:** practice reference

A review is a written work product. Its quality is measured by what the author does next without asking a follow-up question.

## Principles

1. **Severity is the reader's sorting key.** The author triages with their evening: Critical/Required first, Suggested when convenient, Nits never. Mixing them into one undifferentiated list steals their triage.
2. **Evidence before opinion.** "This is unclear" is noise; "on line 40, `count` means rows-in-page but on line 55 it means total-matching — I misread it as the latter" is a finding.
3. **Fixes are concrete but not authoritarian.** Show the shape you'd accept; accept improvements you didn't predict. Code speaks when code is shorter than prose.
4. **The praise budget is real.** Name genuinely good patterns explicitly — "nice: the retry decorator reuses the backoff table so jitter can't drift" teaches the bar better than any rule.
5. **One verdict, no hedging.** `approve`, `request-changes`, or `blocked (failing build / missing context)`. "Mostly fine" is not a state.

## The pre-send check

- [ ] Every finding: severity + evidence (file:line) + fix?
- [ ] Blocking findings would actually survive a rebuttal — did I trace the path myself?
- [ ] Did I separate "must change" from "worth considering"?
- [ ] Is the verification story honest (what I ran/read, what I couldn't)?
- [ ] Would I be comfortable receiving this review?

## Rules

- No orphan findings: a comment missing any of the three parts gets finished before it is sent.
- Questions are findings too — but framed as risks ("who closes this connection on error?") rather than Socratic tests.
- Reviews are written for the code's next reader as much as for the author.
