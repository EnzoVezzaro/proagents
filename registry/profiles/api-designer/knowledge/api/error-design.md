# Reference: Error Design

**Owner profile:** api-designer · **Covers:** "Error design — machine-readable codes, retryability signals, field-level validation details" · **Type:** practice reference

Errors are half the contract. An API whose happy path is designed and whose failure path is improvised has no contract at all — clients can only recover from errors they can understand and classify.

## The anatomy of an API error

```
{
  "type": "https://api.example.com/errors/insufficient-inventory",
  "code": "INSUFFICIENT_INVENTORY",
  "message": "2 of 5 requested units of SKU-123 remain in stock.",
  "retryable": false,
  "details": [{ "field": "items[0].quantity", "issue": "exceeds_available", "available": 2 }]
}
```

1. **`code`** — stable, machine-branchable, namespaced per domain. Clients switch on this; it never changes meaning once published (that's a semantics-breaking change).
2. **`message`** — human-readable, says what happened in domain terms. Never contains secrets, stack traces, or SQL.
3. **`retryable`** — the client's most important bit. Same Request → different outcome? `true`. Deterministic rejection? `false`. Retry ambiguity causes outages and duplicate orders.
4. **`details`** — field-level validation issues so clients can highlight the form field, not just "validation failed".

## Design procedure

1. **Enumerate failure modes per endpoint** at design time: validation, not-found, conflict, authz, upstream failure, rate limit. Each gets a code and a retryability decision.
2. **Pick the HTTP status honestly** (RFC 9457 problem details): 4xx = client can change something to succeed; 5xx = client cannot, and should retry with backoff or give up.
3. **Decide idempotency for retried writes** and document how clients pass idempotency keys.
4. **Test the error shapes**: contract tests assert code, retryability and details — error responses are contract surface, not log noise.

## Rules

- No bare `500` with an empty body on a designed surface; upstream failures map to a named code even when the fix is "try later".
- Error messages never leak internals: stack traces, driver errors, and infra topology are for logs, not responses.
- Changing any error's `code` or `retryable` is a semantics-breaking change — full version review.
