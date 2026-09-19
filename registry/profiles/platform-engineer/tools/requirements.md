---
title: Tool requirements
note: Source of truth for this profile's tool requirements — edit this file,
  then run sync.
required:
  - filesystem
  - shell
  - git
  - container-runtime
optional:
  - cloud-cli
  - kubernetes
mcp:
  - name: kubernetes
    transport: stdio
    command: npx
    args:
      - -y
      - mcp-server-kubernetes
---

**Required:** filesystem, shell, git, container-runtime

**Optional:** cloud-cli, kubernetes

**MCP servers:** kubernetes
