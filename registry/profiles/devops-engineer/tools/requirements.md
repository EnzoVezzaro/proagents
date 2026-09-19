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
  - cloud-cli
mcp:
  - name: kubernetes
    transport: stdio
    command: npx
    args:
      - -y
      - mcp-server-kubernetes
---

**Required:** filesystem, shell, git

**Optional:** container-runtime, cloud-cli

**MCP servers:** kubernetes
