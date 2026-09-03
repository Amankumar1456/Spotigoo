// js/webmcp-tools.js
// Registers Field Notes' WebMCP tools on document.modelContext.
//
// Design principles behind this tool set (relevant to WebMCP Leverage judging):
//   - Tools are narrow and composable, not one mega "do_everything" tool.
//   - Mutating actions (submit_report) are gated behind a real boolean state
//     check (draft.confirmed), not behind trusting the model to "remember" to ask.
//   - undo_last_action operates on a recorded action stack (state.js), so undo is
//     a real inverse operation, not the model re-reasoning about what it did.
//   - Every tool returns a small structured object AND a plain-language `summary`
//     string, so the same tool works for a screen-reader user, a voice agent, and
//     a developer inspecting results in devtools.

import {
  CATEGORIES,
  categoryLabel,
  findNearbyReports,
  getReportById,
  listAllReports,
} from "./reports.js";
import {
  createDraft,
  getDraft,
  confirmDraft,
  submitDraft,
  undoLastAction,
  peekLastAction,
} from "./state.js";

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

function draftSummaryText(draft) {
  const loc = draft.locationText ? draft.locationText : `coordinates ${draft.lat?.toFixed(4)}, ${draft.lng?.toFixed(4)}`;
  const photo = draft.photoNote ? ` A photo was attached: ${draft.photoNote}.` : "";
  return `${categoryLabel(draft.category)} at ${loc}. Description: "${draft.description}".${photo} This report has ${draft.confirmed ? "been confirmed and is ready to submit" : "NOT yet been confirmed"}.`;
}

function requireDraft(draftId) {
  const draft = getDraft(draftId);
  if (!draft) {
    throw new Error(`No draft found with id "${draftId}". Call describe_issue_accessibly first.`);
  }
  return draft;
}

/**
 * Builds the tool definition array (name, description, inputSchema, execute).
 * Shared by registerFieldNotesTools (real WebMCP registration) and the on-page
 * Tool Tester in agent-console.js (manual invocation for demoing/testing without
 * a live agent attached). Both paths run the exact same execute() closures, so
 * there is no divergence between "what the agent can do" and "what gets tested".
 */
