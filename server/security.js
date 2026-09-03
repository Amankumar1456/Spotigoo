import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const MAX_REQUEST_BYTES = 256 * 1024;

export function authenticate(req, tokens) {
  const value = req.headers.authorization || "";
  const token = value.startsWith("Bearer ") ? value.slice(7) : "";
  if (!token) return null;
  for (const [identity, expected] of Object.entries(tokens || {})) {
    const supplied = Buffer.from(token);
    const configured = Buffer.from(expected);
    if (supplied.length === configured.length && timingSafeEqual(supplied, configured)) return identity;
  }
  return null;
}

export function ownerId(identity) { return createHash("sha256").update(identity).digest("hex").slice(0, 24); }
export function newActionId() { return `spotigo-${randomUUID()}`; }

export function assertActionId(value) {
  if (typeof value !== "string" || !/^spotigo-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) throw codedError("INVALID_ACTION_ID");
}

export function validateActionInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw codedError("INVALID_INPUT");
  const permitted = new Set(["issue_type", "description", "location", "evidence"]);
  if (Object.keys(input).some((key) => !permitted.has(key))) throw codedError("INVALID_INPUT");
  if (typeof input.issue_type !== "string" || !input.issue_type) throw codedError("INVALID_ISSUE_TYPE");
  if (input.description !== undefined && (typeof input.description !== "string" || !input.description.trim() || input.description.length > 2_000)) throw codedError("INVALID_DESCRIPTION");
  validateLocation(input.location);
  validateEvidence(input.evidence);
}

function validateLocation(location) {
  if (typeof location === "string") {
    if (!location.trim() || location.length > 300 || /(?:\.\.|[\\/])/.test(location)) throw codedError("INVALID_LOCATION");
    return;
  }
  if (!location || typeof location !== "object" || Array.isArray(location) || Object.keys(location).some((key) => key !== "lat" && key !== "lng")) throw codedError("INVALID_LOCATION");
  const { lat, lng } = location;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) throw codedError("INVALID_LOCATION");
}

function validateEvidence(evidence) {
  if (evidence === undefined) return;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) || Object.keys(evidence).length > 5) throw codedError("INVALID_EVIDENCE");
  for (const [key, value] of Object.entries(evidence)) {
    if (key.length > 64 || (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") || String(value).length > 512 || (typeof value === "string" && /(?:\.\.|[\\/])/.test(value))) throw codedError("INVALID_EVIDENCE");
  }
}

export function rateLimiter(limit = 30, windowMs = 60_000) {
  const hits = new Map();
  return (key) => {
    const now = Date.now(); const value = hits.get(key) || { count: 0, reset: now + windowMs };
    if (now > value.reset) { value.count = 0; value.reset = now + windowMs; }
    value.count += 1; hits.set(key, value); return value.count <= limit;
  };
}

export function codedError(code) { const error = new Error(code); error.code = code; return error; }

export const publicError = (error) => {
  const code = error?.code || error?.message;
  const messages = { AUTH_REQUIRED: "Authentication is required.", AUTH_UNAVAILABLE: "Authentication is not configured.", FORBIDDEN: "You are not allowed to access this action.", ACTION_NOT_FOUND: "The requested action was not found.", INVALID_INPUT: "The request contains invalid input.", INVALID_ISSUE_TYPE: "The issue type is missing or unsupported.", INVALID_DESCRIPTION: "The description is invalid.", INVALID_LOCATION: "The location is invalid.", INVALID_EVIDENCE: "The evidence metadata is invalid.", INVALID_ACTION_ID: "The action ID is invalid.", INVALID_JSON: "The request body must be valid JSON.", PAYLOAD_TOO_LARGE: "The request body is too large.", RATE_LIMITED: "Too many requests. Please try again later.", CONFIRMATION_REQUIRED: "The action must be explicitly confirmed before Spotigo creates the report.", INVALID_CONFIRMATION: "Confirmation must be explicitly true.", INVALID_STATE: "The requested action transition is not allowed.", METHOD_NOT_FOUND: "The requested MCP method is not supported.", UNKNOWN_TOOL: "The requested MCP tool is not supported." };
  return { code: messages[code] ? code : "INTERNAL_ERROR", message: messages[code] || "The request could not be completed." };
};
