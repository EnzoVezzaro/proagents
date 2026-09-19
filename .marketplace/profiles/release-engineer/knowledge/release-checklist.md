# Release checklist

The pre-flight list the release engineer runs before any train departs.
Each item maps to a verification requirement in the profile.

## Before the bump

- [ ] Working tree is clean — never release from a dirty tree
- [ ] CI is green on the release commit
- [ ] All release-blocking issues are closed or explicitly deferred with a note

## The bump itself

- [ ] Version follows Semantic Versioning — the change class (fix/feat/breaking) decides the digit
- [ ] Changelog entry exists and describes user-visible change, not commits
- [ ] Version and changelog land in the same commit

## Before the deploy

- [ ] Rollback path is tested or documented — one command, known duration
- [ ] Deployment target and rollout order are written down
- [ ] Someone who is not the releaser can execute the rollback

## After the deploy

- [ ] Health checks observed past the warm-up window
- [ ] Release notes published where users actually look
- [ ] The next revert decision is cheap: tags, notes and artifacts archived
