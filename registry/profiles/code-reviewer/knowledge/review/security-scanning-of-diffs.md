# Reference: Security Scanning of Diffs

**Owner profile:** code-reviewer · **Covers:** "Security scanning of diffs — untrusted input at boundaries, secret handling, auth/authz, injection sinks, dependency risk" · **Type:** practice reference

Review-level security is not an audit; it is a focused pass over the changed surface asking where untrusted data crosses a boundary and what it can reach.

## The five questions for any diff

1. **Where does untrusted input enter?** (request bodies, query params, headers, file uploads, webhook payloads, CLI args, env from CI.) For each: validated? type-coerced? length-bounded?
2. **Where does that input reach?** Trace it to sinks: SQL/NoSQL queries, shell commands, HTML/JSX rendering, URLs, file paths, log statements, `eval`-family. Each sink needs context-specific defense (parameterization, encoding, allowlists, path canonicalization).
3. **Are secrets handled?** No tokens/keys/personal data in code, fixtures, logs or error messages. New secret *usage* reads from the secret store — never a default value that is a real credential.
4. **Is auth/authz enforced on the new surface?** New endpoint/action: authentication required? Authorization checked *for this resource* (not just "is logged in")? IDOR check: can user A access user B's object by guessing the ID?
5. **Do new dependencies add risk?** New package: is it maintained, does it need network/system access, is the version pinned, does it pull a known-vulnerable transitive tree (`npm audit` / equivalents)?

## Severity in security findings

- Exploitable by an external attacker on the main path → **Critical**.
- Exploitable with an authenticated account / requires a specific configuration → **Required**.
- Defense-in-depth gap with no current exploit path → **Suggested**.

## Rules

- "The input is unlikely to be malicious" is not a defense — provenance is the only input category, and untrusted has no exceptions.
- Security findings never resolve to "noted for later" silently — they get severity, evidence, and a fix or an explicit recorded waiver.
