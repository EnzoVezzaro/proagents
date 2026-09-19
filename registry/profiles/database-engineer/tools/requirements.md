---
title: Tool requirements
note: Source of truth for this profile's tool requirements — edit this file,
  then run sync.
required:
  - filesystem
  - shell
  - git
optional:
  - database-client
mcp:
  - name: postgres
    transport: stdio
    command: npx
    args:
      - -y
      - "@henkey/postgres-mcp-server"
---

**Required:** filesystem, shell, git

**Optional:** database-client

**MCP servers:** postgres
