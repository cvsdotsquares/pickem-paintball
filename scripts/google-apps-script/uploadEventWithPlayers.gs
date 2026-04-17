/**
 * PickEm — Upload event + players to Firestore (Google Apps Script)
 *
 * SETUP
 * 1) Extensions → Apps Script → paste this entire file (replace old code).
 * 2) Libraries: add your Firestore library so `FirestoreApp.getFirestore` exists.
 * 3) Fill FIREBASE_CONFIG.private_key with your service account private key.
 * 4) Fill EVENT_DETAILS (especially brand_color / next_brand_color / dates / locations).
 * 5) Run `uploadEventWithPlayers` from the Run menu.
 */

/********************* CONFIGURE THESE VALUES *********************/
const EVENT_DETAILS = {
  // Sort order in lists; bump by 1 each new event
  event_place: "10",
  eventNumber: "2",

  // Current event (writes to Firestore: events/{id})
  name: "Tampa Bay Open",
  id: "tampa_bay_2026",
  status: "live", // "live" | "archived"

  // Optional hex — CTA + left panel (#rrggbb). Empty = app default.
  brand_color: "",
  // Optional hex — during event break for next event. Empty = uses brand_color.
  next_brand_color: "",

  lockDate: new Date("2026-03-19T18:55:00-04:00"),
  event_logo:
    "https://storage.googleapis.com/pickem-paintball-imgs/public/EventLogos/Tampa Logo.webp",
  eventEndsAt: new Date("2026-03-22T18:00:00-04:00"),
  eventDate: "19-22 March",
  eventLocation: "Raymond James Stadium, Tampa, Florida",

  nextEventName: "Mid Atlantic Open",
  next_event_id: "mid_atlantic_open_2026",
  nextPicksOpenAt: new Date("2026-04-16T12:00:00-04:00"),
  nextEventImage:
    "https://storage.googleapis.com/pickem-paintball-imgs/public/EventLogos/Dover_2026.svg",
  nextEventDate: "1-3 May",
  nextEventLocation: "Dover, DE",

  year: "2026",
};

const FIREBASE_CONFIG = {
  project_id: "fantasy-paintball",
  private_key: "-----BEGIN PRIVATE KEY-----\nPASTE_YOUR_KEY_HERE\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@fantasy-paintball.iam.gserviceaccount.com",
  rootCollection: "events",
};

const SHEET_CONFIG = {
  liveDataSheet: "Live Data",
  playerIdColumn: "player_id",
};

