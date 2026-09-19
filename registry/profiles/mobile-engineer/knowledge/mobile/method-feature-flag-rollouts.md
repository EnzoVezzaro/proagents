# Method: Feature Flag Rollouts

**Owner profile:** mobile-engineer · **Type:** procedure playbook

Ship features behind flags and widen exposure on measured health — because released binaries can't be recalled, the flag is the only rollback that works at mobile speed.

## When to run

- Any feature that changes networking, storage schema, money flows, permissions, or the navigation shell; any experiment; any risky dependency upgrade.

## Procedure

1. **Flag before the feature lands:** the flag wraps the new behavior from the first commit; "flag later" becomes "never", and the risky release ships unkillable.
2. **Define the exposure ladder** upfront: dev → internal → 1% → 10% → 50% → 100%, with hold durations and the metrics checked at each rung (crash-free sessions, feature funnel, sync health, launch time).
3. **Define halt criteria before widening:** the numbers that stop the ladder automatically or by ritual ("if crash-free drops 0.3 points vs control, halt and kill"). Criteria set during an incident are negotiable; criteria set before are not.
4. **Ship the kill path:** the flag default-off state is tested (the feature *fully* disabled — no half-state crashes), and killing the flag is rehearsed once before rollout.
5. **Widen on evidence, not enthusiasm:** each rung requires its health check green for its hold duration; the widening and its evidence are recorded.
6. **Retire the flag:** after full rollout + one release cycle, the flag dies — dead flags accumulate into a combinatorial testing debt nobody can matrix anymore.

## Rules

- No flag ships without a tested off-state and a defined ladder with halt criteria.
- Experiments get power analysis *before* starting — a test without a duration and a minimum detectable effect just adds noise to every dashboard.
