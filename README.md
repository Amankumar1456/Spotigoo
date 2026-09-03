# Spotigo

Spotigo is an accessible civic-reporting demonstration for the WebMCP Hackathon. Its thesis is simple: **I did not tell the agent how to use this website.** A compatible agent can infer that Spotigo is relevant to “I want to report a pothole,” invoke a narrow civic-reporting tool, and still cannot submit without explicit human confirmation.

## Deployed demo: Browser WebMCP only

The deployed Netlify site demonstrates **Browser WebMCP**. This is the single judge-facing deployment architecture. It has no dependency on `server.js`, `/mcp`, or `/api/*`.

## Two separate agent interfaces

This repository intentionally contains two different interfaces. They have different runtimes and are not interchangeable.

### Browser WebMCP — the hackathon submission

The deployed Netlify site is a static browser application. When the page is open in a WebMCP-capable browser, it registers these **10 in-tab tools** through `document.modelContext`:

`describe_issue_accessibly`, `report_civic_issue`, `acknowledge_safety_guidance`, `check_duplicate_reports`, `read_report_summary`, `confirm_submission`, `submit_report`, `undo_last_action`, `list_nearby_reports`, and `get_report_status`.

These tools run entirely in the browser against the in-memory demonstration store in `js/reports.js`. In particular, browser `submit_report` does **not** call `POST /api/actions`, `POST /mcp`, or `server.js`. Its confirmation gate therefore works on the static Netlify deployment. The resulting `MR-*` reports are clearly demo/local records and reset on page reload.

### Server MCP — local-only Phase 2 prototype

`server.js` and `server/` implement a separate persistent, authenticated MCP/API service for externally connected agents. Its tools are `discover_spotigo_capabilities`, `report_civic_issue`, `prepare_civic_report`, `read_action_summary`, `confirm_action`, `execute_action`, and `track_action`.

This Node HTTP server is **not deployed with the Netlify demo**. `/mcp` and `/api/*` are unavailable at the Netlify URL by design. This local-only prototype is retained for Phase 2 experimentation; it is not part of the submitted demo and must not be presented as live remote MCP.

## Server prototype details

- Accessible, voice- and photo-first browser experience with in-tab WebMCP tools.
- Location uses provided coordinates first, then browser geolocation when permission is granted. If neither is available, Spotigo explicitly uses `Demo location: Market Street & 5th Street, San Francisco`; it never generates random coordinates.
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

## Optional server MCP tools

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

## Run the optional server locally

```powershell
$env:SPOTIGO_MCP_AUTH_TOKEN = "replace-with-a-long-random-demo-secret"
npm run serve
```

The service listens on `PORT` (default `8080`). Deploy it behind HTTPS. Set `SPOTIGO_ALLOWED_ORIGIN` when a separate browser origin needs access.

```powershell
npm test
```

The suite currently has **22/22 passing tests** covering the browser flow, action lifecycle, MCP semantics, authentication, ownership isolation, validation, explicit demo-location fallback, and confirmation gate.

## Deployment choices

For the hackathon submission, deploy the static site to Netlify and demonstrate the Browser WebMCP tools. No server deployment is required or claimed for that flow.

To demonstrate the optional Server MCP prototype, choose one of these paths:

1. Deploy `server.js` to a Node-capable HTTPS host such as Render, Railway, or Fly.io, set `SPOTIGO_MCP_AUTH_TOKEN`, then point MCP clients to that service's `/mcp` URL. This is the smallest change because it preserves the existing Node server.
2. Adapt the HTTP routes into Netlify Functions and configure redirects for `/mcp` and `/api/*`. This keeps one Netlify deployment but requires a serverless refactor and verification of persistence, which is not appropriate for the current JSON-file store.

Do not claim that the optional server MCP endpoint is live on Netlify unless one of those deployment paths has been completed.

## Browser tools and limitations

The Spotigo page has ten in-tab WebMCP tools backed by the in-memory demonstration city store in `js/reports.js`. It is intentionally distinct from the persistent remote Spotigo API. Neither path contacts a government service.

Implemented: authentication, ownership, validation, request limits, state protection, idempotent local execution, capability discovery, and honest authority status.

Architecturally prepared: verified authority resolution and an adapter boundary.

Not implemented: OAuth/accounts, token rotation/revocation, distributed rate limiting, encryption at rest, file uploads, government submission, government verification, or horizontally scaled persistence.

Next step: replace the static demo token with a verified user/agent identity provider while retaining owner-based authorization.

## License

MIT — see `LICENSE`.
