# Release notes — what ships where

This repository produces three artifacts. All three are automated; this file
records what each needs before a release.

## npm package (`proagent`)

- **Source of truth:** `package.json` `version`.
- **Flow:** push a tag `v*` → `.github/workflows/release.yml` runs tests, builds,
  publishes with provenance (OIDC trusted publishing — no NPM_TOKEN secret),
  and opens the GitHub release with generated notes.
- **Before tagging:**
  - `npm run typecheck` and `npm test` pass locally
  - `CHANGELOG.md` has an entry for the version being tagged
  - the shipped skill (`.agents/skills/proagent/`) and `profiles/*.json` are
    current — both are published inside the package (`files` in package.json)

## Documentation site

- **Flow:** every push to `main` builds VitePress (`ci.yml` `docs` job) and
  publishes to GitHub Pages. No release step — docs deploy on merge.
- Docs must build (`bun --bun vitepress build docs`) before tagging; broken
  docs block CI on main.

## Marketplace SPA

- **Flow:** `web/` builds during the Pages deployment; the catalog
  (`.marketplace/`) is served as static JSON from the repo root.
- Catalog changes (new profiles/crews) go through the marketplace proposal
  pipeline — a reviewable commit, never a manual edit on main.

## Release checklist

1. Bump `package.json` version (semver: breaking → major, features → minor, fixes → patch)
2. Update `CHANGELOG.md` with the new version and today's date
3. `npm run typecheck && npm test && bun --bun vitepress build docs`
4. Commit: `chore(release): v<version>`
5. Tag: `git tag v<version>` and push with `--tags`
6. `release.yml` publishes npm + creates the GitHub release automatically
7. Verify: `npm view proagent version`, GitHub releases page shows notes

## Versioning notes

- The CLI reads its version from `package.json` at runtime (`--version`).
- Profile manifests carry their own `profile.version` (semver) — independent of
  the package version; a profile change bumps the profile, not the package.
- The marketplace catalog is schema-versioned (`schemaVersion: 1`), additive only.
