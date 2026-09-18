# Reference: Release Engineering

**Owner profile:** mobile-engineer · **Covers:** "Release engineering" · **Type:** practice reference

Mobile releases are the only deployments that can't be rolled back — binaries land on devices you don't control and stay for years. Every release decision is made with that irreversibility in mind.

## The release train

1. **A train is a schedule, not an event:** fixed cadence, cut from main, beta-tested, released. Hotfixes are a documented exception path, not a habit. Features ride the train when ready — trains wait for no feature.
2. **Branch strategy matches the store reality:** release branch cut at train time; only stabilization commits ride it. Cherry-picks are reviewed like releases because they are one.
3. **Store gates planned, not suffered:** review timelines, staged rollout windows, and data-processing disclosures are calendar inputs. The train's schedule absorbs them; it doesn't discover them.
4. **Backward compatibility with the backend:** released binaries live for years. API deprecations check the installed base; new app requirements (min OS bumps) are adoption-aware decisions with dashboard numbers.
5. **Every release is reproducible:** the exact binary in the store builds from a tag with pinned dependencies, one command. Build-from-a-specific-macbook is a single point of failure with a name.

## Staged rollout and monitoring

- **Staged rollout with automatic halt criteria:** crash-free sessions, launch time, and key funnel metrics checked per stage; a breach halts the rollout mechanically — not "when someone notices".
- **Kill switches for risky features:** remote-config flags on anything networked, new-paywall, or invasive-permission so a bad release can be neutralized in minutes instead of surviving a week of store review.
- **The rollback that exists:** halting rollout and killing flags *is* mobile rollback. Its speed is rehearsed.

## Rules

- No release without: crash-free-session comparison vs the previous release, launch-time check, and the feature-flag map of what can be killed.
- "We'll hotfix it" is not a rollout plan; hotfixes should be rare by design, not by luck.
