// js/app.js
// Wires the Spotigo browser app together. The key architectural point: the human-facing form
// below does not have its own separate logic — every button calls the exact
// same tool.execute() closures that document.modelContext exposes to an agent.
// A person and their agent are operating on one shared, live session, which is
// the entire premise of WebMCP.

import { registerFieldNotesTools } from "./webmcp-tools.js";
import { listAllReports } from "./reports.js";
import { isVoiceInputSupported, isVoiceOutputSupported, listenOnce, speak } from "./speech.js";
import { renderReportsList, renderDraftReview, renderActivityLog } from "./render.js";
import { mountToolTester } from "./agent-console.js";
import { subscribe } from "./state.js";

const activityLog = [];
let currentDraftId = null;

function onToolCall(entry) {
  activityLog.push(entry);
  renderActivityLog(document.getElementById("activity-log"), activityLog);
  if ((entry.name === "describe_issue_accessibly" || entry.name === "report_civic_issue") && entry.output?.draft_id) {
    currentDraftId = entry.output.draft_id;
  }
  refreshDraftPanel();
  refreshReportsList();
}

function refreshReportsList() {
  renderReportsList(document.getElementById("reports-list"), listAllReports());
}

function refreshDraftPanel() {
  const el = document.getElementById("draft-review");
  if (!currentDraftId) {
    renderDraftReview(el, null);
    return;
  }
  import("./state.js").then(({ getDraft }) => {
    renderDraftReview(el, getDraft(currentDraftId));
  });
}

function findTool(tools, name) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool;
}

function setStatusMessage(msg, isError = false) {
  const el = document.getElementById("form-status");
  el.textContent = msg;
  el.className = isError ? "status status--error" : "status status--ok";
}

