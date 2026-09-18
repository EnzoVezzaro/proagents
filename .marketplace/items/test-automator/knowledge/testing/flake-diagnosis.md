# Reference: Flake Diagnosis

**Owner profile:** test-automator · **Covers:** "Flake diagnosis" · **Type:** practice reference

A flaky test is a test whose verdict depends on the machine, the moment, or the mood of the network. Flake is not tolerated, handled, or retried into submission — it is diagnosed to a category and killed or quarantined with a ticket.

## The taxonomy

**Systematic flake** — deterministic given a condition the team hasn't identified:
- shared state between tests (singleton, DB rows, env vars, ports)
- order dependence (test B only passes after test A ran)
- environment differences (timezone, locale, core count, filesystem case)
- real bugs that manifest intermittently (races, timeouts under load)

**Stochastic flake** — genuinely probabilistic by design of the system:
- network timing, GC pauses, thread scheduling
- external service behavior

The distinction matters: systematic flake is *fixable at the cause*; stochastic flake requires making the test's assertion robust or moving the behavior behind a controllable seam.

## The diagnosis procedure

1. **Reproduce with intent.** Run the test 20× alone, then 20× in the suite, then 20× in CI. The pattern (alone/in-suite, local/CI) is itself evidence.
2. **Diff the conditions** between green and red runs: environment, ordering, data, time.
3. **Classify** using the taxonomy. Ask: "what would make this test pass on every retry?" — that's usually the leaked state or the race window.
4. **Fix at the cause** when systematic: clean up state, break order dependence, make the race impossible.
5. **Quarantine when not immediately fixable:** remove from the required suite, open a ticket with the diagnosis, set a review date. Quarantine without diagnosis is just noise deletion.

## Rules

- Retries are a metric, not a fix: a suite that passes on retry has a flake rate — measure and publish it.
- A test quarantined for over a month without a fix or deletion decision is a process failure; escalate.
- "It's flaky, rerun it" in review comments is banned; the word must come with category and cause.
