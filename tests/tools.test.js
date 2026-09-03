// tests/tools.test.js
// Runs with Node's built-in test runner (`npm test`). No jsdom needed here
// because webmcp-tools.js / state.js / reports.js are pure logic modules with
// no DOM dependency — document.modelContext is only touched inside
// registerFieldNotesTools(), which we deliberately don't call in these tests.
// We test buildFieldNotesTools() directly, which returns the same tool
// definitions without requiring a browser.

import test from "node:test";
import assert from "node:assert/strict";
import { buildFieldNotesTools } from "../js/webmcp-tools.js";
import { addReport, advanceReportStatuses, getReportById, STATUS, STATUS_TRANSITION_MS } from "../js/reports.js";

function getTool(tools, name) {
  const t = tools.find((x) => x.name === name);
  assert.ok(t, `tool ${name} should be registered`);
  return t;
}

test("all nine tools are defined with name, description, inputSchema, execute", () => {
  const tools = buildFieldNotesTools();
  const expected = [
    "describe_issue_accessibly",
    "acknowledge_safety_guidance",
    "check_duplicate_reports",
    "read_report_summary",
    "confirm_submission",
    "submit_report",
    "undo_last_action",
    "list_nearby_reports",
    "get_report_status",
  ];
  const names = tools.map((t) => t.name);
  for (const name of expected) assert.ok(names.includes(name), `missing tool ${name}`);
  for (const t of tools) {
    assert.equal(typeof t.name, "string");
    assert.equal(typeof t.description, "string");
    assert.equal(typeof t.execute, "function");
    assert.equal(t.inputSchema.type, "object");
  }
});

test("photo metadata is retained in the readable draft summary without claiming image analysis", async () => {
  const tools = buildFieldNotesTools();
  const draft = await getTool(tools, "describe_issue_accessibly").execute({
    category: "pothole",
    description: "Pothole beside the crossing",
    photo_filename: "street-damage.jpg",
    photo_size_bytes: 245000,
  });
  const summary = await getTool(tools, "read_report_summary").execute({ draft_id: draft.draft_id });
  assert.match(summary.summary, /street-damage\.jpg/);
  assert.match(summary.summary, /239 KB/);
});

test("critical hazards require two explicit confirmations and cannot be undone", async () => {
  const tools = buildFieldNotesTools();
  const describe = getTool(tools, "describe_issue_accessibly");
  const acknowledge = getTool(tools, "acknowledge_safety_guidance");
  const confirm = getTool(tools, "confirm_submission");
  const submit = getTool(tools, "submit_report");
  const undo = getTool(tools, "undo_last_action");

  const draft = await describe.execute({ category: "other", description: "A downed power line is sparking near the playground" });
  assert.equal(draft.risk_level, "critical");
  await assert.rejects(() => confirm.execute({ draft_id: draft.draft_id, confirm: true }), /safety-critical/i);
  await acknowledge.execute({ draft_id: draft.draft_id, acknowledge: true });
  await confirm.execute({ draft_id: draft.draft_id, confirm: true });
  await submit.execute({ draft_id: draft.draft_id });
  const undoResult = await undo.execute({});
  assert.equal(undoResult.undone, false);
  assert.equal(undoResult.safety_critical, true);
});

test("new reports progress through the mock city lifecycle when status is checked", () => {
  const record = addReport({ category: "streetlight", description: "Light out", lat: 1, lng: 1 });
  advanceReportStatuses(Date.now() + STATUS_TRANSITION_MS);
  assert.equal(getReportById(record.id).status, STATUS.ACKNOWLEDGED);
});

test("describe_issue_accessibly creates a draft with a plain-language summary", async () => {
  const tools = buildFieldNotesTools();
  const describe = getTool(tools, "describe_issue_accessibly");
  const out = await describe.execute({
    category: "pothole",
    description: "Large pothole near the crosswalk",
    location_text: "5th and Main",
  });
  assert.ok(out.draft_id.startsWith("draft-"));
  assert.equal(out.category, "pothole");
  assert.match(out.summary, /Draft created/);
});

