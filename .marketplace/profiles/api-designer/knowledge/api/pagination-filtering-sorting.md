# Reference: Pagination, Filtering and Sorting Contracts

**Owner profile:** api-designer · **Covers:** "Pagination, filtering and sorting contracts — cursor vs offset trade-offs, stable sort keys" · **Type:** practice reference

List endpoints are where APIs fall over in production. The pagination decision is a contract decision: it cannot be changed later without breaking every consumer.

## Cursor vs offset — decide per endpoint

| | Cursor | Offset |
|---|---|---|
| Stability under inserts/deletes | Stable (opaque position) | Rows skip/duplicate mid-page |
| Deep-page cost | Constant | Grows with offset |
| Random access ("page 7") | No | Yes |
| Total count | Expensive/omit | Cheap if precomputed |
| Use when | Feeds, infinite scroll, sync | Admin tables, small bounded sets |

Default to **cursor** for anything a machine iterates; offer **offset** only where humans genuinely page.

## The contract decisions to make explicitly

1. **Sort key stability:** cursors need a total order — a unique tiebreaker (id) appended to the sort. Document it: "sorted by `created_at DESC, id DESC`; cursors are only valid for the same sort".
2. **Default page size and maximum:** bounded server-side (`limit` capped, e.g. 100); document both numbers in the schema.
3. **Filtering vocabulary:** which fields are filterable, exact vs prefix vs range, and the combining semantics (AND across fields, OR within). An unfilterable collection forces clients to over-fetch.
4. **Counts:** `total` only when cheap (offset + precomputed) — a `COUNT(*)` per page on a large table is a self-inflicted outage. When omitted, say so.
5. **Empty vs exhausted:** cursors should distinguish "no results" from "end reached" (next-cursor absent vs null) — clients build loops on it.

## Rules

- No list endpoint ships unbounded: no cap on `limit`, or no cap on result windows without an export path.
- Changing default sort or page size is a semantics-breaking change — same review bar as field changes.
- Pagination bugs are correctness bugs: off-by-one cursor edges get contract tests, not hope.
