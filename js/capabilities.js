// Stable, machine-readable contract for agent-facing Spotigo capabilities.
// It deliberately describes only Spotigo-local behavior that exists today.

export const CIVIC_ISSUE_TYPES = ["pothole", "streetlight", "sidewalk", "signal", "graffiti", "trash", "tree", "flooding", "other"];

export const CAPABILITIES = [
  {
    id: "report_civic_issue",
    name: "Prepare a civic issue report",
    description: "Prepare a Spotigo-local report for a pothole, road damage, broken streetlight, blocked sidewalk, illegal dumping, flooding, fallen tree, traffic signal issue, graffiti, or another civic issue. A human must review and explicitly confirm before the report is created.",
    requiredInputs: ["issue_type", "location"],
    optionalInputs: ["description", "evidence"],
    requiresConfirmation: true,
    executionAvailable: true,
    verificationAvailable: false,
    externalAuthoritySubmissionAvailable: false,
  },
  {
    id: "track_spotigo_report",
    name: "Track a Spotigo report",
    description: "Read the current state of a Spotigo-local civic report. This does not query or verify a government authority.",
    requiredInputs: ["action_id"],
    optionalInputs: [],
    requiresConfirmation: false,
    executionAvailable: true,
    verificationAvailable: false,
    externalAuthoritySubmissionAvailable: false,
  },
];

export function listCapabilities() {
  return CAPABILITIES.map((capability) => ({ ...capability }));
}

export function getCapability(id) {
  return CAPABILITIES.find((capability) => capability.id === id) || null;
}
