// Boundary for future verified authority integrations. The default resolver is
// intentionally conservative: the current repository contains no jurisdiction
// data or external authority adapter, so every resolution is UNKNOWN.

export class AuthorityResolver {
  async resolve({ issueType, location }) {
    return {
      status: "UNKNOWN",
      authority: null,
      executionAvailable: false,
      explanation: `No verified authority resolver or government adapter is configured for ${issueType} at ${locationLabel(location)}.`,
    };
  }
}

export class UnavailableAuthorityAdapter {
  async getRequirements() {
    return { status: "UNAVAILABLE", explanation: "No verified government authority adapter is configured." };
  }

  async prepareSubmission() {
    return { status: "UNAVAILABLE", explanation: "Spotigo cannot prepare an external government submission without a verified adapter." };
  }

  async submit() {
    throw new Error("External authority submission is unavailable because no verified adapter is configured.");
  }

  async getStatus() {
    return { status: "UNAVAILABLE", explanation: "No external authority status is available." };
  }

  async verifySubmission() {
    return { status: "UNAVAILABLE", explanation: "No external authority submission can be verified." };
  }
}

function locationLabel(location) {
  return typeof location === "string" ? location : "the supplied coordinates";
}
