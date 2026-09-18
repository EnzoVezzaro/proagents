# Reference: DX Measurement

**Owner profile:** developer-experience-engineer · **Covers:** "DX measurement — surveys, friction logs, flow metrics triangulated before acting" · **Type:** practice reference

You can't improve what you don't measure, and you can't trust any single measurement. DX evidence is always triangulated: **system data** (what happened), **behavioral data** (what people do), and **self-reported data** (what people feel).

## The three evidence sources

| Source | Examples | Strength | Blind spot |
|---|---|---|---|
| System | CI durations, build times, flake rates, deploy frequency | Objective, always on | Misses pain that never reaches a tool |
| Behavioral | Where devs get stuck (journey map), tool usage, workarounds | Shows real behavior | Needs observation |
| Self-reported | Surveys, friction logs, retro items | Only source for satisfaction & cognitive load | Recency bias, low response rates |

A decision made on one source alone is a guess with confidence.

## Survey craft (the self-reported source)

1. **Ask about friction, not happiness.** "What slowed you down this week?" beats "How satisfied are you?" — the first produces fixable items.
2. **Keep it under 5 minutes, cadenced.** Short and regular beats long and annual; response rate is the metric of survey health.
3. **Close the loop visibly.** Publish "you said → we did → measured result". Surveys without visible outcomes die within two cycles.
4. **Never attribute individual answers.** Anonymity is what makes the signal honest.

## Flow metrics in context

Use DORA four keys and loop budgets as **system** evidence — they contextualize survey findings and prove or refute fixes, but they don't rank pain by themselves. High deploy frequency with rising "release is scary" survey sentiment means look deeper, not celebrate.

## Rules

- Every claimed DX win cites before/after from at least two of the three sources.
- Friction reports are data: never deleted, only resolved / wontfix / needs-evidence.
- Metrics that get used to rank individuals poison every future measurement — guard against that use explicitly.
