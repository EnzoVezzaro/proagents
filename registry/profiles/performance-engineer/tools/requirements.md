---
title: Tool requirements
note: Source of truth for this profile's tool requirements — edit this file,
  then run sync.
required:
  - filesystem
  - shell
  - git
optional:
  - profiler
mcp:
  - name: playwright
    transport: stdio
    command: npx
    args:
      - -y
      - "@playwright/mcp@latest"
packages:
  - registry: npm:lighthouse
    reason: CI-grade performance audits
---

**Required:** filesystem, shell, git

**Optional:** profiler

**MCP servers:** playwright

**Packages:** npm:lighthouse
