import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ActionStore, ACTION_STATES } from "../server/action-store.js";
import { handleMcpRequest } from "../server/mcp.js";
import { createSpotigoServer } from "../server.js";
import { AuthorityResolver, UnavailableAuthorityAdapter } from "../server/authority.js";

async function withStore(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "spotigo-test-"));
  try {
    await run(await new ActionStore(path.join(directory, "actions.json")).init());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("persistent action lifecycle distinguishes Spotigo creation from external submission", async () => {
  await withStore(async (store) => {
    const prepared = await store.create({ issue_type: "pothole", location: "5th and Main", description: "Deep pothole" });
    assert.equal(prepared.state, ACTION_STATES.READY_FOR_CONFIRMATION);
    assert.equal(prepared.authority.status, "UNKNOWN");
    await assert.rejects(() => store.execute(prepared.id), /explicitly confirmed/i);
    const confirmed = await store.confirm(prepared.id, true);
    assert.equal(confirmed.state, ACTION_STATES.CONFIRMED);
    const executed = await store.execute(prepared.id);
    assert.equal(executed.state, ACTION_STATES.SUBMITTED_TO_SPOTIGO);
    assert.equal(executed.result.externalSubmission, "NOT_ATTEMPTED");
    assert.match(executed.result.spotigoReference, /^SP-/);
    assert.equal((await store.execute(prepared.id)).result.spotigoReference, executed.result.spotigoReference);
  });
});

test("authority resolution and adapter boundary fail closed when no verified integration exists", async () => {
  const resolution = await new AuthorityResolver().resolve({ issueType: "pothole", location: "5th and Main" });
  assert.equal(resolution.status, "UNKNOWN");
  const adapter = new UnavailableAuthorityAdapter();
  await assert.rejects(() => adapter.submit(), /unavailable/i);
  assert.equal((await adapter.verifySubmission()).status, "UNAVAILABLE");
});

test("remote MCP exposes semantic civic actions and preserves the confirmation gate", async () => {
  await withStore(async (store) => {
    const listed = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, store);
    assert.ok(listed.result.tools.some((tool) => tool.name === "prepare_civic_report"));

    const preparedResponse = await handleMcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "prepare_civic_report", arguments: { issue_type: "streetlight", location: "Oak Street", description: "Lamp is out" } } }, store);
    const prepared = preparedResponse.result.structuredContent.action;
    assert.equal(prepared.state, ACTION_STATES.READY_FOR_CONFIRMATION);

    const rejected = await handleMcpRequest({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "execute_action", arguments: { action_id: prepared.id } } }, store);
    assert.match(rejected.error.message, /explicitly confirmed/i);
  });
});

test("HTTP server exposes the capability and remote MCP endpoints", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "spotigo-http-test-"));
  const { server } = await createSpotigoServer({ dataFile: path.join(directory, "actions.json"), authTokens: { agentA: "test-token" } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const capabilities = await fetch(`http://127.0.0.1:${port}/api/capabilities`).then((response) => response.json());
    assert.ok(capabilities.capabilities.some((capability) => capability.id === "report_civic_issue"));
    const mcp = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-token" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }).then((response) => response.json());
    assert.ok(mcp.result.tools.some((tool) => tool.name === "prepare_civic_report"));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("HTTP mutation endpoints require valid authentication and enforce action ownership", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "spotigo-security-test-"));
  const { server } = await createSpotigoServer({ dataFile: path.join(directory, "actions.json"), authTokens: { agentA: "token-a", agentB: "token-b" } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(`${base}${path}`, options);
  try {
    const unauthenticated = await request("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ issue_type: "pothole", location: "Main Street" }) });
    assert.equal(unauthenticated.status, 401);
    const invalid = await request("/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer wrong" }, body: "{}" });
    assert.equal(invalid.status, 401);
    const created = await request("/api/actions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer token-a" }, body: JSON.stringify({ issue_type: "pothole", location: { lat: 1, lng: 1 }, description: "Deep pothole" }) });
    assert.equal(created.status, 201);
    const action = (await created.json()).action;
    const otherUser = await request(`/api/actions/${action.id}`, { headers: { authorization: "Bearer token-b" } });
    assert.equal(otherUser.status, 404);
    const traversal = await request("/api/actions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer token-a" }, body: JSON.stringify({ issue_type: "pothole", location: "../../secret" }) });
    assert.equal(traversal.status, 400);
    const oversized = await request("/api/actions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer token-a" }, body: JSON.stringify({ issue_type: "pothole", location: "Main Street", description: "x".repeat(300_000) }) });
    assert.equal(oversized.status, 413);
    const execute = await request("/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer token-a" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "execute_action", arguments: { action_id: action.id } } }) });
    const executeBody = await execute.json();
    assert.equal(execute.status, 200);
    assert.equal(executeBody.error.data.error, "CONFIRMATION_REQUIRED");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
