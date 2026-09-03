# Field Notes

**Report a pothole, broken streetlight, or blocked sidewalk — by voice, by hand, or with your agent. Nothing is ever filed without your explicit okay.**

Built for the WebMCP Hackathon.

## The problem

Municipal 311-style reporting systems assume a user who can see a form, read it, type into it, and navigate a multi-step flow. That excludes a real slice of the population who would otherwise report civic issues: vision-impaired residents, low-literacy users, elderly residents unfamiliar with government web forms, and simply anyone standing in the rain with a phone in one hand and no free hand to type. The result isn't that these people don't have things to report — it's that the reports never get filed, and the infrastructure problem stays unfixed.

## The idea

An agent (in ChatGPT's browser, or any WebMCP-capable client) can listen to a spoken description, structure it into the fields a city needs, check whether it's already been reported, and read the draft back in plain language — but it **cannot** file anything until the human explicitly confirms. That confirmation is enforced in code, not in the model's judgment: `submit_report` throws if `confirmed !== true` on the draft, full stop.

This is the same "read it back before you commit it" pattern that matters for a shopping cart checkout — applied to a civic action instead, where the stakes of an agent guessing wrong (misreporting a location, misclassifying an issue) are arguably higher because it's a public record, not a private purchase.

## Why WebMCP, specifically

WebMCP tools run **inside the user's already-open, already-authenticated tab**. The agent never needs credentials, a separate API key, or a scraping layer — it acts through the same live DOM and JS state the human sees on screen. In Field Notes that means:

- The human's manual form and the agent's tool calls are **not two separate code paths**. `js/app.js`'s buttons call the exact same `tool.execute()` closures that `document.modelContext.registerTool()` hands to an agent (see `js/webmcp-tools.js`, `buildFieldNotesTools()`). If a judge opens the Tool Tester panel and manually runs `submit_report` on an unconfirmed draft, they get the identical rejection an agent would get.
- The **Agent activity log** on the page updates live as tools are called, whether the caller is you clicking buttons or an agent acting through `document.modelContext` — visible proof that human and agent share one session.

## Tool reference

| Tool | Purpose | Notes |
|---|---|---|
| `describe_issue_accessibly` | Turns a spoken/typed description + category into a structured draft | Does not submit anything |
| `check_duplicate_reports` | Finds existing reports near the draft's location/category in the last 30 days | Avoids duplicate city tickets |
| `read_report_summary` | Plain-language readback of the draft exactly as it will be filed | Should be called (and heard) before confirming |
| `confirm_submission` | Records explicit human confirmation (`confirm` must be **boolean** `true`, not merely truthy) | Required before `submit_report` will run |
| `submit_report` | Files the draft | **Throws** if the draft isn't confirmed — this is the hard gate |
| `undo_last_action` | Reverses the most recent mutating action via a real recorded inverse, not model guesswork | Works on submissions within the session |
| `list_nearby_reports` | Browse existing reports near a location | Independent of filing a new one |
| `get_report_status` | Look up a filed report's status by id | |

## Architecture

Zero build step, zero runtime dependencies, static files only:

```
index.html          Semantic, accessible page structure
styles.css           High-contrast, large-target, visible-focus styling
js/reports.js        Mock city reports store (seed data + geo/duplicate logic)
js/state.js          Draft lifecycle (draft -> confirmed -> submitted) + real undo action stack
js/speech.js         Web Speech API wrapper (voice in / voice out), degrades gracefully
js/webmcp-tools.js   Tool definitions + document.modelContext.registerTool wiring
js/render.js         DOM rendering helpers (no framework)
js/agent-console.js  On-page manual Tool Tester
js/app.js            Wires it all together; human form calls the same tool.execute() an agent would
tests/               Node --test suite (pure logic) + jsdom smoke test (full DOM flow)
```

The "city backend" is an in-memory mock (`js/reports.js`) seeded with a handful of existing reports so `check_duplicate_reports` has something real to find. In production this module would be the only thing swapped for a real 311/open-data API call — nothing else in the tool layer would need to change.

## Running locally

```bash
npm test      # runs the full test suite (12 tests: gate logic + full DOM flow)
npm run serve # serves the static site at http://localhost:8080 (via npx serve)
```

No `npm install` is required to *run* the app — only `jsdom` is a devDependency, and only for tests.

## Testing with WebMCP

1. Chrome: enable `chrome://flags/#enable-webmcp-testing`, open the deployed URL, and use `navigator.modelContextTesting.listTools()` in devtools to confirm all 8 tools are registered.
2. ChatGPT's in-app browser: open the deployed URL directly.
3. Without either: the **Tool Tester** panel at the bottom of the page lets you invoke any tool manually with raw JSON, using the identical `execute()` function an agent would call.

## Honest limitations

- The city backend is mocked in-memory and resets on page reload — there is no real persistence or real municipal integration. That's a deliberate hackathon-scope decision, not an oversight; the tool layer is written so only `js/reports.js` would need replacing to point at a real API.
- Photo input is represented as a text `photo_note` field (a description of what a photo shows), not actual image upload/analysis — full multimodal photo handling was out of scope for the build window.
- Duplicate detection is a simple radius + recency filter, not semantic matching — two different-sounding descriptions of the same pothole at the same spot will still surface as a likely duplicate by distance, but two reports of the same issue described very differently at slightly different coordinates might not.
- `undo_last_action` only reverses actions taken within the current browser session/tab; it does not call a real "retract my 311 ticket" city API, because most cities don't expose one.

## License

MIT — see `LICENSE`.
