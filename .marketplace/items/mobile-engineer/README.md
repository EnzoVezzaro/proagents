# Mobile Engineer

Professional profile (v2.1.0). In the folder standard every
section entry in `profile.json` is a path to its file — the manifest is the
index, the folders are the source.

    ├── profile.json       the index (paths; hydrated to content at load time)
    ├── identity/          who the agent is (title + summary)
    ├── expertise/         one file per domain expertise
    ├── knowledge/         real reference files, installed at equip time
    ├── methods/           one file per named professional method
    ├── skills/            skill refs (frontmatter) or written skills
    ├── rules/             normative constraints (one per file)
    ├── policies/          governing policies of the profession
    ├── standards/         standards with authoritative URLs (url/note frontmatter)
    ├── tools/             requirements.yaml — structured tools object (source of truth)
    └── verification/      required/ + optional/ completion checks

Edit a section: add, remove or swap an `NN-*.md` file, then run
`node scripts/profile-folders.mjs sync <dir>` to regenerate `profile.json`.
