---
title: Tool requirements
note: Source of truth for this profile's tool requirements — edit this file,
  then run sync.
required:
  - filesystem
  - shell
  - git
optional:
  - container-runtime
mcp:
  - name: playwright
    transport: stdio
    command: npx
    args:
      - -y
      - "@playwright/mcp@latest"
---

**Required:** filesystem, shell, git

**Optional:** container-runtime

**MCP servers:** playwright
