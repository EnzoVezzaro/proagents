# Reference: Offline-First Architecture

**Owner profile:** mobile-engineer · **Covers:** "Offline-first architecture" · **Type:** practice reference

Mobile networks are intermittently terrible by nature. Offline-first treats connectivity as an optimization, not a requirement: the app works on a plane, in a parking garage, and mid-request-drop — and syncs when it can.

## The core decisions

1. **Local source of truth.** The on-device store (SQLite/Room/Core Data/Realm) is what the UI reads. Network updates *the store*, never the UI directly — one data flow, no screen-specific fetch logic.
2. **Explicit sync states.** Every piece of user-visible data has a state: synced, pending, conflict, failed. The UI communicates them honestly ("saved on device — will upload") instead of pretending everything is immediate.
3. **Queued mutations with retries.** Writes go to an outbox; a sync engine drains it with backoff and idempotency keys (the server dedupes — retries are the norm, not the exception).
4. **Conflict resolution chosen per data type, in writing:** last-write-wins for preferences; server-wins for balance-like facts; merge or CRDT for collaborative content. Undocumented conflict behavior is a bug factory.
5. **Tombstones for deletes.** A delete must survive sync across devices and offline windows — deleting only the local row resurrects data on next sync.

## The drop-mid-request contract

Every networked flow is designed around: request sent → connection dies → what does the user see, what happens to state, what happens on retry? If the answer isn't in the design, the design isn't done. Timeouts, idempotency keys, and the outbox are the machinery; the *contract* is that mid-request death is a normal Tuesday.

## Rules

- Networked changes are demoed in airplane mode before review: drop, reconcile, retry — visible, not assumed.
- Sync engines carry observability: queue depth, failure reasons, sync latency — a silent outbox backlog is a data-loss incident in progress.
