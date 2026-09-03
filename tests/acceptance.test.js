// tests/acceptance.test.js
//
// This file is the executable version of the hackathon-upgrade acceptance
// scenario:
//
//   User intent -> real WebMCP tool invocation -> report draft ->
//   duplicate/nearby check -> human-visible review -> explicit human
//   confirmation -> submission -> persistent demo tracking ID ->
//   status lookup of THAT SAME RECORD -> visible activity timeline
//
// Every assertion below runs against the actual tool closures returned by
// buildFieldNotesTools() (the same functions document.modelContext registers
// in the browser and the Tool Tester calls manually) and the actual
// js/state.js gate — nothing here is mocked or re-implemented.

import test from "node:test";
import assert from "node:assert/strict";
import { buildFieldNotesTools } from "../js/webmcp-tools.js";
import { distanceMeters } from "../js/reports.js";
import { resetStateForTests } from "../js/state.js";

function getTool(tools, name) {
  const t = tools.find((x) => x.name === name);
  assert.ok(t, `tool ${name} should be registered`);
  return t;
}

test.beforeEach(() => resetStateForTests());

test("ACCEPTANCE: report a pothole end-to-end — draft, duplicate check, review, confirmation gate, submission, tracking, status, timeline", async () => {
  const timeline = [];
  const tools = buildFieldNotesTools({ onToolCall: (entry) => timeline.push(entry.name) });

  const reportCivicIssue = getTool(tools, "report_civic_issue");
  const checkDuplicates = getTool(tools, "check_duplicate_reports");
  const readSummary = getTool(tools, "read_report_summary");
  const confirmSubmission = getTool(tools, "confirm_submission");
  const submitReport = getTool(tools, "submit_report");
  const getStatus = getTool(tools, "get_report_status");

  // Coordinates far from every seeded report in js/reports.js, so this test
  // is not accidentally coupled to the seed data's positions.
  const FRESH_LOCATION = { lat: 39.7392, lng: -104.9903 };

  // --- Step 1: real WebMCP tool invocation -> report draft -------------
  // "User asks to report a pothole." The agent uses the actual
  // report_civic_issue capability — this is the intent-level tool, not a
  // hand-built draft object.
  const draftResult = await reportCivicIssue.execute({
    issue_type: "pothole",
    description: "Deep pothole in the right lane near the intersection.",
    lat: FRESH_LOCATION.lat,
    lng: FRESH_LOCATION.lng,
  });
  assert.match(draftResult.draft_id, /^draft-/);
  assert.equal(draftResult.action_state, "READY_FOR_CONFIRMATION");
  assert.equal(draftResult.external_submission, "NOT_ATTEMPTED");
  assert.equal(draftResult.authority, "Spotigo Demo Authority");
  assert.equal(draftResult.mode, "Simulated civic backend");
  const draftId = draftResult.draft_id;

  // --- Step 2: duplicate/nearby check -----------------------------------
  const duplicateResult = await checkDuplicates.execute({ draft_id: draftId });
  assert.equal(duplicateResult.duplicate_count, 0);
  assert.equal(duplicateResult.duplicate_assessment, "NO_NEARBY_REPORTS");

  // --- Safety negative test A: cannot submit an unreviewed draft --------
  await assert.rejects(
    () => submitReport.execute({ draft_id: draftId }),
    (err) => err.code === "DRAFT_NOT_CONFIRMED" && /not been confirmed/i.test(err.message)
  );
  // Confirming before review is also refused — review must happen first.
  await assert.rejects(
    () => confirmSubmission.execute({ draft_id: draftId, confirm: true }),
    (err) => err.code === "DRAFT_NOT_REVIEWED"
  );

  // --- Step 3: human-visible review --------------------------------------
  const summaryResult = await readSummary.execute({ draft_id: draftId });
  assert.equal(summaryResult.reviewed, true);
  assert.equal(summaryResult.confirmed, false);
  assert.equal(summaryResult.authority, "Spotigo Demo Authority");
  assert.equal(summaryResult.mode, "Simulated civic backend");

  // --- Safety negative test B: reviewed but NOT confirmed still refused -
  await assert.rejects(
    () => submitReport.execute({ draft_id: draftId }),
    (err) => err.code === "DRAFT_NOT_CONFIRMED"
  );

  // --- Step 4: explicit human confirmation -------------------------------
  const confirmResult = await confirmSubmission.execute({ draft_id: draftId, confirm: true });
  assert.equal(confirmResult.confirmed, true);
  assert.equal(confirmResult.reviewed, true);

  // --- Step 5: confirmed submission succeeds -----------------------------
  const submitResult = await submitReport.execute({ draft_id: draftId });
  assert.match(submitResult.tracking_id, /^MR-\d+$/);
  assert.equal(submitResult.report_id, submitResult.tracking_id);
  assert.equal(submitResult.authority, "Spotigo Demo Authority");
  assert.equal(submitResult.mode, "Simulated civic backend");
  const trackingId = submitResult.tracking_id;

  // --- Step 6: status lookup of THAT SAME RECORD -------------------------
  const statusResult = await getStatus.execute({ report_id: trackingId });
  assert.equal(statusResult.tracking_id, trackingId);
  assert.equal(statusResult.report_id, trackingId);
  assert.equal(statusResult.category_label, "Pothole or road damage");
  assert.equal(statusResult.authority, "Spotigo Demo Authority");
  assert.equal(statusResult.mode, "Simulated civic backend");
  assert.ok(["submitted", "acknowledged", "in_progress", "resolved"].includes(statusResult.status));

  // --- Step 7: visible activity timeline reflects the real lifecycle -----
  // Every event on this list corresponds to a real tool execute() call made
  // above, in the order it was actually invoked — nothing is fabricated for
  // display purposes.
  assert.deepEqual(timeline, [
    "report_civic_issue",
    "check_duplicate_reports",
    "read_report_summary",
    "confirm_submission",
    "submit_report",
    "get_report_status",
  ]);
});

