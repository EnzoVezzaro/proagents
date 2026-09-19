# Reference: Battery and Memory Budgets

**Owner profile:** mobile-engineer · **Covers:** "Battery and memory budgets" · **Type:** practice reference

Users experience your resource budget as their phone's battery, their device's heat, and their other apps' deaths. Budgets make those subjective feelings measurable and enforceable.

## The budgets (set them per app, enforce them in CI)

| Resource | Typical budget | Measured by |
|---|---|---|
| Cold launch (p50) | < 2s to usable, low-end device | launch instrumentation on matrix |
| Memory steady-state | bounded per screen; no growth over 10-min session | leak canaries, memory graphs in UI tests |
| Battery/background | wakeups and network batched; no periodic timers "just to check" | battery historian / energy gauge |
| Disk | cache eviction policy; uploads/downloads resumable | storage profiling |
| Jank | dropped-frame budget per screen | GPU/frame profiling on low-end matrix device |

## The method

1. **Profile on the worst supported device**, not the flagship — the tail of the device matrix defines the experience for a meaningful share of users.
2. **Every background job justifies its wakeups:** work scheduled in batches, deferred to charging/IDLE windows when possible, no wake-locks held "while we wait".
3. **Memory:** image loading sized to view, cells reuse, streams closed, listeners unregistered. A session-long monotonic memory graph is a leak; find the owner, not the symptom.
4. **Regressions are releases blockers:** budgets checked per release on the matrix; a breach gets a fix or an explicit, recorded waiver — the budget that bends silently stops existing.

## Rules

- "It's fine on my phone" is not a measurement; the matrix device plus the profiler is.
- Network chatter is a battery cost: batch, compress, cache, and respect the OS's background constraints — polling every 30 seconds is a design confession.
