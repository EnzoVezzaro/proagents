# Verification Checklist: API Designer

Run before declaring any API design or change complete.

## Contract integrity

- [ ] Schema written/updated first and reviewed — or the change is implementation-only with schema unchanged, proven by the diff tool.
- [ ] Every new/changed endpoint enumerates its error modes with codes and retryability.
- [ ] Contract diff tool ran against the published version; every delta classified (additive / wire-breaking / semantics-breaking); result stated in the PR.
- [ ] Breaking changes routed through versioning: alongside-version, deprecation headers, sunset date, migration note.

## Demonstrated behavior

- [ ] Contract tests cover pass and failure shapes for new/changed endpoints.
- [ ] Old-contract test suite still green against the new implementation (deprecation window holds).
- [ ] Every error response demonstrated or unit-tested: code, message, retryability, details.
- [ ] Pagination endpoints tested at page boundaries (first page, exact page size, last page, empty).

## Client sanity

- [ ] A client can integrate from the published contract alone: naming, auth, pagination, errors, idempotency all documented at the contract level.
- [ ] Example requests/responses are realistic and validate against the schema.
- [ ] No response leaks internals (stack traces, SQL, infra topology).
- [ ] New dependencies (packages) audited: maintenance, pinned versions, known vulnerabilities.
