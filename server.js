import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ActionStore } from "./server/action-store.js";
import { handleMcpRequest } from "./server/mcp.js";
import { authenticate, MAX_REQUEST_BYTES, ownerId, publicError, rateLimiter, codedError } from "./server/security.js";
import { listCapabilities } from "./js/capabilities.js";
const root = path.dirname(fileURLToPath(import.meta.url));
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
export async function createSpotigoServer({ dataFile = path.join(root, "data", "spotigo-actions.json"), authTokens = configuredTokens(), allowedOrigin = process.env.SPOTIGO_ALLOWED_ORIGIN || "" } = {}) {
  const store = await new ActionStore(dataFile).init(), limiter = rateLimiter();
  const server = createServer(async (req, res) => { try { const url = new URL(req.url, "http://localhost");
    if (req.method === "OPTIONS") return sendOptions(req, res, allowedOrigin);
    if (req.method === "POST" && url.pathname === "/mcp") return await sendMcp(req, res, store, authTokens, limiter, allowedOrigin);
    if (req.method === "GET" && url.pathname === "/api/capabilities") return sendJson(res, 200, { capabilities: listCapabilities() }, allowedOrigin, req);
    if (req.method === "POST" && url.pathname === "/api/actions") return await sendCreate(req, res, store, authTokens, limiter, allowedOrigin);
    if (req.method === "GET" && url.pathname.startsWith("/api/actions/")) return sendRead(req, res, store, authTokens, decodeURIComponent(url.pathname.slice(13)), allowedOrigin);
    return sendStatic(url.pathname, res, allowedOrigin, req);
  } catch (error) { const detail = publicError(error); console.info(JSON.stringify({ event: "request_failed", code: detail.code })); return sendJson(res, statusFor(detail.code), { error: detail.code, message: detail.message }, allowedOrigin, req); } });
  return { server, store };
}
async function sendMcp(req, res, store, tokens, limiter, origin) { const identity = authenticateRequest(req, tokens, limiter); const response = await handleMcpRequest(await readJson(req), store, ownerId(identity)); if (!response) return res.writeHead(202, securityHeaders(origin, req)).end(); sendJson(res, 200, response, origin, req); }
async function sendCreate(req, res, store, tokens, limiter, origin) { const identity = authenticateRequest(req, tokens, limiter); const action = await store.create(await readJson(req), ownerId(identity)); console.info(JSON.stringify({ event: "action_created", actionId: action.id, state: action.state })); sendJson(res, 201, { action }, origin, req); }
function sendRead(req, res, store, tokens, id, origin) { const identity = authenticateRequest(req, tokens); const action = store.get(id, ownerId(identity)); if (!action) throw codedError("ACTION_NOT_FOUND"); sendJson(res, 200, { action }, origin, req); }
function authenticateRequest(req, tokens, limiter) { if (!Object.keys(tokens).length) throw codedError("AUTH_UNAVAILABLE"); const identity = authenticate(req, tokens); if (!identity) { console.info(JSON.stringify({ event: "authentication_failed" })); throw codedError("AUTH_REQUIRED"); } if (limiter && !limiter(`${identity}:${req.socket.remoteAddress || "unknown"}`)) throw codedError("RATE_LIMITED"); return identity; }
function configuredTokens() { return process.env.SPOTIGO_MCP_AUTH_TOKEN ? { demo: process.env.SPOTIGO_MCP_AUTH_TOKEN } : {}; }
async function sendStatic(pathname, res, origin, req) { const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, ""); const target = path.resolve(root, relative); if (!target.startsWith(`${root}${path.sep}`) || target.includes(`${path.sep}data${path.sep}`) || target.includes(`${path.sep}server${path.sep}`)) return sendJson(res, 403, { error: "FORBIDDEN", message: "The requested resource is not available." }, origin, req); try { const data = await readFile(target); res.writeHead(200, { ...securityHeaders(origin, req), "content-type": contentTypes[path.extname(target)] || "application/octet-stream" }); res.end(data); } catch (error) { if (error.code === "ENOENT") return sendJson(res, 404, { error: "NOT_FOUND", message: "The requested resource was not found." }, origin, req); throw error; } }
function readJson(req) { return new Promise((resolve, reject) => { let size = 0, settled = false; const chunks = []; const fail = (error) => { if (!settled) { settled = true; reject(error); } }; req.on("data", (chunk) => { size += chunk.length; if (size > MAX_REQUEST_BYTES) return fail(codedError("PAYLOAD_TOO_LARGE")); if (!settled) chunks.push(chunk); }); req.on("end", () => { if (settled) return; try { settled = true; resolve(size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { fail(codedError("INVALID_JSON")); } }); req.on("error", fail); }); }
function sendOptions(req, res, origin) { res.writeHead(204, { ...securityHeaders(origin, req), "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Authorization, Content-Type", "access-control-max-age": "600" }); res.end(); }
function securityHeaders(origin, req) { const headers = { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "cache-control": "no-store" }; if (origin && req.headers.origin === origin) { headers["access-control-allow-origin"] = origin; headers.vary = "Origin"; } return headers; }
function sendJson(res, status, body, origin, req) { res.writeHead(status, { ...securityHeaders(origin, req), "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); }
function statusFor(code) { return ({ AUTH_REQUIRED: 401, AUTH_UNAVAILABLE: 503, FORBIDDEN: 403, ACTION_NOT_FOUND: 404, RATE_LIMITED: 429, PAYLOAD_TOO_LARGE: 413 })[code] || 400; }
if (process.argv[1] === fileURLToPath(import.meta.url)) { const { server } = await createSpotigoServer(); const port = Number(process.env.PORT || 8080); server.listen(port, () => console.log(`Spotigo is running on port ${port}`)); }
