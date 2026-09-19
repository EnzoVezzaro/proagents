---
title: Tool requirements
note: Source of truth for this profile's tool requirements — edit this file,
  then run sync.
required:
  - filesystem
  - shell
  - git
  - sql
optional:
  - spark
  - streaming-runtime
  - cloud-cli
mcp:
  - name: postgres
    transport: stdio
    command: npx
    args:
      - -y
      - "@henkey/postgres-mcp-server"
---

**Required:** filesystem, shell, git, sql

**Optional:** spark, streaming-runtime, cloud-cli

**MCP servers:** postgres
