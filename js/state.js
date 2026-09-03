// js/state.js
// Central app state. Two things matter for the WebMCP story here:
//
// 1. Drafts move through an explicit lifecycle: draft -> confirmed -> submitted.
//    submit_report() refuses to run unless confirmed === true. This is the
//    "safety-critical confirmation gate" — the model cannot talk its way past it,
//    because the gate is a real boolean checked in code, not a re-reasoning step.
//
// 2. Every mutating tool call pushes a real action onto actionStack. undo_last_action
//    pops that stack and reverses the effect. It does not ask the model to "undo by
//    reasoning about what it did" — it replays a recorded inverse operation.

import { addReport, removeReport } from "./reports.js";

let draftSeq = 1;

const state = {
  drafts: new Map(), // draftId -> draft object
  actionStack: [], // { type, payload, inverse() }
  listeners: new Set(),
};

/**
 * Structured error helper. Every gate below throws one of these instead of a
 * bare Error, so a WebMCP-calling agent (or a test) can branch on `error.code`
 * instead of parsing the human-readable message string. The message text is
 * unchanged from before this was added, so existing message-based assertions
 * still hold — `code` is additive.
 */
function gateError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Test-only helper: clears all in-memory draft/action state so each test can
 * run against a clean session, matching what most tests already assume in
 * their own descriptions (e.g. "on a clean session"). Not imported or called
 * from any production code path (app.js, webmcp-tools.js never import this).
 */
export function resetStateForTests() {
  state.drafts.clear();
  state.actionStack.length = 0;
  draftSeq = 1;
}

