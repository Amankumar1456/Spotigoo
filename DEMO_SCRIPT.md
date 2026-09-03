# Demo video script (target: under 3 minutes)

Rule for this cut: **open on the confirm gate, not on the form.** Anyone can demo "agent fills out a form." The thing worth 10 seconds of judge attention up front is the moment an agent tries to file something without permission and gets refused.

## 0:00–0:20 — Cold open on the refusal

- Screen: Tool Tester panel, `submit_report` selected, a `draft_id` from an unconfirmed draft pasted in.
- Click "Run tool."
- **On screen:** the error — `"Draft ... has not been confirmed by the human yet."`
- Voiceover: "This is Field Notes. An agent can prepare a civic issue report — but it cannot file one. Only a human can do that, and here's why that matters."

## 0:20–0:45 — The problem, stated plainly

- Voiceover over a shot of a typical city 311 web form: "Reporting a pothole or a broken streetlight usually means finding the right city form, reading it, and typing into it. If you can't see the screen well, can't read comfortably, or just have your hands full, you probably don't file the report — and the problem doesn't get fixed."

## 0:45–1:45 — The real flow, voice-first

- Open Field Notes fresh.
- Click the 🎙️ mic button, speak: *"There's a big pothole right at the crosswalk on 5th and Main."*
- Show the transcript landing in the description field, category auto-selected.
- Click "Create draft" — show the draft appearing in the Draft panel.
- Click "Check for duplicates" — show the plain-language result (either "no matches" or a nearby existing report, whichever the seed data returns for this location).
- Click "Read back summary" — **let the text-to-speech actually play** for a few seconds on camera. This is the accessibility core, not a footnote.
- Point out the checkbox is disabled until this point, then becomes enabled.

## 1:45–2:15 — The gate, shown from the human side

- Check the confirmation box.
- Click "Submit report."
- Show the success message and the new report appearing in the Nearby Reports list in real time.
- Voiceover: "That checkbox is the whole point. The agent structured everything, checked for duplicates, and read it back — but the submission only happened because a human explicitly said yes. That's enforced in code: `submit_report` throws if the draft isn't confirmed. Not a prompt asking the model to be careful — a real gate."

## 2:15–2:40 — Undo, and the shared session

- Click "Undo last action" — show the report disappearing from the list and the log entry.
- Point at the Agent Activity Log: "Every one of these calls — mine, or an agent's, acting in this same tab — shows up here live. There's no separate 'agent path' and 'human path.' It's one session."

## 2:40–3:00 — Close

- Quick pan across the Tool Tester panel: "8 WebMCP tools, all invokable directly for testing, all live in `chrome://flags/#enable-webmcp-testing` or ChatGPT's in-app browser."
- End card: live URL, GitHub repo link, MIT license.

## Recording checklist

- [ ] Record in Chrome with `chrome://flags/#enable-webmcp-testing` enabled so the "✅ WebMCP tools registered" badge shows green, not the fallback message.
- [ ] Confirm system audio/mic permissions are granted before recording so the voice input and TTS readback both work on camera.
- [ ] Use the deployed URL, not localhost, for at least the first and last shots.
- [ ] Upload to YouTube as **unlisted or public** (not private) so judges can access it.
