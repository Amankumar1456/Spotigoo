// tests/smoke.test.js
// Loads the real index.html + app.js into jsdom and drives the UI through real
// DOM events (not direct function calls) — this is the closest thing to
// "open it in a browser and click through it" that we can automate in CI.
// document.modelContext is intentionally left undefined here to also verify
// the graceful-fallback path (no WebMCP support) doesn't crash the page.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

async function loadApp() {
  const html = readFileSync(path.join(root, "index.html"), "utf-8");
  const dom = new JSDOM(html, {
    url: "https://example.test/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });

  // jsdom doesn't implement scrollIntoView / matchMedia; stub the ones our code path might touch.
  dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));

  // pathToFileURL is required here, not just path.join — on Windows a raw path
  // like "D:\foo\js\app.js" is not a valid input to import(); it must be a
  // proper file:// URL (file:///D:/foo/js/app.js). path.join() alone works on
  // macOS/Linux but throws ERR_UNSUPPORTED_ESM_URL_SCHEME on Windows.
  const appUrl = pathToFileURL(path.join(root, "js/app.js"));
  appUrl.search = `?t=${Date.now()}`;
  const appModule = await import(appUrl.href);
  // app.js self-inits on DOMContentLoaded when document is loading, but since
  // jsdom's initial HTML is already parsed by the time we import, call init()
  // directly against this dom's document/window.
  const origDocument = global.document;
  const origWindow = global.window;
  global.window = dom.window;
  global.document = dom.window.document;
  appModule.init();
  return { dom, restore: () => { global.document = origDocument; global.window = origWindow; } };
}

test("app boots without throwing when document.modelContext is absent", async () => {
  const { dom, restore } = await loadApp();
  const badge = dom.window.document.getElementById("webmcp-status");
  assert.match(badge.textContent, /Spotigo Browser WebMCP is not available/);
  restore();
});

test("manual form flow: describe -> confirm gate blocks submit -> check -> read -> confirm -> submit", async () => {
  const { dom, restore } = await loadApp();
  const doc = dom.window.document;

  doc.getElementById("category").value = "pothole";
  doc.getElementById("description").value = "Big pothole right at the crosswalk";
  doc.getElementById("issue-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));

  await new Promise((r) => setTimeout(r, 20));
  assert.match(doc.getElementById("draft-review").textContent, /pothole/i);

  // Try to submit before confirming — the button exists but the underlying
  // tool must still refuse.
  doc.getElementById("submit-btn").click();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(doc.getElementById("form-status").textContent, /not been confirmed/i);

  doc.getElementById("check-dupe-btn").click();
  await new Promise((r) => setTimeout(r, 20));

  doc.getElementById("read-summary-btn").click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doc.getElementById("confirm-checkbox").disabled, false);

  doc.getElementById("confirm-checkbox").checked = true;
  doc.getElementById("confirm-checkbox").dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));

  doc.getElementById("submit-btn").click();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(doc.getElementById("form-status").textContent, /Created Spotigo report MR-/);
  assert.match(doc.getElementById("draft-review").textContent, /Submitted/);
  assert.equal(doc.getElementById("status-btn").disabled, false);

  doc.getElementById("status-btn").click();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(doc.getElementById("form-status").textContent, /Tracking ID MR-/);

  restore();
});

test("tool tester panel renders all registered tools as options", async () => {
  const { dom, restore } = await loadApp();
  const doc = dom.window.document;
  const options = [...doc.querySelectorAll("#tool-select option")].map((o) => o.value);
  assert.ok(options.includes("submit_report"));
  assert.ok(options.includes("describe_issue_accessibly"));
  assert.ok(options.includes("report_civic_issue"));
  assert.ok(options.length === 10);
  restore();
});