function initHumanForm(tools) {
  const form = document.getElementById("issue-form");
  const categorySelect = document.getElementById("category");
  const descriptionInput = document.getElementById("description");
  const locationInput = document.getElementById("location");
  const photoInput = document.getElementById("photo");
  const photoPreview = document.getElementById("photo-preview");
  const voiceBtn = document.getElementById("voice-btn");
  const checkDupeBtn = document.getElementById("check-dupe-btn");
  const readSummaryBtn = document.getElementById("read-summary-btn");
  const confirmCheckbox = document.getElementById("confirm-checkbox");
  const safetyCheckbox = document.getElementById("safety-checkbox");
  const safetyAcknowledgement = document.getElementById("safety-acknowledgement");
  const confirmLabel = document.getElementById("confirm-label");
  const submitBtn = document.getElementById("submit-btn");
  const statusBtn = document.getElementById("status-btn");
  const undoBtn = document.getElementById("undo-btn");

  voiceBtn.hidden = !isVoiceInputSupported();
  let previewUrl = null;

  photoInput.addEventListener("change", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const [file] = photoInput.files;
    if (!file) {
      photoPreview.hidden = true;
      photoPreview.replaceChildren();
      return;
    }
    previewUrl = URL.createObjectURL(file);
    const image = document.createElement("img");
    image.src = previewUrl;
    image.alt = `Selected photo preview: ${file.name}`;
    const meta = document.createElement("p");
    meta.textContent = `${file.name} · ${formatFileSize(file.size)}`;
    photoPreview.replaceChildren(image, meta);
    photoPreview.hidden = false;
  });
  voiceBtn.addEventListener("click", async () => {
    try {
      setStatusMessage("Listening…");
      const transcript = await listenOnce();
      descriptionInput.value = transcript;
      setStatusMessage(`Heard: "${transcript}"`);
    } catch (err) {
      setStatusMessage(err.message, true);
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const tool = findTool(tools, "describe_issue_accessibly");
      const output = await tool.execute({
        category: categorySelect.value,
        description: descriptionInput.value,
        location_text: locationInput.value || undefined,
        photo_filename: photoInput.files[0]?.name,
        photo_size_bytes: photoInput.files[0]?.size,
      });
      currentDraftId = output.draft_id;
      refreshDraftPanel();
      setStatusMessage("Draft created. Now check for duplicates, then review before confirming.");
      statusBtn.disabled = true;
      confirmCheckbox.checked = false;
      confirmCheckbox.disabled = true;
      safetyCheckbox.checked = false;
      safetyCheckbox.disabled = true;
      safetyAcknowledgement.hidden = output.risk_level !== "critical";
      confirmLabel.textContent = output.risk_level === "critical"
        ? "4b. I have reviewed the summary — file this safety-critical report permanently"
        : "4. I've reviewed the summary — this is accurate, submit it";
    } catch (err) {
      setStatusMessage(err.message, true);
    }
  });

  checkDupeBtn.addEventListener("click", async () => {
    if (!currentDraftId) return setStatusMessage("Describe an issue first.", true);
    try {
      const tool = findTool(tools, "check_duplicate_reports");
      const output = await tool.execute({ draft_id: currentDraftId });
      setStatusMessage(output.summary);
    } catch (err) {
      setStatusMessage(err.message, true);
    }
  });

  readSummaryBtn.addEventListener("click", async () => {
    if (!currentDraftId) return setStatusMessage("Describe an issue first.", true);
    try {
      const tool = findTool(tools, "read_report_summary");
      const output = await tool.execute({ draft_id: currentDraftId });
      setStatusMessage(output.summary);
      if (output.risk_level === "critical") {
        safetyCheckbox.disabled = false;
        confirmCheckbox.disabled = true;
      } else {
        confirmCheckbox.disabled = false;
      }
      if (isVoiceOutputSupported()) speak(output.summary);
    } catch (err) {
      setStatusMessage(err.message, true);
    }
  });

  confirmCheckbox.addEventListener("change", async () => {
    if (!currentDraftId) return;
    if (!confirmCheckbox.checked) return;
    try {
      const tool = findTool(tools, "confirm_submission");
      const output = await tool.execute({ draft_id: currentDraftId, confirm: true });
      setStatusMessage(output.summary);
      refreshDraftPanel();
    } catch (err) {
      setStatusMessage(err.message, true);
      confirmCheckbox.checked = false;
    }
  });

  safetyCheckbox.addEventListener("change", async () => {
    if (!currentDraftId || !safetyCheckbox.checked) return;
    try {
      const tool = findTool(tools, "acknowledge_safety_guidance");
      const output = await tool.execute({ draft_id: currentDraftId, acknowledge: true });
      setStatusMessage(output.summary);
      confirmCheckbox.disabled = false;
      refreshDraftPanel();
    } catch (err) {
      setStatusMessage(err.message, true);
      safetyCheckbox.checked = false;
    }
  });

  submitBtn.addEventListener("click", async () => {
    if (!currentDraftId) return setStatusMessage("Describe an issue first.", true);
    try {
      const tool = findTool(tools, "submit_report");
      const output = await tool.execute({ draft_id: currentDraftId });
      setStatusMessage(output.summary);
      refreshDraftPanel();
      refreshReportsList();
      statusBtn.disabled = false;
    } catch (err) {
      setStatusMessage(err.message, true);
    }
  });

  statusBtn.addEventListener("click", async () => {
    if (!currentDraftId) return setStatusMessage("Create and submit a report first.", true);
    try {
      const { getDraft } = await import("./state.js");
      const draft = getDraft(currentDraftId);
      if (!draft?.reportId) return setStatusMessage("Submit this report before checking its status.", true);
      const output = await findTool(tools, "get_report_status").execute({ report_id: draft.reportId });
      setStatusMessage(output.summary);
      refreshDraftPanel();
      refreshReportsList();
    } catch (err) {
      setStatusMessage(err.message, true);
    }
  });

  undoBtn.addEventListener("click", async () => {
    try {
      const tool = findTool(tools, "undo_last_action");
      const output = await tool.execute({});
      setStatusMessage(output.summary);
      refreshDraftPanel();
      refreshReportsList();
    } catch (err) {
      setStatusMessage(err.message, true);
    }
  });
}

function init() {
  const { registered, tools } = registerFieldNotesTools({ onToolCall });

  const badge = document.getElementById("webmcp-status");
  badge.textContent = registered
    ? "✅ Spotigo Browser WebMCP tools registered — an agent in this tab can act now"
    : "ℹ️ Spotigo Browser WebMCP is not available in this browser — try Chrome with chrome://flags/#enable-webmcp-testing enabled, or ChatGPT's in-app browser. Manual mode still works below.";
  badge.className = registered ? "badge badge--ok" : "badge badge--info";

  initHumanForm(tools);
  mountToolTester(document.getElementById("tool-tester"), tools);
  refreshReportsList();
  refreshDraftPanel();
  renderActivityLog(document.getElementById("activity-log"), activityLog);

  subscribe(() => {
    refreshReportsList();
    refreshDraftPanel();
  });

  // Keeps the mock city lifecycle visible without polling an external service.
  // The interval is intentionally browser-only: jsdom uses timers that keep
  // Node's test runner alive after the smoke test has finished.
  if (!/jsdom/i.test(window.navigator.userAgent)) window.setInterval(refreshReportsList, 1000);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

export { init };

function formatFileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
