/**
 * PHASE 4 — Event setup (replaces the event half of firestore.gs)
 * See LONG_DATA_MIGRATION.md §4
 *
 * `uploadEventWithPlayers()` did three unrelated jobs: wrote the event doc,
 * uploaded roster metadata, and uploaded player stats. Phase 4 splits them:
 *
 *   05_EventSetup.gs   event doc          → setupEvent()      run manually
 *   06_RosterSync.gs   roster metadata    → syncRoster()      on submit (fast)
 *   long data + recompute                 → stats + Rank      on submit
 *
 * EVENT_DETAILS now lives here rather than in firestore.gs, so the event id
 * has exactly one definition. It was previously duplicated in getEventId_(),
 * where drift would silently write long rows against the wrong event.
 *
 * Run setupEvent() when you create an event or change any of its details
 * (logo, lock date, next-event banner, status).
 */

/********************* CONFIGURE THESE VALUES *********************/
const EVENT_DETAILS = {
  // Sort order in lists; bump by 1 each new event
  event_place: "10",
  // Current event (writes to Firestore: events/{id})
  name: "Mid West Open",
  id: "mid_west_open_2026",
  status: "live", // "live" | "archived"
  lockDate: new Date("2026-06-26T07:55:00-04:00"),
  event_logo: "https://storage.googleapis.com/pickem-paintball-imgs/public/EventLogos/3-MidwestOpen-2026-final-1.png",
  eventEndsAt: new Date("2026-06-28T20:00:00-04:00"),
  eventDate: "26-28 June",
  eventLocation: "Cincinati, OH",

  nextEventName: "Lone Star Open",
  next_event_id: "lone_star_open_2026",
  nextPicksOpenAt: new Date("2026-09-03T11:00:00-05:00"),
  nextEventImage: "https://storage.googleapis.com/pickem-paintball-imgs/public/EventLogos/Untitled design (2).svg",
  nextEventDate: "26-28 June",
  nextEventLocation: "Garland, TX",

  year: "2026",
};
/******************************************************************/

/**
 * Maps EVENT_DETAILS → fields for `events/{id}`.
 * The document id is the path only; `id` is not stored as a field.
 * Optional fields are omitted when blank so a partially-filled EVENT_DETAILS
 * never blanks out a value already set in Firestore.
 */
function buildEventDocUpdate() {
  const d = EVENT_DETAILS;
  const o = {
    name: d.name,
    status: d.status,
    last_updated: new Date(),
    lockDate: d.lockDate,
    event_logo: d.event_logo,
  };

  const optionalStrings = [
    'event_place', 'brand_color', 'nextEventName', 'next_event_id',
    'nextEventImage', 'next_brand_color', 'eventDate', 'nextEventDate',
    'eventLocation', 'nextEventLocation', 'startDate', 'endDate',
    'venue', 'city', 'eventNumber', 'year',
  ];
  optionalStrings.forEach(function (k) {
    if (d[k] != null && String(d[k]).trim() !== '') o[k] = String(d[k]).trim();
  });

  const optionalDates = ['eventEndsAt', 'nextPicksOpenAt'];
  optionalDates.forEach(function (k) {
    if (d[k] != null) o[k] = d[k];
  });

  return o;
}

/**
 * Writes the event document. Run when creating an event or changing its details.
 *
 * NOTE: this bumps `last_updated`, which fires recalculateLeaderboard,
 * onEventChange, onEventLogoChanged and scheduleBadgeRecalc — same as the old
 * macro did. That is intended: changing an event's details should refresh
 * everything downstream.
 */
function setupEvent() {
  const d = EVENT_DETAILS;
  if (!d || !d.id || !d.name || !d.status) {
    throw new Error('EVENT_DETAILS is missing required fields: id, name, or status.');
  }

  const projectId = getProjectId_(); // from 02_LongDataUpload.gs
  const token = getAccessToken_();

  const name =
    'projects/' + projectId + '/databases/(default)/documents/events/' + d.id;

  // updateMask keeps this a partial update: fields absent from the payload are
  // left alone rather than deleted. A full replace would wipe brand_color,
  // which onEventLogoChanged writes server-side.
  const payload = buildEventDocUpdate();
  const fieldPaths = Object.keys(payload);

  const write = {
    update: { name: name, fields: toFirestoreFields_(payload) },
    updateMask: { fieldPaths: fieldPaths },
  };

  batchWrite_([write], token); // from 02_LongDataUpload.gs
  Logger.log('setupEvent: wrote events/%s (%s fields)', d.id, fieldPaths.length);
}

/** Converts a plain object to Firestore REST typed values. */
function toFirestoreFields_(obj) {
  const out = {};
  Object.keys(obj).forEach(function (k) {
    out[k] = toFirestoreValue_(obj[k]);
  });
  return out;
}

function toFirestoreValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return isFinite(v) ? { doubleValue: v } : { nullValue: null };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFirestoreValue_) } };
  }
  if (typeof v === 'object') {
    return { mapValue: { fields: toFirestoreFields_(v) } };
  }
  return { stringValue: String(v) };
}