/**
 * Maps EVENT_DETAILS → Firestore fields on `events/{id}`.
 * The document id is only the path (`EVENT_DETAILS.id`); we do not store `id` on the doc.
 *
 * Fields used by the countdown / CTA banner in the app:
 *   brand_color, next_brand_color,
 *   lockDate, eventEndsAt, nextPicksOpenAt,
 *   eventDate, nextEventDate, eventLocation, nextEventLocation,
 *   nextEventName, next_event_id, nextEventImage,
 *   event_logo, event_place, year (+ optional startDate, endDate, venue, city, eventNumber).
 *
 * Strings are trimmed; empty strings are omitted so Firestore is not filled with blanks.
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

  if (d.event_place != null && String(d.event_place) !== "") {
    o.event_place = String(d.event_place);
  }
  if (d.brand_color != null && String(d.brand_color).trim() !== "") {
    o.brand_color = String(d.brand_color).trim();
  }
  if (d.eventEndsAt != null) {
    o.eventEndsAt = d.eventEndsAt;
  }
  if (d.nextEventName != null && String(d.nextEventName).trim() !== "") {
    o.nextEventName = String(d.nextEventName).trim();
  }
  if (d.next_event_id != null && String(d.next_event_id).trim() !== "") {
    o.next_event_id = String(d.next_event_id).trim();
  }
  if (d.nextPicksOpenAt != null) {
    o.nextPicksOpenAt = d.nextPicksOpenAt;
  }
  if (d.nextEventImage != null && String(d.nextEventImage).trim() !== "") {
    o.nextEventImage = String(d.nextEventImage).trim();
  }
  if (d.next_brand_color != null && String(d.next_brand_color).trim() !== "") {
    o.next_brand_color = String(d.next_brand_color).trim();
  }
  if (d.eventDate != null && String(d.eventDate).trim() !== "") {
    o.eventDate = String(d.eventDate).trim();
  }
  if (d.nextEventDate != null && String(d.nextEventDate).trim() !== "") {
    o.nextEventDate = String(d.nextEventDate).trim();
  }
  if (d.eventLocation != null && String(d.eventLocation).trim() !== "") {
    o.eventLocation = String(d.eventLocation).trim();
  }
  if (d.nextEventLocation != null && String(d.nextEventLocation).trim() !== "") {
    o.nextEventLocation = String(d.nextEventLocation).trim();
  }

  if (d.startDate != null && String(d.startDate).trim() !== "") {
    o.startDate = String(d.startDate).trim();
  }
  if (d.endDate != null && String(d.endDate).trim() !== "") {
    o.endDate = String(d.endDate).trim();
  }
  if (d.venue != null && String(d.venue).trim() !== "") {
    o.venue = String(d.venue).trim();
  }
  if (d.city != null && String(d.city).trim() !== "") {
    o.city = String(d.city).trim();
  }
  if (d.eventNumber != null && String(d.eventNumber).trim() !== "") {
    o.eventNumber = String(d.eventNumber).trim();
  }
  if (d.year != null && String(d.year).trim() !== "") {
    o.year = String(d.year).trim();
  }

  return o;
}

function getPlayerData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_CONFIG.liveDataSheet);
  if (!sheet) {
    throw new Error('Sheet not found: "' + SHEET_CONFIG.liveDataSheet + '"');
  }
  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    return [];
  }
  const headers = values[0];
  const rows = values.slice(1);
  return rows.map(function (row) {
    const player = {};
    headers.forEach(function (header, index) {
      player[header] = row[index];
    });
    return player;
  });
}

function uploadEventWithPlayers() {
  try {
    console.log("Starting uploadEventWithPlayers...");

    const firestore = FirestoreApp.getFirestore(
      FIREBASE_CONFIG.client_email,
      FIREBASE_CONFIG.private_key,
      FIREBASE_CONFIG.project_id
    );

    console.log("Firestore initialized successfully!");

    if (!EVENT_DETAILS || !EVENT_DETAILS.id || !EVENT_DETAILS.name || !EVENT_DETAILS.status) {
      throw new Error("EVENT_DETAILS is missing required fields: id, name, or status.");
    }

    const eventDocPath = FIREBASE_CONFIG.rootCollection + "/" + EVENT_DETAILS.id;

    console.log("Fetching player data...");
    const players = getPlayerData();

    if (!Array.isArray(players) || players.length === 0) {
      throw new Error("Player data is empty or invalid.");
    }

    console.log("Found " + players.length + " players to upload.");
    players.forEach(function (player, index) {
      const playerId = player[SHEET_CONFIG.playerIdColumn];
      if (!playerId) {
        console.warn("Skipping player at index " + index + ": Missing player ID.");
        return;
      }
      const playerDocPath = eventDocPath + "/players/" + playerId;
      firestore.updateDocument(playerDocPath, player);
    });

    console.log("Uploaded " + players.length + " players.");

    console.log("Updating event doc (including banner fields): " + EVENT_DETAILS.id);
    const eventPayload = buildEventDocUpdate();
    firestore.updateDocument(eventDocPath, eventPayload);

    console.log("Done! Cloud Function will now recalculate all scores.");
  } catch (e) {
    console.error("Error during uploadEventWithPlayers: " + e.message);
    console.error("Stack trace:", e.stack);
    throw e;
  }
}
