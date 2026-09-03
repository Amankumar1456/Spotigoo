// js/reports.js
// A mock municipal "311-style" reports database for Maple Ridge (fictional city).
// In a production deployment this module would be replaced by fetch() calls to a
// real city open-data / 311 API. Everything here is in-memory so the demo works
// with zero backend and zero build step.

export const CATEGORIES = [
  { id: "pothole", label: "Pothole or road damage" },
  { id: "streetlight", label: "Streetlight out" },
  { id: "sidewalk", label: "Sidewalk / accessibility obstruction" },
  { id: "signal", label: "Traffic signal malfunction" },
  { id: "graffiti", label: "Graffiti or vandalism" },
  { id: "trash", label: "Illegal dumping / overflowing bin" },
  { id: "tree", label: "Fallen tree or branch" },
  { id: "flooding", label: "Flooding or drainage issue" },
  { id: "other", label: "Other public issue" },
];

export const STATUS = {
  SUBMITTED: "submitted",
  ACKNOWLEDGED: "acknowledged",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
};

export const STATUS_TRANSITION_MS = 12000;
export const DEMO_AUTHORITY = "Spotigo Demo Authority";
export const DEMO_MODE = "Simulated civic backend";
const STATUS_FLOW = [STATUS.SUBMITTED, STATUS.ACKNOWLEDGED, STATUS.IN_PROGRESS, STATUS.RESOLVED];

// Seeded "existing" reports already on the books, used to demonstrate duplicate
// detection. Coordinates are loosely arranged around a fictional downtown grid.
let nextId = 1042;

const seed = [
  {
    id: "MR-1031",
    category: "pothole",
    description: "Deep pothole in the right lane, roughly the size of a car tire.",
    lat: 37.7752,
    lng: -122.4189,
    status: STATUS.ACKNOWLEDGED,
    reportedAt: daysAgo(6),
    source: "resident",
  },
  {
    id: "MR-1033",
    category: "streetlight",
    description: "Streetlight has been flickering for a week and went fully dark last night.",
    lat: 37.7768,
    lng: -122.4204,
    status: STATUS.SUBMITTED,
    reportedAt: daysAgo(2),
    source: "resident",
  },
  {
    id: "MR-1036",
    category: "sidewalk",
    description: "Raised, cracked sidewalk slab creates a trip hazard and blocks wheelchair access.",
    lat: 37.7741,
    lng: -122.4171,
    status: STATUS.IN_PROGRESS,
    reportedAt: daysAgo(11),
    source: "resident",
  },
  {
    id: "MR-1039",
    category: "trash",
    description: "Dumpster behind the corner store has been overflowing for several days.",
    lat: 37.7759,
    lng: -122.4160,
    status: STATUS.RESOLVED,
    reportedAt: daysAgo(20),
    source: "resident",
  },
];

const reports = [...seed];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** Haversine distance in meters between two lat/lng points. */
export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function listAllReports() {
  advanceReportStatuses();
  return reports.slice().sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));
}

export function getReportById(id) {
  advanceReportStatuses();
  return reports.find((r) => r.id === id) || null;
}

export function findNearbyReports({ lat, lng, category, radiusMeters = 250, sinceDays = 30 }) {
  advanceReportStatuses();
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  return reports
    .filter((r) => (category ? r.category === category : true))
    .filter((r) => new Date(r.reportedAt).getTime() >= cutoff)
    .map((r) => ({ ...r, distanceMeters: Math.round(distanceMeters({ lat, lng }, r)) }))
    .filter((r) => r.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** Commits a confirmed draft into the reports store. Returns the created record. */
export function addReport(draft) {
  const id = `MR-${nextId++}`;
  const record = {
    id,
    category: draft.category,
    description: draft.description,
    lat: draft.lat,
    lng: draft.lng,
    locationText: draft.locationText || null,
    status: STATUS.SUBMITTED,
    reportedAt: new Date().toISOString(),
    statusUpdatedAt: new Date().toISOString(),
    source: "agent-assisted",
    authority: DEMO_AUTHORITY,
    mode: DEMO_MODE,
  };
  reports.unshift(record);
  return record;
}

/** Advances new mock reports through a visible lifecycle every 12 seconds. */
export function advanceReportStatuses(now = Date.now()) {
  for (const report of reports) {
    if (!report.statusUpdatedAt || report.status === STATUS.RESOLVED) continue;
    const elapsedSteps = Math.floor((now - new Date(report.statusUpdatedAt).getTime()) / STATUS_TRANSITION_MS);
    if (elapsedSteps < 1) continue;
    const currentIndex = STATUS_FLOW.indexOf(report.status);
    const nextIndex = Math.min(currentIndex + elapsedSteps, STATUS_FLOW.length - 1);
    if (nextIndex !== currentIndex) {
      report.status = STATUS_FLOW[nextIndex];
      report.statusUpdatedAt = new Date(now).toISOString();
    }
  }
}

/** Removes a report by id (used by undo). Returns true if removed. */
export function removeReport(id) {
  const idx = reports.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  reports.splice(idx, 1);
  return true;
}

export function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || id;
}
