# Reference: API Ergonomics

**Owner profile:** api-designer · **Covers:** "API ergonomics — naming consistency, idempotency semantics, rate-limit headers, in-band deprecation timelines" · **Type:** practice reference

Ergonomics is the accumulated feel of correctness: the first integration succeeds on the first try, the second endpoint feels like the first, and surprises are rare and documented.

## The consistency surface

1. **One naming table, enforced.** Plural resource nouns, `camelCase` or `snake_case` — chosen once, applied everywhere, checked in CI against the schema. Inconsistency across endpoints is the most common API smell.
2. **Uniform behavior across resources:** same auth model, same error shape, same pagination parameters, same filtering conventions. A resource that behaves differently is a design debt with a URL.
3. **Predictable defaults:** sane page sizes, sane time ranges, sane date formats (ISO 8601, UTC) — the client should never set a parameter just to get a reasonable answer.
4. **Self-describing responses:** every response identifies its resource shape (and the API version or deprecation state where relevant).

## Operational ergonomics

- **Idempotency semantics documented per method:** which verbs are safely retryable, how unsafe ones carry idempotency keys, what happens on key reuse with a different payload (error — always).
- **Rate limits in-band:** `RateLimit-*` / `Retry-After` headers, not a docs paragraph. Clients that can read their own limits stop treating 429 as a mystery.
- **Deprecations in-band:** `Deprecation` and `Sunset` headers plus an error-body warning after the sunset date. The API tells clients the timeline; nobody should depend on reading a blog post.

## Rules

- A new endpoint copies an existing one's conventions by default; divergence requires a written reason in the PR.
- Ergonomic regressions (a second error shape, a second pagination style) are reviewed like breaking changes — because clients experience them that way.
