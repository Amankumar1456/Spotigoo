import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { CIVIC_ISSUE_TYPES } from "../js/capabilities.js";
import { AuthorityResolver } from "./authority.js";
import { assertActionId, codedError, newActionId, validateActionInput } from "./security.js";

const ACTION_STATES = { READY_FOR_CONFIRMATION: "READY_FOR_CONFIRMATION", CONFIRMED: "CONFIRMED", SUBMITTED_TO_SPOTIGO: "SUBMITTED_TO_SPOTIGO" };

export class ActionStore {
  constructor(filePath, { authorityResolver = new AuthorityResolver() } = {}) { this.filePath = filePath; this.authorityResolver = authorityResolver; this.actions = new Map(); this.sequence = 1; this.writeQueue = Promise.resolve(); }
  async init() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try { const persisted = JSON.parse(await readFile(this.filePath, "utf8")); if (!persisted || !Array.isArray(persisted.actions)) throw new Error("invalid persistence"); this.sequence = Number.isSafeInteger(persisted.sequence) ? persisted.sequence : 1; for (const action of persisted.actions) if (action?.id && action?.owner) this.actions.set(action.id, action); }
    catch (error) { if (error.code === "ENOENT") await this.persist(); else console.error(JSON.stringify({ event: "action_store_invalid_data", message: "Ignoring malformed persisted action data." })); }
    return this;
  }
  async create({ issue_type, description, location, evidence }, owner = "local-test") {
    validateActionInput({ issue_type, description, location, evidence }); if (!CIVIC_ISSUE_TYPES.includes(issue_type)) throw codedError("INVALID_ISSUE_TYPE"); if (!owner) throw codedError("AUTH_REQUIRED");
    const now = new Date().toISOString(); const authorityResolution = await this.authorityResolver.resolve({ issueType: issue_type, location });
    const action = { id: newActionId(), owner, intent: "report_civic_issue", input: { issue_type, description: description || null, location, evidence: evidence || null }, requirements: { issue_type: "provided", location: "provided", description: description ? "provided" : "optional" }, authority: { status: authorityResolution.status, name: authorityResolution.authority?.name || null, explanation: authorityResolution.explanation }, execution: { state: "NOT_EXECUTED", method: "spotigo_internal", externalReference: null }, confirmation: { required: true, confirmed: false, confirmedAt: null }, verification: { state: "UNAVAILABLE", evidence: null }, state: ACTION_STATES.READY_FOR_CONFIRMATION, result: null, createdAt: now, updatedAt: now, events: [{ at: now, state: ACTION_STATES.READY_FOR_CONFIRMATION, message: "Spotigo action prepared for human review." }] };
    this.actions.set(action.id, action); await this.persist(); return clone(action);
  }
  get(id, owner = "local-test") { assertActionId(id); const action = this.actions.get(id); return action && action.owner === owner ? clone(action) : null; }
  async confirm(id, confirm, owner = "local-test") { if (confirm !== true) throw codedError("INVALID_CONFIRMATION"); const action = this.require(id, owner); if (action.state !== ACTION_STATES.READY_FOR_CONFIRMATION) throw codedError("INVALID_STATE"); action.confirmation = { required: true, confirmed: true, confirmedAt: new Date().toISOString() }; this.transition(action, ACTION_STATES.CONFIRMED, "Human confirmation recorded."); await this.persist(); return clone(action); }
  async execute(id, owner = "local-test") { const action = this.require(id, owner); if (action.state === ACTION_STATES.SUBMITTED_TO_SPOTIGO) return clone(action); if (!action.confirmation.confirmed || action.state !== ACTION_STATES.CONFIRMED) { const error = codedError("CONFIRMATION_REQUIRED"); error.message = "Action must be explicitly confirmed before Spotigo creates the report."; throw error; } const reference = `SP-${String(this.sequence++).padStart(6, "0")}`; action.execution = { state: "COMPLETED", method: "spotigo_internal", externalReference: reference }; action.result = { spotigoReference: reference, externalSubmission: "NOT_ATTEMPTED", verification: "UNAVAILABLE", message: "Spotigo report created. No government authority was contacted or verified." }; this.transition(action, ACTION_STATES.SUBMITTED_TO_SPOTIGO, action.result.message); await this.persist(); return clone(action); }
  async persist() { this.writeQueue = this.writeQueue.then(async () => { const tempPath = `${this.filePath}.${process.pid}.tmp`; await writeFile(tempPath, JSON.stringify({ sequence: this.sequence, actions: [...this.actions.values()] }, null, 2), { mode: 0o600 }); await rename(tempPath, this.filePath); }); return this.writeQueue; }
  require(id, owner = "local-test") { assertActionId(id); const action = this.actions.get(id); if (!action) throw codedError("ACTION_NOT_FOUND"); if (action.owner !== owner) throw codedError("FORBIDDEN"); return action; }
  transition(action, state, message) { const at = new Date().toISOString(); action.state = state; action.updatedAt = at; action.events.push({ at, state, message }); }
}
const clone = (value) => JSON.parse(JSON.stringify(value));
export { ACTION_STATES };
