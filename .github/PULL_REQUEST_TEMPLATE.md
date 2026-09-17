# Pull request checklist

Thanks for the PR! The items below are what review actually gates on — please
confirm them so your change lands quickly.

## Determinism (non-negotiable)

- [ ] No model calls, randomness or timestamps in `src/core/`, `src/profiles/` or `src/adapters/` (same state → same output, byte-for-byte)
- [ ] Compiled artifacts are reproducible (markers derived from content, never `Date.now()`)

## Provider & layer boundaries

- [ ] No provider-specific code in `src/core/` or `src/profiles/`; harness-specific logic stays in `src/adapters/`
- [ ] Skill ≠ CLI ≠ Question Engine ≠ Context Framework ≠ Profile Compiler — no collapsed layers
- [ ] `acc-code-context` (and any optional adapter) remains optional — no hard imports

## Contracts & validation

- [ ] `--json` output changes are **additive** (existing fields keep their names and shapes)
- [ ] New validation rules use the `PA0xx` code scheme + suggestion string + tests (PA001–PA013 agents, PA02x composition, PA03x profiles)
- [ ] `npm run typecheck` passes (strict)
- [ ] `npm test` passes — new behavior ships with tests
- [ ] `npm run site:build` passes (if the site changed — SPA and/or docs)

## Product framing

- [ ] ProAgents equips existing coding agents with **Professional Agent Profiles**; the interview (`init`→`spec`→`build`) is the second path — new copy follows this framing
