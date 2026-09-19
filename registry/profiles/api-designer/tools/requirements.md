---
title: Tool requirements
note: Source of truth for this profile's tool requirements — edit this file,
  then run sync.
required:
  - filesystem
  - shell
optional:
  - git
  - browser
mcp:
  - name: sequential-thinking
    transport: stdio
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-sequential-thinking"
---

**Required:** filesystem, shell

**Optional:** git, browser

**MCP servers:** sequential-thinking
