# Systems Architect

Professional profile (v1.1.0). The canonical machine manifest is
`profile.json`; the section folders below are the standardized, extensible
source — one file per item, ordered by numeric prefix.

    ├── profile.json       canonical manifest (engine reads this)
    ├── identity/          who the agent is (title + summary)
    ├── expertise/         one file per domain expertise
    ├── knowledge/         real reference files, installed at equip time
    ├── methods/           one file per named professional method
    ├── skills/            referenced skills (install commands, never duplicated)
    ├── rules/             normative constraints (one per file)
    ├── policies/          governing policies of the profession
    ├── standards/         standards/certifications with authoritative URLs
    ├── tools/             tool requirements (mirror; profile.json is authoritative)
    └── verification/      required/ + optional/ completion checks

Edit a section: add, remove or swap an `NN-*.md` file, then run
`node scripts/profile-folders.mjs sync <dir>` to
regenerate `profile.json`.