test("submit_report REFUSES an unconfirmed draft — the core safety gate", async () => {
  const tools = buildFieldNotesTools();
  const describe = getTool(tools, "describe_issue_accessibly");
  const submit = getTool(tools, "submit_report");

  const draft = await describe.execute({
    category: "streetlight",
    description: "Light out on Oak St",
  });

  await assert.rejects(
    () => submit.execute({ draft_id: draft.draft_id }),
    /has not been confirmed/i,
    "submit_report must throw when the draft was never confirmed"
  );
});

test("confirm_submission requires confirm === true, not just truthy", async () => {
  const tools = buildFieldNotesTools();
  const describe = getTool(tools, "describe_issue_accessibly");
  const confirm = getTool(tools, "confirm_submission");

  const draft = await describe.execute({ category: "graffiti", description: "Tagging on the underpass wall" });

  await assert.rejects(() => confirm.execute({ draft_id: draft.draft_id, confirm: "yes" }));
  await assert.rejects(() => confirm.execute({ draft_id: draft.draft_id, confirm: 1 }));
  const ok = await confirm.execute({ draft_id: draft.draft_id, confirm: true });
  assert.equal(ok.confirmed, true);
});

test("full happy path: describe -> confirm -> submit succeeds and is undoable", async () => {
  const tools = buildFieldNotesTools();
  const describe = getTool(tools, "describe_issue_accessibly");
  const confirm = getTool(tools, "confirm_submission");
  const submit = getTool(tools, "submit_report");
  const undo = getTool(tools, "undo_last_action");
  const status = getTool(tools, "get_report_status");

  const draft = await describe.execute({ category: "trash", description: "Overflowing bin behind the deli" });
  await confirm.execute({ draft_id: draft.draft_id, confirm: true });
  const submitted = await submit.execute({ draft_id: draft.draft_id });
  assert.match(submitted.report_id, /^MR-/);

  const found = await status.execute({ report_id: submitted.report_id });
  assert.equal(found.status, "submitted");

  const undone = await undo.execute({});
  assert.equal(undone.undone, true);

  await assert.rejects(() => status.execute({ report_id: submitted.report_id }), /No report found/);
});

test("check_duplicate_reports finds the seeded nearby pothole report", async () => {
  const tools = buildFieldNotesTools();
  const dupeCheck = getTool(tools, "check_duplicate_reports");
  // Coordinates match the seeded MR-1031 pothole report in js/reports.js
  const out = await dupeCheck.execute({ lat: 37.7752, lng: -122.4189, category: "pothole", radius_meters: 50 });
  assert.ok(out.duplicate_count >= 1, "should find the seeded pothole report at this exact location");
  assert.ok(out.matches.some((m) => m.report_id === "MR-1031"));
});

test("check_duplicate_reports returns zero matches far from any seeded report", async () => {
  const tools = buildFieldNotesTools();
  const dupeCheck = getTool(tools, "check_duplicate_reports");
  const out = await dupeCheck.execute({ lat: 10.0, lng: 10.0, category: "pothole", radius_meters: 100 });
  assert.equal(out.duplicate_count, 0);
});

test("undo_last_action reports nothing to undo on a clean session", async () => {
  const tools = buildFieldNotesTools();
  const undo = getTool(tools, "undo_last_action");
  const out = await undo.execute({});
  assert.equal(out.undone, false);
});

test("read_report_summary reflects confirmation state accurately", async () => {
  const tools = buildFieldNotesTools();
  const describe = getTool(tools, "describe_issue_accessibly");
  const readSummary = getTool(tools, "read_report_summary");
  const confirm = getTool(tools, "confirm_submission");

  const draft = await describe.execute({ category: "flooding", description: "Standing water blocking the bike lane" });
  const before = await readSummary.execute({ draft_id: draft.draft_id });
  assert.match(before.summary, /NOT yet been confirmed/);

  await confirm.execute({ draft_id: draft.draft_id, confirm: true });
  const after = await readSummary.execute({ draft_id: draft.draft_id });
  assert.match(after.summary, /ready to submit/);
});
