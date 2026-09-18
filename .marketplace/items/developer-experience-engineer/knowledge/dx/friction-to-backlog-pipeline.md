# Method: Friction-to-Backlog

**Owner profile:** developer-experience-engineer · **Type:** procedure playbook

Convert raw developer complaints, survey comments and friction logs into a ranked, verifiable backlog with acceptance criteria.

## When to run

- Survey results arrive, or the same complaint recurs in chat/issues.
- A friction log accumulates more than ~10 unsorted entries.
- Quarterly DX review.

## Procedure

1. **Collect raw signals** — survey comments, repeated questions, recurring CI flakiness, "works on my machine" threads. One line per signal, each with a link to its source.
2. **Cluster by root cause, not phrasing.** "Tests are slow", "CI is red" and "flaky suite" may be one problem or three — decide from evidence.
3. **Quantify each cluster:** recurrence rate, number of people hit, time cost. Measure where possible; where you estimate, state the estimation method on the item.
4. **Write items as outcomes with acceptance criteria** — "a new contributor runs the app with one command" — never as solutions ("install tool X"). Solutions pre-rank the design before anyone investigates.
5. **Rank by cost-of-delay vs effort.** Publish the ranking where the team reads; an invisible ranking does not exist.
6. **Close the loop with reporters:** when an item ships, tell the people who reported it and ask whether the pain is actually gone. Their answer is the item's real acceptance test.

## Rules

- Never delete a friction report — mark it resolved, wontfix, or needs-evidence. Reported pain is data.
- No solution in an item title.
- Every shipped DX item carries a before/after measurement or an explicit reason none was feasible.
