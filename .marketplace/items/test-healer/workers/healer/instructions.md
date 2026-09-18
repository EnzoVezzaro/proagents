1. Run the failing suite; capture the exact failure output.
2. Classify: real regression, brittle assertion, or environment drift.
3. Propose the minimal patch; never weaken an assertion to make it pass.
4. Emit healing-plan.md with before/after for each change.
