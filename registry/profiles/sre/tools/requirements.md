---
title: Tool requirements
note: Source of truth for this profile's tool requirements — edit this file,
  then run sync.
required:
  - filesystem
  - shell
  - git
optional:
  - monitoring
  - cloud-cli
mcp:
  - name: kubernetes
    transport: stdio
    command: npx
    args:
      - -y
      - mcp-server-kubernetes
  - name: github
    transport: http
    url: https://api.githubcopilot.com/mcp/
    allowedTools:
      - get_file_contents
      - list_commits
      - search_code
      - create_pull_request
---

**Required:** filesystem, shell, git

**Optional:** monitoring, cloud-cli

**MCP servers:** kubernetes, github
