# Capture protocol v1

Import types and `validateEnvelope` from `@azeroth-weekly/protocol`. Tests can import `createEnvelope` and `createCurrencyEvent` from `@azeroth-weekly/protocol/fixtures`; defaults contain only synthetic identities. All times are Unix seconds; game weeks use `[start, end)`.

`validateEnvelope(unknown)` accepts normalized JSON and returns the same validated envelope. It never fills in missing data or coerces strings, booleans, or numbers. Errors include the failing field path. Unknown numeric/JSON extension values are also checked for finiteness, excessive depth and cycles. A SavedVariables parser must normalize absent nullable fields and ambiguous Lua empty tables by schema before validation; it must never execute the file. Collection failure is represented by nullable values plus explicit capability status, not a guessed zero.

The base contract is unchanged. Two optional extensions are exported: `catalog: RaidCatalog` contains only runtime-discovered raid maps and DungeonEncounter IDs; `diagnostics: DiagnosticObservation[]` retains scalar candidate evidence for manual follow-up. Diagnostic observations are not ledger events and must not be counted as spends. Unknown currency season mappings use the explicit string `unverified`, not a guessed season number.

Run `npm.cmd run test:protocol` for boundary tests, `npm.cmd test` for all tests, and `npm.cmd run typecheck` for TypeScript checks. The root Vitest environment is Node; later renderer suites may opt into jsdom in their own config/file annotation.
