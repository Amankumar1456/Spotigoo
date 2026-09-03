// js/render.js
// Small, dependency-free DOM rendering helpers. No framework — keeps the app
// zero-build and easy for judges to read start to finish.

import { categoryLabel } from "./reports.js";

export function renderReportsList(el, reports) {
  if (!reports.length) {
    el.innerHTML = `<p class="muted">No reports yet nearby.</p>`;
    return;
  }
  el.innerHTML = reports
    .map(
      (r) => `
      <li class="report-card" data-status="${r.status}">
        <div class="report-card__head">
          <span class="report-card__id">${r.id}</span>
          <span class="pill pill--${r.status}">${r.status.replace("_", " ")}</span>
        </div>
        <p class="report-card__category">${categoryLabel(r.category)}</p>
        <p class="report-card__desc">${escapeHtml(r.description)}</p>
        <p class="muted report-card__meta">${timeAgo(r.reportedAt)} · ${r.source}</p>
      </li>`
    )
    .join("");
}

export function renderDraftReview(el, draft) {
  if (!draft) {
    el.innerHTML = `<p class="muted">No draft yet. Describe an issue to get started.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="draft-review" role="group" aria-label="Draft report review">
      <p><strong>${categoryLabel(draft.category)}</strong></p>
      <p>${escapeHtml(draft.description)}</p>
      <p class="muted">${draft.locationText ? escapeHtml(draft.locationText) : `${draft.lat?.toFixed(4)}, ${draft.lng?.toFixed(4)}`}</p>
      ${draft.photoNote ? `<p class="muted">📷 ${escapeHtml(draft.photoNote)}</p>` : ""}
      <p class="draft-status ${draft.confirmed ? "draft-status--confirmed" : "draft-status--pending"}">
        ${draft.submitted ? "✅ Submitted" : draft.confirmed ? "☑️ Confirmed — ready to submit" : "⏳ Awaiting your confirmation"}
      </p>
    </div>
  `;
}

export function renderActivityLog(el, entries) {
  if (!entries.length) {
    el.innerHTML = `<p class="muted">No tool calls yet. Try the voice/text flow, or run a tool manually below.</p>`;
    return;
  }
  el.innerHTML = entries
    .slice()
    .reverse()
    .map(
      (e) => `
      <li class="log-entry">
        <div class="log-entry__head">
          <code>${e.name}</code>
          <time class="muted">${new Date(e.at).toLocaleTimeString()}</time>
        </div>
        <p class="log-entry__summary">${escapeHtml(e.output?.summary || JSON.stringify(e.output))}</p>
      </li>`
    )
    .join("");
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