export function subscribe(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

function emit(event) {
  for (const fn of state.listeners) fn(event);
}

export function createDraft({ category, description, lat, lng, locationText, photoNote }) {
  const id = `draft-${draftSeq++}`;
  const draft = {
    id,
    category,
    description,
    lat,
    lng,
    locationText: locationText || null,
    photoFileName: photoNote?.fileName || null,
    photoSizeBytes: Number.isFinite(photoNote?.sizeBytes) ? photoNote.sizeBytes : null,
    risk: classifyRisk(description),
    safetyAcknowledged: false,
    reviewedAt: null,
    lastDuplicateCheck: null,
    confirmed: false,
    submitted: false,
    reportId: null,
    createdAt: new Date().toISOString(),
  };
  state.drafts.set(id, draft);
  emit({ type: "draft_created", draft });
  return draft;
}

export function getDraft(draftId) {
  return state.drafts.get(draftId) || null;
}

export function listDrafts() {
  return [...state.drafts.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function confirmDraft(draftId) {
  const draft = state.drafts.get(draftId);
  if (!draft) throw gateError("DRAFT_NOT_FOUND", `No draft found with id ${draftId}`);
  if (draft.submitted) throw gateError("DRAFT_ALREADY_SUBMITTED", `Draft ${draftId} was already submitted and cannot be re-confirmed`);
  // Safety-critical acknowledgement is checked before the general review gate
  // so an agent confirming a hazardous draft is told about the safety
  // requirement first, not a generic "please review" message.
  if (draft.risk.level === "critical" && !draft.safetyAcknowledged) {
    throw gateError("SAFETY_ACKNOWLEDGEMENT_REQUIRED", `Draft ${draftId} is safety-critical. Acknowledge the safety guidance before confirming.`);
  }
  if (!draft.reviewedAt) throw gateError("DRAFT_NOT_REVIEWED", `Draft ${draftId} has not been reviewed. Call read_report_summary before confirming.`);
  draft.confirmed = true;
  emit({ type: "draft_confirmed", draft });
  return draft;
}

export function markDraftReviewed(draftId) {
  const draft = state.drafts.get(draftId);
  if (!draft) throw gateError("DRAFT_NOT_FOUND", `No draft found with id ${draftId}`);
  draft.reviewedAt = new Date().toISOString();
  emit({ type: "draft_reviewed", draft });
  return draft;
}

export function recordDuplicateCheck(draftId, result) {
  const draft = state.drafts.get(draftId);
  if (!draft) throw gateError("DRAFT_NOT_FOUND", `No draft found with id ${draftId}`);
  draft.lastDuplicateCheck = { ...result, checkedAt: new Date().toISOString() };
  emit({ type: "duplicate_check_completed", draft });
  return draft;
}

export function acknowledgeSafetyGuidance(draftId) {
  const draft = state.drafts.get(draftId);
  if (!draft) throw gateError("DRAFT_NOT_FOUND", `No draft found with id ${draftId}`);
  if (draft.risk.level !== "critical") throw gateError("SAFETY_ACKNOWLEDGEMENT_NOT_APPLICABLE", `Draft ${draftId} does not require safety acknowledgement.`);
  if (draft.submitted) throw gateError("DRAFT_ALREADY_SUBMITTED", `Draft ${draftId} was already submitted.`);
  draft.safetyAcknowledged = true;
  emit({ type: "safety_acknowledged", draft });
  return draft;
}

/**
 * Submits a draft. Throws unless draft.confirmed === true — this is the gate.
 * On success, records a real inverse action on the stack for undo.
 */
export function submitDraft(draftId) {
  const draft = state.drafts.get(draftId);
  if (!draft) throw gateError("DRAFT_NOT_FOUND", `No draft found with id ${draftId}`);
  if (draft.submitted) throw gateError("DRAFT_ALREADY_SUBMITTED", `Draft ${draftId} was already submitted`);
  // This is the core safety gate (see CORE SAFETY REQUIREMENT): a draft must
  // be both reviewed AND explicitly confirmed before it can become a report.
  // Both checks run every time, regardless of caller — there is no path that
  // creates a report without passing through both of them.
  if (!draft.confirmed) {
    throw gateError(
      "DRAFT_NOT_CONFIRMED",
      `Draft ${draftId} has not been confirmed by the human yet. Call read_report_summary and get explicit confirm_submission before submit_report.`
    );
  }
  if (!draft.reviewedAt) throw gateError("DRAFT_NOT_REVIEWED", `Draft ${draftId} has not been reviewed. Call read_report_summary before submit_report.`);

  const record = addReport(draft);
  draft.submitted = true;
  draft.reportId = record.id;

  pushAction({
    type: "submit_report",
    label: `Submitted report ${record.id} (${draft.category})`,
    payload: { draftId, reportId: record.id },
    undoable: draft.risk.level !== "critical",
    inverse: () => {
      removeReport(record.id);
      draft.submitted = false;
      draft.reportId = null;
      emit({ type: "report_retracted", draft, reportId: record.id });
    },
  });

  emit({ type: "report_submitted", draft, record });
  return record;
}

function pushAction(action) {
  state.actionStack.push(action);
  emit({ type: "action_pushed", action });
}

export function peekLastAction() {
  return state.actionStack[state.actionStack.length - 1] || null;
}

export function undoLastAction() {
  const action = state.actionStack[state.actionStack.length - 1];
  if (!action) return null;
  if (action.undoable === false) return { blocked: true, action };
  state.actionStack.pop();
  action.inverse();
  emit({ type: "action_undone", action });
  return action;
}

const CRITICAL_HAZARDS = [
  "downed power line",
  "downed powerline",
  "gas smell",
  "gas leak",
  "exposed wiring",
  "exposed wire",
  "live wire",
  "sparking wire",
];

export function classifyRisk(description = "") {
  const normalized = description.toLowerCase();
  const matchedPhrases = CRITICAL_HAZARDS.filter((phrase) => normalized.includes(phrase));
  return matchedPhrases.length
    ? {
        level: "critical",
        matchedPhrases,
        safetyMessage: "This may be an immediate danger. Keep clear and contact emergency services if anyone is at risk. This report cannot be retracted after submission.",
      }
    : { level: "routine", matchedPhrases: [], safetyMessage: null };
}

export function actionHistory() {
  return state.actionStack.slice().reverse();
}
