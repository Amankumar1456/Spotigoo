# Spotigo 

Spotigo is a hackathon civic-action layer for accessible issue reporting. Spotigo is the browser experience; Spotigo exposes civic-reporting intent to compatible MCP clients. A report is created only after explicit confirmation, and it is always a **Spotigo-local report**, not a government complaint.

## Current system

- Accessible, voice- and photo-first browser experience with in-tab WebMCP tools.
- Persistent local action store: `data/spotigo-actions.json`.
- Authenticated JSON-RPC MCP endpoint: `POST /mcp`.
- Public read-only capability endpoint: `GET /api/capabilities`.
- Authenticated action endpoints: `POST /api/actions`, `GET /api/actions/:id`.
- Fail-closed `AuthorityResolver` / `UnavailableAuthorityAdapter`: authority is `UNKNOWN`; external submission and verification are unavailable.

There is no government portal integration, official complaint ID, or government submission.

## Lifecycle

```text
report_civic_issue -> READY_FOR_CONFIRMATION
confirm_action      -> CONFIRMED
execute_action      -> SUBMITTED_TO_SPOTIGO
```

The server controls transitions. Execution rejects unconfirmed actions. Repeated execution returns the existing result and does not create a duplicate report.

## MCP tools

All `POST /mcp` requests require `Authorization: Bearer <token>`.

| Tool | Purpose |
|---|---|
| `discover_spotigo_capabilities` | Lists implemented civic actions only. |
| `report_civic_issue` | Prepares a Spotigo-local report for a pothole, broken streetlight, road damage, garbage issue, or similar civic issue. |
| `prepare_civic_report` | Backwards-compatible alias for `report_civic_issue`. |
| `read_action_summary` | Reads current state and the confirmation gate. |
| `confirm_action` | Records explicit `confirm: true`. |
| `execute_action` | Creates a confirmed Spotigo-local report. |
| `track_action` | Reads the caller's action state. |

Compatible agents can discover these semantic capabilities when connected to this MCP service. Spotigo does not claim automatic discovery by every agent.

## Security model

- Set `SPOTIGO_MCP_AUTH_TOKEN` to a high-entropy secret before starting. Protected requests are unavailable when it is absent.
- Never put the token in browser code, source control, or committed environment files.
- The server derives each action's owner from the authenticated identity. Other callers cannot read, confirm, execute, or track it.
- Input is validated and bounded: supported issue types, 2,000-character descriptions, geographic coordinate ranges, limited primitive evidence metadata, and no filesystem paths.
- JSON bodies are capped at 256 KiB. Evidence is metadata only—files are neither accepted nor loaded.
- `POST /mcp` and `POST /api/actions` have an in-memory limit of 30 requests/minute per identity and source address. This is appropriate for one hackathon instance, not horizontal scaling.
- CORS is off by default. Set `SPOTIGO_ALLOWED_ORIGIN` to one exact frontend origin when required; wildcard origins are not used.
- Responses use sanitized errors and security headers. Logs contain coarse events only—never bearer tokens or full user input.

`data/spotigo-actions.json` is Git-ignored and can contain private report data. Writes are serialized and atomically renamed. Malformed saved data does not crash startup.

## Run locally

```powershell
$env:SPOTIGO_MCP_AUTH_TOKEN = "replace-with-a-long-random-demo-secret"
npm run serve
```

The service listens on `PORT` (default `8080`). Deploy it behind HTTPS. Set `SPOTIGO_ALLOWED_ORIGIN` when a separate browser origin needs access.

```powershell
npm test
```

Tests cover the browser flow, action lifecycle, MCP semantics, authentication, ownership isolation, validation, and confirmation gate.

## Browser tools and limitations

The Spotigo page has ten in-tab WebMCP tools backed by the in-memory demonstration city store in `js/reports.js`. It is distinct from the persistent remote Spotigo API. Neither path contacts a government service.

Implemented: authentication, ownership, validation, request limits, state protection, idempotent local execution, capability discovery, and honest authority status.

Architecturally prepared: verified authority resolution and an adapter boundary.

Not implemented: OAuth/accounts, token rotation/revocation, distributed rate limiting, encryption at rest, file uploads, government submission, government verification, or horizontally scaled persistence.

Next step: replace the static demo token with a verified user/agent identity provider while retaining owner-based authorization.

## License

MIT — see `LICENSE`.