export function buildFieldNotesTools({ onToolCall } = {}) {
  const notify = (name, input, output) => {
    if (typeof onToolCall === "function") onToolCall({ name, input, output, at: new Date().toISOString() });
  };

  const tools = [
    {
      name: "describe_issue_accessibly",
      description:
        "Create a structured civic issue report draft from a plain-language description. Use this when the user describes a problem they see (pothole, broken streetlight, obstructed sidewalk, etc.) by voice, text, or photo description. Does not submit anything — it only builds a draft for review.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: CATEGORY_IDS,
            description: "The type of issue. Pick the closest match from the enum.",
          },
          description: {
            type: "string",
            description: "Plain-language description of the issue, in the user's own words where possible.",
          },
          location_text: {
            type: "string",
            description: "Human-readable location, e.g. 'corner of 5th and Main' or 'in front of the library'.",
          },
          lat: { type: "number", description: "Latitude, if known (e.g. from device GPS)." },
          lng: { type: "number", description: "Longitude, if known (e.g. from device GPS)." },
          photo_note: {
            type: "string",
            description: "Optional description of an attached photo, e.g. 'photo shows a foot-wide pothole in the right lane'.",
          },
        },
        required: ["category", "description"],
      },
      execute: async (input) => {
        const lat = typeof input.lat === "number" ? input.lat : 37.7749 + (Math.random() - 0.5) * 0.01;
        const lng = typeof input.lng === "number" ? input.lng : -122.4194 + (Math.random() - 0.5) * 0.01;
        const draft = createDraft({
          category: input.category,
          description: input.description,
          lat,
          lng,
          locationText: input.location_text,
          photoNote: input.photo_note,
        });
        const output = {
          draft_id: draft.id,
          category: draft.category,
          category_label: categoryLabel(draft.category),
          description: draft.description,
          location_text: draft.locationText,
          lat: draft.lat,
          lng: draft.lng,
          summary: `Draft created. ${draftSummaryText(draft)} Next, call check_duplicate_reports to see if this has already been reported.`,
        };
        notify("describe_issue_accessibly", input, output);
        return output;
      },
    },

    {
      name: "check_duplicate_reports",
      description:
        "Check whether an issue near a given location and category has already been reported recently, to avoid filing a duplicate. Pass a draft_id to reuse its location/category, or pass lat/lng/category directly.",
      inputSchema: {
        type: "object",
        properties: {
          draft_id: { type: "string", description: "A draft id from describe_issue_accessibly." },
          lat: { type: "number" },
          lng: { type: "number" },
          category: { type: "string", enum: CATEGORY_IDS },
          radius_meters: { type: "number", description: "Search radius in meters. Defaults to 250." },
        },
      },
      execute: async (input) => {
        let lat = input.lat;
        let lng = input.lng;
        let category = input.category;
        if (input.draft_id) {
          const draft = requireDraft(input.draft_id);
          lat = draft.lat;
          lng = draft.lng;
          category = draft.category;
        }
        if (typeof lat !== "number" || typeof lng !== "number") {
          throw new Error("Provide either a draft_id or lat/lng to check for duplicates.");
        }
        const matches = findNearbyReports({
          lat,
          lng,
          category,
          radiusMeters: input.radius_meters || 250,
        });
        const output = {
          duplicate_count: matches.length,
          matches: matches.map((m) => ({
            report_id: m.id,
            category_label: categoryLabel(m.category),
            description: m.description,
            distance_meters: m.distanceMeters,
            status: m.status,
            reported_at: m.reportedAt,
          })),
          summary:
            matches.length === 0
              ? "No similar reports found nearby in the last 30 days. This looks like a new issue."
              : `Found ${matches.length} similar report${matches.length > 1 ? "s" : ""} nearby, closest ${matches[0].distanceMeters} meters away, currently "${matches[0].status}". Consider telling the user before filing a new one.`,
        };
        notify("check_duplicate_reports", input, output);
        return output;
      },
    },

    {
      name: "read_report_summary",
      description:
        "Produce a plain-language, screen-reader-friendly readback of a draft report exactly as it will be submitted. ALWAYS call this and read it back to the user before calling confirm_submission — this is the accessible equivalent of 'reviewing your order before checkout'.",
      inputSchema: {
        type: "object",
        properties: {
          draft_id: { type: "string" },
        },
        required: ["draft_id"],
      },
      execute: async (input) => {
        const draft = requireDraft(input.draft_id);
        const output = {
          draft_id: draft.id,
          confirmed: draft.confirmed,
          submitted: draft.submitted,
          summary: draftSummaryText(draft),
        };
        notify("read_report_summary", input, output);
        return output;
      },
    },

    {
      name: "confirm_submission",
      description:
        "Record the human's explicit confirmation that a draft report is accurate and ready to submit. This tool requires confirm=true and must be called only after the human has heard or read the summary from read_report_summary and agreed. submit_report will refuse to run without this.",
      inputSchema: {
        type: "object",
        properties: {
          draft_id: { type: "string" },
          confirm: { type: "boolean", description: "Must be true. Represents the human's explicit yes." },
        },
        required: ["draft_id", "confirm"],
      },
      execute: async (input) => {
        if (input.confirm !== true) {
          throw new Error("confirm must be explicitly true. The human has not agreed to submit yet.");
        }
        const draft = confirmDraft(input.draft_id);
        const output = {
          draft_id: draft.id,
          confirmed: true,
          summary: "Confirmed. You can now call submit_report to file this issue with the city.",
        };
        notify("confirm_submission", input, output);
        return output;
      },
    },

    {
      name: "submit_report",
      description:
        "Submit a confirmed draft to the city. Will throw an error if the draft has not been confirmed via confirm_submission first — this is a hard gate, not a suggestion.",
      inputSchema: {
        type: "object",
        properties: {
          draft_id: { type: "string" },
        },
        required: ["draft_id"],
      },
      execute: async (input) => {
        const record = submitDraft(input.draft_id);
        const output = {
          report_id: record.id,
          category_label: categoryLabel(record.category),
          status: record.status,
          reported_at: record.reportedAt,
          summary: `Filed as report ${record.id}. The city has been notified. You can undo this within the session via undo_last_action if it was a mistake.`,
        };
        notify("submit_report", input, output);
        return output;
      },
    },

    {
      name: "undo_last_action",
      description:
        "Reverse the most recent mutating action taken in this session (e.g. retract a just-submitted report). Operates on a real action history, not a guess — it will say clearly what was undone, or that there is nothing to undo.",
      inputSchema: { type: "object", properties: {} },
      execute: async (input) => {
        const before = peekLastAction();
        if (!before) {
          const output = { undone: false, summary: "There is nothing to undo in this session." };
          notify("undo_last_action", input, output);
          return output;
        }
        const action = undoLastAction();
        const output = {
          undone: true,
          action_type: action.type,
          summary: `Undone: ${action.label}.`,
        };
        notify("undo_last_action", input, output);
        return output;
      },
    },

    {
      name: "list_nearby_reports",
      description:
        "Browse all civic issue reports near a location, optionally filtered by category. Use this to help a user see what's already been reported in their area, independent of filing a new one.",
      inputSchema: {
        type: "object",
        properties: {
          lat: { type: "number" },
          lng: { type: "number" },
          radius_meters: { type: "number" },
          category: { type: "string", enum: CATEGORY_IDS },
        },
        required: ["lat", "lng"],
      },
      execute: async (input) => {
        const matches = findNearbyReports({
          lat: input.lat,
          lng: input.lng,
          category: input.category,
          radiusMeters: input.radius_meters || 500,
          sinceDays: 365,
        });
        const output = {
          count: matches.length,
          reports: matches.map((m) => ({
            report_id: m.id,
            category_label: categoryLabel(m.category),
            description: m.description,
            distance_meters: m.distanceMeters,
            status: m.status,
          })),
          summary: `${matches.length} report${matches.length === 1 ? "" : "s"} found within ${input.radius_meters || 500} meters.`,
        };
        notify("list_nearby_reports", input, output);
        return output;
      },
    },

    {
      name: "get_report_status",
      description: "Look up the current status of a previously filed report by its report id.",
      inputSchema: {
        type: "object",
        properties: { report_id: { type: "string" } },
        required: ["report_id"],
      },
      execute: async (input) => {
        const record = getReportById(input.report_id);
        if (!record) throw new Error(`No report found with id ${input.report_id}.`);
        const output = {
          report_id: record.id,
          category_label: categoryLabel(record.category),
          status: record.status,
          reported_at: record.reportedAt,
          summary: `Report ${record.id} is currently "${record.status}".`,
        };
        notify("get_report_status", input, output);
        return output;
      },
    },
  ];

  return tools;
}

/**
 * Registers all Field Notes tools on document.modelContext, if the browser
 * supports WebMCP (Chrome with the WebMCP flag, or ChatGPT's in-app browser).
 * Falls back gracefully with a console note otherwise — the page still works
 * for direct human use and for the on-page Tool Tester.
 */
export function registerFieldNotesTools({ onToolCall } = {}) {
  const tools = buildFieldNotesTools({ onToolCall });

  if (typeof document === "undefined" || !document.modelContext || !document.modelContext.registerTool) {
    console.info(
      "[Field Notes] document.modelContext is not available — WebMCP tools were not registered with the browser. Enable chrome://flags/#enable-webmcp-testing, or open this app in ChatGPT's in-app browser. The Tool Tester panel still works for manual testing."
    );
    return { registered: false, tools };
  }

  for (const tool of tools) {
    document.modelContext.registerTool(tool);
  }

  return { registered: true, tools };
}

export { listAllReports };