test("ACCEPTANCE: duplicate check distinguishes no-match, possible-duplicate, and existing-matching-report", async () => {
  const tools = buildFieldNotesTools();
  const checkDuplicates = getTool(tools, "check_duplicate_reports");

  // MR-1031 (seeded pothole) sits at lat 37.7752, lng -122.4189.
  const seedLocation = { lat: 37.7752, lng: -122.4189 };

  // Exactly on top of the seeded report -> EXISTING_MATCHING_REPORT.
  const exact = await checkDuplicates.execute({ lat: seedLocation.lat, lng: seedLocation.lng, category: "pothole", radius_meters: 250 });
  assert.equal(exact.duplicate_assessment, "EXISTING_MATCHING_REPORT");
  assert.ok(exact.matches.some((m) => m.report_id === "MR-1031"));

  // A nearby-but-not-coincident point: derive an offset that is inside the
  // default 250m search radius but outside the tight "existing match" band,
  // rather than hard-coding a guessed degree delta.
  const nearbyButDistinct = { lat: seedLocation.lat + 0.0009, lng: seedLocation.lng };
  const distance = distanceMeters(seedLocation, nearbyButDistinct);
  assert.ok(distance > 25 && distance < 250, `test fixture assumption broken: distance was ${distance}m`);
  const nearby = await checkDuplicates.execute({ lat: nearbyButDistinct.lat, lng: nearbyButDistinct.lng, category: "pothole", radius_meters: 250 });
  assert.equal(nearby.duplicate_assessment, "POSSIBLE_DUPLICATE");

  // Far away -> no nearby reports at all.
  const farAway = await checkDuplicates.execute({ lat: 10, lng: 10, category: "pothole", radius_meters: 250 });
  assert.equal(farAway.duplicate_assessment, "NO_NEARBY_REPORTS");
  assert.equal(farAway.duplicate_count, 0);
});

test("ACCEPTANCE: demo authority and simulated-mode labeling never claims a real government submission", async () => {
  const tools = buildFieldNotesTools();
  const describe = getTool(tools, "describe_issue_accessibly");
  const readSummary = getTool(tools, "read_report_summary");
  const confirm = getTool(tools, "confirm_submission");
  const submit = getTool(tools, "submit_report");

  const draft = await describe.execute({ category: "signal", description: "Traffic signal stuck on red in all directions" });
  await readSummary.execute({ draft_id: draft.draft_id });
  await confirm.execute({ draft_id: draft.draft_id, confirm: true });
  const submitted = await submit.execute({ draft_id: draft.draft_id });

  assert.equal(submitted.authority, "Spotigo Demo Authority");
  assert.equal(submitted.mode, "Simulated civic backend");
  assert.doesNotMatch(submitted.summary, /BBMP|311|city hall|government (has|received)/i);
});
