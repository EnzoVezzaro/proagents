---
layout: home

sidebar: false

hero:
  name: "ProAgents"
  text: "Professional profiles for coding agents"
  tagline: Equip the coding agent you already use with professional expertise, methods, skills, rules and verification — a portable Professional Agent Profile, compiled to your harness. Not another harness. The marketplace below runs entirely in your browser.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What is ProAgents?
      link: /guide/what-is-proagents

features:
  - title: Professional Agent Profiles
    details: A structured, versioned definition of how an agent operates as a professional — identity, expertise, methods, rules, tools and verification. Equip one in a single command.
    link: /guide/profiles
    linkText: The profile schema
  - title: Equip any coding agent
    details: Claude Code, Codex, OpenCode, Cursor, Gemini CLI — the profile compiler expresses the canonical profile using each harness's strongest mechanisms, and reports limitations honestly.
    link: /guide/getting-started#equip-a-profile
    linkText: Harness adapters
  - title: Validated composition
    details: Combine profiles (staff-engineer + security-engineer). Conflicting rules, incompatible tools and capability gaps are detected deterministically — serious conflicts are never silently ignored.
    link: /guide/profiles#composition
    linkText: How composition works
  - title: Rules are enforced
    details: Where the target harness supports enforcement (hooks, policies), rules compile into runtime boundaries. Where it does not, ProAgents says so — Markdown informs; boundaries enforce.
    link: /guide/profiles#rules-are-enforced
    linkText: Enforcement model
  - title: Agent-agnostic, JSON-first
    details: Every operation has a deterministic --json output — detect, list, inspect, equip, compile, validate. Another coding agent can operate ProAgents itself.
    link: /cli/json
    linkText: JSON interface
  - title: Build specialized agents too
    details: When the profession you need doesn't exist, the progressive question engine derives requirements and generates a validated multi-agent architecture — profiles, crews, handoffs.
    link: /guide/question-engine
    linkText: Progressive agent creation
---

<ClientOnly>
  <AppIsland />
</ClientOnly>

<style>
/* The island fills the sheet below the hero/features; VitePress home layout
   centers content — let the app use the full VPContent width. */
.VPHome .pa-app {
  margin-top: 24px;
}
</style>
