# Spotigo demo video script (under 3 minutes)

## 0:00–0:20 — Lead with the thesis

- Open the deployed Netlify Spotigo page in a Browser WebMCP-capable browser.
- Voiceover: **“I did not tell the agent how to use this website. I only said: ‘I want to report a pothole.’”**
- Show the agent selecting Spotigo’s semantically described `report_civic_issue` capability and the Agent Activity log recording the invocation.
- Do not say “Spotigo” in the prompt. The point is intent-to-capability discovery, not a scripted website command.

## 0:20–0:45 — Prove the actual agent invocation

- Use the exact prompt: **“I want to report a pothole at the corner of 5th and Main. It is deep and beside the crosswalk.”**
- Show the agent preparing the report through `report_civic_issue`.
- Point out the location: if browser location permission was granted, it uses the browser’s coordinates; otherwise the UI/output explicitly says `Demo location: Market Street & 5th Street, San Francisco`. It never invents random coordinates.
- Voiceover: “The agent found a narrow civic-reporting capability, but it has only created a local draft. No government authority has been contacted.”

## 0:45–1:20 — Show the hard confirmation gate

- In the Tool Tester, select `submit_report` and invoke it for the fresh, unconfirmed `draft_id`.
- Show the refusal.
- Voiceover: “The agent cannot jump from intent to submission. `submit_report` checks confirmed state in code; this is not a prompt asking the model to behave.”

## 1:20–1:55 — Review and explicit human consent

- Ask the agent to call `check_duplicate_reports`, then `read_report_summary`.
- Let the browser text-to-speech read the summary for a few seconds.
- The human checks the confirmation box, then the agent calls `submit_report`.
- Show the `MR-*` Spotigo-local report appearing in Nearby Reports.

## 1:55–2:20 — Explain the shared Browser WebMCP session

- Point to the Agent Activity log: “The human form, Tool Tester, and agent invoke the same 10 Browser WebMCP tool closures in this tab.”
- Show `undo_last_action` removing a routine local report.
- Clarify that `MR-*` is a demo/local report, not a municipal complaint number.

## 2:20–2:45 — Close honestly

- Voiceover: “This deployed Netlify demo is Browser WebMCP. The browser tools are the product being judged; they run in the page and do not depend on a remote server.”
- “The repository contains a separate local Phase 2 server-MCP prototype, but it is not presented as deployed remote MCP.”
- End card: live URL, GitHub repository, MIT license.

## Recording checklist

- [ ] Record the deployed Netlify URL, not localhost.
- [ ] Use Chrome with `chrome://flags/#enable-webmcp-testing` enabled, or another Browser WebMCP-capable environment.
- [ ] Capture an actual agent invocation of the exact prompt above—without naming Spotigo.
- [ ] Grant browser location permission for a real-location shot, or leave it denied and show the labelled demo location.
- [ ] Confirm audio/mic permissions before recording so voice input and text-to-speech work.
- [ ] Upload to YouTube as unlisted or public, never private.
