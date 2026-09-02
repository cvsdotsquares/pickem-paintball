const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { onTaskDispatched } = require('firebase-functions/v2/tasks');
const { defineSecret } = require('firebase-functions/params');
const { getFunctions } = require('firebase-admin/functions');

// Shared secret used to authenticate the function -> /api/badges/calculate call.
// Set once with: firebase functions:secrets:set API_SECRET_KEY
const apiSecretKey = defineSecret('API_SECRET_KEY');

admin.initializeApp();
const db = admin.firestore();

// ─── Long data → player stats (LIVE since the Phase 4 cutover) ─────────────
// Triggered by an upload manifest. Derives Confirmed Kills, the type splits
// and Rank from the long rows, writes them to events/{eventId}/players, then
// bumps events.last_updated to fire recalculateLeaderboard below.
// See DATA_PIPELINE.md.
exports.onLongDataUpload = require('./longDataRecompute').onLongDataUpload;

// ─── Career-stats projection ───────────────────────────────────────────────
// `playerSummaries/*` and `aggregates/*` are derived from the same player docs
// onLongDataUpload writes, so every upload leaves them behind. They are rebuilt
// here rather than there because a rebuild costs ~22,000 reads — far too much to
// run several times a game. onLongDataUpload leaves a marker instead, and this
// collapses a weekend of uploads into one rebuild per pass.
//
// Five minutes is the staleness a career page can show during a live event. The
// stats page and leaderboard are unaffected — they read the player docs directly
// and update on every upload.
exports.rebuildPlayerSummaries = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const ref = db.doc('projections/playerSummaries');
    const before = await ref.get();
    const staleSince = before.get('staleSince');

    // Idle cost is this single read. Nothing has been uploaded, nothing to do.
    if (!staleSince) return null;

    /**
     * One rebuild at a time.
     *
     * A rebuild is ~22,000 reads, and the schedule does not wait for the last run to
     * finish. Today a pass takes well under a minute so they cannot collide, but the
     * long-data read grows with every event, and the failure mode is silent: two
     * overlapping passes both do the full work and one throws its result away. A
     * concurrent run would also be holding a marker the other is about to clear.
     *
     * The lock expires so a crashed run cannot wedge the projection permanently.
     */
    const LOCK_MS = 15 * 60 * 1000;
    const runningSince = before.get('runningSince');
    if (runningSince && Date.now() - runningSince.toDate().getTime() < LOCK_MS) {
      console.log('⏭️  A rebuild is already running — skipping this pass.');
      return null;
    }
    await ref.set({ runningSince: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    console.log(`♻️  Projection stale since ${staleSince.toDate().toISOString()} — rebuilding.`);

    const { rebuild } = require('./playerSummaries');
    const result = await rebuild(db, {
      now: admin.firestore.FieldValue.serverTimestamp(),
    });

    /**
     * Clear the marker ONLY if nothing new arrived while we were building.
     *
     * A rebuild takes tens of seconds and reads as it goes, so an upload landing
     * midway through may not be in what we just wrote. Clearing unconditionally
     * would drop that upload on the floor until the next one happened to arrive —
     * a silent, intermittent staleness that would be miserable to diagnose. If the
     * marker has moved, leave it: the next pass picks the work up.
     */
    await db.runTransaction(async (tx) => {
      const now = await tx.get(ref);
      const current = now.get('staleSince');
      const done = {
        runningSince: admin.firestore.FieldValue.delete(),
        rebuiltAt: admin.firestore.FieldValue.serverTimestamp(),
        lastResult: `${result.changed} changed, ${result.unchanged} unchanged`,
      };
      if (current && current.isEqual(staleSince)) {
        tx.set(ref, { ...done, staleSince: admin.firestore.FieldValue.delete() }, { merge: true });
      } else {
        console.log('↩️  New upload arrived mid-rebuild — leaving the marker for the next pass.');
        tx.set(ref, done, { merge: true });
      }
    });

    return null;
  });

// ─── Helpers ───────────────────────────────────────────────────────────────

// Lightweight stage timer. Cloud Functions logs give total invocation time but
// not where it went; this attributes it so latency work targets measurements
// rather than guesses. See LONG_DATA_MIGRATION.md Phase 0.
function createTimer(label) {
  const t0 = Date.now();
  let last = t0;
  const stages = [];
  return {
    mark(stage) {
      const now = Date.now();
      stages.push(`${stage}=${now - last}ms`);
      last = now;
    },
    done(extra = '') {
      console.log(`⏱️  ${label} total=${Date.now() - t0}ms | ${stages.join(' ')}${extra ? ' | ' + extra : ''}`);
    },
  };
}

function resolveDisplayName(data) {
  return (
    data.username ||
    (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null) ||
    data.name ||
    data.displayName ||
    'Unknown'
  );
}

// ─── Leaderboard Recalculation ────────────────────────────────────────────
// Triggers once per macro upload (watches last_updated on event doc).
// Reads all players once + all users once → batch writes summary docs + flat fields.
exports.recalculateLeaderboard = functions.firestore
  .document('events/{eventId}')
  .onUpdate(async (change, context) => {
    const eventId = context.params.eventId;
    const newData = change.after.data();
    const oldData = change.before.data();

    // Always run when the event doc is updated — the macro is the only writer
    // so every update means new player data has been uploaded.
    console.log(`🔁 last_updated changed, running recalculation for: ${eventId}`);

    console.log(`📊 Recalculating leaderboard for: ${eventId}`);
    const timer = createTimer(`recalculateLeaderboard ${eventId}`);

    try {
      // Derive the season year from the event document or its ID
      const eventYear =
        newData?.year ||
        (eventId.match(/(\d{4})/) || [])[1] ||
        String(new Date().getFullYear());

      // ── 1. Build kill map from all player docs (one batch read) ──────────
      const playersSnap = await db.collection(`events/${eventId}/players`).get();
      const killMap = {};
      const playerNameMap = {};
      playersSnap.docs.forEach(doc => {
        const d = doc.data();
        killMap[doc.id] = d['Confirmed Kills'] || 0;
        playerNameMap[doc.id] = d['Player'] || 'Unknown';
      });

      // Log all players with kills so we can verify correct data was read
      const scorers = Object.entries(killMap).filter(([, k]) => k > 0).map(([id, k]) => `${playerNameMap[id]}(${id}):${k}`);
      console.log(`📋 Players with kills (${scorers.length}): ${scorers.join(', ') || 'none'}`);
      console.log(`📋 Total players read: ${playersSnap.docs.length}`);

      timer.mark('readPlayers');

      // ── 2. Fetch all users with picks for this event (one batch read) ────
      const usersSnap = await db.collection('users')
        .where(`pickems.${eventId}`, '!=', null)
        .get();
      timer.mark('readUsersWithPicks');

      // ── 3. Discover other events in the same season (for season totals) ──
      const eventsSnap = await db.collection('events').get();
      timer.mark('readEvents');
      const siblingEventIds = eventsSnap.docs
        .map(d => d.id)
        .filter(id => {
          const d = eventsSnap.docs.find(x => x.id === id)?.data() || {};
          const year = d.year || (id.match(/(\d{4})/) || [])[1];
          return year === eventYear && id !== eventId;
        });

      // ── 4. Calculate each user's event score ─────────────────────────────
      const userScores = [];
      usersSnap.docs.forEach(userDoc => {
        const data = userDoc.data();
        const pickems = data.pickems || {};
        const playerIds = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];
        if (playerIds.length === 0) return;

        const captainId = pickems[`${eventId}_captain`]
          ? String(pickems[`${eventId}_captain`])
          : null;

        let eventPTS = 0;
        let mvpName = 'None';
        let mvpPTS = 0;

        playerIds.forEach(rawId => {
          const pid = String(rawId);
          const kills = killMap[pid] || 0;
          const pts = pid === captainId ? kills * 1.5 : kills;
          eventPTS += pts;
          if (kills > mvpPTS) {
            mvpPTS = kills;
            mvpName = playerNameMap[pid] || 'Unknown';
          }
        });

        // Season score: current event + stored flat fields for sibling events
        let seasonPTS = eventPTS;
        let seasonMvpPTS = mvpPTS;
        let seasonMvpName = mvpName;
        siblingEventIds.forEach(eid => {
          seasonPTS += parseFloat(data[`${eid}PTS`]) || 0;
          const sibMvpPTS = parseFloat(data[`${eid}MVPPTS`]) || 0;
          if (sibMvpPTS > seasonMvpPTS) {
            seasonMvpPTS = sibMvpPTS;
            seasonMvpName = data[`${eid}MVP`] || 'None';
          }
        });

        userScores.push({
          id: userDoc.id,
          displayName: resolveDisplayName(data),
          profilePicture: data.profilePicture || null,
          isSubscribed: data.isSubscribed || false,
          leagues: data.leagues || [],
          eventPTS,
          mvp: mvpName,
          mvpPTS,
          seasonPTS,
          seasonMvpName,
          seasonMvpPTS,
        });
      });

      // ── 5. Assign event ranks ─────────────────────────────────────────────
      userScores.sort(
        (a, b) => b.eventPTS - a.eventPTS || a.displayName.localeCompare(b.displayName)
      );
      userScores.forEach((u, i) => { u.eventRank = i + 1; });

      // ── 6. Assign season ranks ────────────────────────────────────────────
      const seasonSorted = [...userScores].sort(
        (a, b) => b.seasonPTS - a.seasonPTS || a.displayName.localeCompare(b.displayName)
      );
      const seasonRankMap = {};
      seasonSorted.forEach((u, i) => { seasonRankMap[u.id] = i + 1; });
      userScores.forEach(u => { u.seasonRank = seasonRankMap[u.id] || 0; });

      // ── 7. Write event summary doc → leaderboards/{eventId} ──────────────
      await db.doc(`leaderboards/${eventId}`).set({
        eventId,
        year: eventYear,
        totalParticipants: userScores.length,
        lastCalculated: admin.firestore.FieldValue.serverTimestamp(),
        users: userScores,
      });
      timer.mark('writeEventLeaderboard');

      // ── 8. Build & write season summary doc → leaderboards/season_{year} ─
      // Needs ALL users (not just this event) to cover multi-event participants
      const allUsersSnap = await db.collection('users').get();
      timer.mark('readAllUsers');
      const allSeasonEventIds = [eventId, ...siblingEventIds];
      const seasonUsers = [];

      allUsersSnap.docs.forEach(userDoc => {
        const data = userDoc.data();
        const pickems = data.pickems || {};
        const participated = allSeasonEventIds.some(
          eid => Array.isArray(pickems[eid]) && pickems[eid].length > 0
        );
        if (!participated) return;

        const existingScore = userScores.find(u => u.id === userDoc.id);

        let seasonTotalPoints = 0;
        let seasonMvpPTS = 0;
        let seasonMvpName = 'None';

        allSeasonEventIds.forEach(eid => {
          const pts =
            eid === eventId
              ? (existingScore?.eventPTS || 0)
              : (parseFloat(data[`${eid}PTS`]) || 0);
          seasonTotalPoints += pts;

          const mvpPTS =
            eid === eventId
              ? (existingScore?.mvpPTS || 0)
              : (parseFloat(data[`${eid}MVPPTS`]) || 0);
          if (mvpPTS > seasonMvpPTS) {
            seasonMvpPTS = mvpPTS;
            seasonMvpName =
              eid === eventId
                ? (existingScore?.mvp || 'None')
                : (data[`${eid}MVP`] || 'None');
          }
        });

        seasonUsers.push({
          id: userDoc.id,
          displayName: resolveDisplayName(data),
          profilePicture: data.profilePicture || null,
          isSubscribed: data.isSubscribed || false,
          leagues: data.leagues || [],
          seasonTotalPoints,
          seasonmvpname: seasonMvpName,
          seasonmvppts: seasonMvpPTS,
        });
      });

      seasonUsers.sort(
        (a, b) => b.seasonTotalPoints - a.seasonTotalPoints || a.displayName.localeCompare(b.displayName)
      );
      seasonUsers.forEach((u, i) => { u.seasonRank = i + 1; });

      await db.doc(`leaderboards/season_${eventYear}`).set({
        year: eventYear,
        totalParticipants: seasonUsers.length,
        lastCalculated: admin.firestore.FieldValue.serverTimestamp(),
        users: seasonUsers,
      });
      timer.mark('writeSeasonLeaderboard');

      // ── 9. Batch-write flat fields to each user doc ───────────────────────
      const BATCH_SIZE = 500;
      for (let i = 0; i < userScores.length; i += BATCH_SIZE) {
        const batch = db.batch();
        userScores.slice(i, i + BATCH_SIZE).forEach(user => {
          batch.update(db.doc(`users/${user.id}`), {
            [`${eventId}Rank`]: user.eventRank,
            [`${eventId}PTS`]: user.eventPTS,
            [`${eventId}MVP`]: user.mvp,
            [`${eventId}MVPPTS`]: user.mvpPTS,
          });
        });
        await batch.commit();
      }

      timer.mark('writeUserFlatFields');
      timer.done(`players=${playersSnap.size} usersWithPicks=${usersSnap.size} allUsers=${allUsersSnap.size}`);

      console.log(`✅ Done: ${userScores.length} users ranked for ${eventId}`);
      return null;
    } catch (err) {
      console.error(`❌ recalculateLeaderboard failed:`, err);
      return null;
    }
  });

// ─── Auto-add user to leaderboard on picks save ───────────────────────────
// Fires on every user doc write. If the user just saved picks for a live event
// and isn't yet in the leaderboard summary doc, appends them with 0 pts so
// they appear immediately without waiting for the next macro run.
exports.onUserPicksSaved = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null; // user deleted

    const userId = context.params.userId;
    const before = change.before.exists ? (change.before.data().pickems || {}) : {};
    const after = change.after.data().pickems || {};

    // Find event IDs where picks were newly added in this write
    const newlyPickedEventIds = Object.keys(after).filter(key => {
      if (key.includes('_captain')) return false;
      const picks = after[key];
      if (!Array.isArray(picks) || picks.length === 0) return false;
      const hadBefore = Array.isArray(before[key]) && before[key].length > 0;
      return !hadBefore; // only truly new picks
    });

    if (newlyPickedEventIds.length === 0) return null;

    const userData = change.after.data();
    const displayName = resolveDisplayName(userData);
    const profilePicture = userData.profilePicture || null;
    const isSubscribed = userData.isSubscribed || false;
    const leagues = userData.leagues || [];

    try {
      for (const eventId of newlyPickedEventIds) {
        const lbRef = db.doc(`leaderboards/${eventId}`);
        const lbSnap = await lbRef.get();

        if (!lbSnap.exists) continue; // leaderboard not built yet — CF will create it on first macro run

        const existingUsers = lbSnap.data().users || [];
        const alreadyIn = existingUsers.some(u => u.id === userId);
        if (alreadyIn) continue;

        const newEntry = {
          id: userId,
          displayName,
          profilePicture,
          isSubscribed,
          leagues,
          eventPTS: 0,
          eventRank: existingUsers.length + 1,
          mvp: 'None',
          mvpPTS: 0,
          seasonPTS: 0,
          seasonRank: existingUsers.length + 1,
        };

        await lbRef.update({
          users: admin.firestore.FieldValue.arrayUnion(newEntry),
          totalParticipants: admin.firestore.FieldValue.increment(1),
        });

        console.log(`✅ Added ${displayName} (${userId}) to leaderboard for ${eventId}`);
      }
    } catch (err) {
      console.error('❌ onUserPicksSaved failed:', err);
    }

    return null;
  });

// ─── Sync isSubscribed to leaderboard when user subscribes/unsubscribes ─────
// Leaderboard summaries cache isSubscribed; without this, PRO badges stay stale
// until the next recalculateLeaderboard (macro upload).
exports.onUserSubscriptionChanged = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;
    const before = change.before.exists ? change.before.data() : {};
    const after = change.after.data();
    if (!!before.isSubscribed === !!after.isSubscribed) return null;

    const userId = context.params.userId;
    const isSubscribed = !!after.isSubscribed;

    const pickems = after.pickems || {};
    const eventIds = Object.keys(pickems).filter(k => !k.includes('_captain'));
    const participatedEventIds = eventIds.filter(
      k => Array.isArray(pickems[k]) && pickems[k].length > 0
    );
    if (participatedEventIds.length === 0) return null;

    const years = new Set();
    for (const eventId of participatedEventIds) {
      const m = eventId.match(/(\d{4})/);
      if (m) years.add(m[1]);
    }

    const updateLeaderboardDoc = async (docId) => {
      const ref = db.doc(`leaderboards/${docId}`);
      const snap = await ref.get();
      if (!snap.exists) return;
      const data = snap.data();
      const users = data.users || [];
      const idx = users.findIndex(u => u.id === userId);
      if (idx === -1) return;
      users[idx] = { ...users[idx], isSubscribed };
      await ref.update({ users });
    };

    try {
      for (const eventId of participatedEventIds) {
        await updateLeaderboardDoc(eventId);
      }
      for (const year of years) {
        await updateLeaderboardDoc(`season_${year}`);
      }
      console.log(`✅ Synced isSubscribed=${isSubscribed} for ${userId} to leaderboards`);
    } catch (err) {
      console.error('❌ onUserSubscriptionChanged failed:', err);
    }
    return null;
  });

// ─── Sync profilePicture/displayName to leaderboard when user profile changes ─
// Leaderboard summaries cache profilePicture and displayName; without this,
// profile pics/names stay stale until the next recalculateLeaderboard.
exports.onUserProfileChanged = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;
    const before = change.before.exists ? change.before.data() : {};
    const after = change.after.data();

    const profileFields = ['profilePicture', 'username', 'firstName', 'lastName', 'name', 'displayName'];
    const changed = profileFields.some(f => {
      const b = before[f];
      const a = after[f];
      return (b !== a) || (typeof b !== typeof a);
    });
    if (!changed) return null;

    const userId = context.params.userId;
    const profilePicture = after.profilePicture || null;
    const displayName = resolveDisplayName(after);

    const pickems = after.pickems || {};
    const participatedEventIds = Object.keys(pickems)
      .filter(k => !k.includes('_captain'))
      .filter(k => Array.isArray(pickems[k]) && pickems[k].length > 0);
    if (participatedEventIds.length === 0) return null;

    const years = new Set();
    participatedEventIds.forEach(eventId => {
      const m = eventId.match(/(\d{4})/);
      if (m) years.add(m[1]);
    });

    const updateLeaderboardDoc = async (docId) => {
      const ref = db.doc(`leaderboards/${docId}`);
      const snap = await ref.get();
      if (!snap.exists) return;
      const data = snap.data();
      const users = data.users || [];
      const idx = users.findIndex(u => u.id === userId);
      if (idx === -1) return;
      users[idx] = { ...users[idx], profilePicture, displayName };
      await ref.update({ users });
    };

    try {
      for (const eventId of participatedEventIds) {
        await updateLeaderboardDoc(eventId);
      }
      for (const year of years) {
        await updateLeaderboardDoc(`season_${year}`);
      }
      console.log(`✅ Synced profile for ${userId} (profilePicture/displayName) to leaderboards`);
    } catch (err) {
      console.error('❌ onUserProfileChanged failed:', err);
    }
    return null;
  });

// REMOVED: onEventChange (and the migrateSingleEvent helper it called).
//
// It mirrored every player into `players/season_{season}/{eventId}/{playerId}`
// on every event-doc write — a full read and rewrite of all ~218 players, twice
// (once for data, once for ranks). Nothing reads that path: every application
// read uses the `players/season_{year}/players/` shape written by
// run-migration.js, and the 2026 season table builds from
// `events/{eventId}/players` client-side.
//
// Harmless when it fired once per macro run. Since the Phase 4 cutover the
// recompute bumps events.last_updated on every submit, so this was ~436 unread
// writes in the live scoring hot path.
//
// The logic survives in git history and in functions/migrate-players-function.js
// if that collection shape is ever needed again.
// See LONG_DATA_MIGRATION.md §1.5, Phase 4.

// Firestore Trigger: Runs when players subcollection changes
// NOTE: this fires once per player document write. The macro uploads players one
// at a time, so a single upload produces ~218 invocations of this function.
// It deliberately does NOT call migrateSingleEvent: doing so made each of those
// invocations read and rewrite every player twice (~95k writes per upload), and
// nothing reads the `players/season_{season}/{eventId}/` path it populated —
// every application read uses the `players/season_{year}/players/` shape.
// migrateSingleEvent has since been removed entirely (see above).
// See LONG_DATA_MIGRATION.md §1.2.
exports.onPlayerChange = functions.firestore
  .document('events/{eventId}/players/{playerId}')
  .onWrite(async (change, context) => {
    const { eventId, playerId } = context.params;

    try {
      await handlePlayerStatusChange(eventId, playerId, change);
    } catch (error) {
      console.error(`❌ Failed to process player status change:`, error);
    }

    return null;
  });

// ─── Extract average brand color from event logos ─────────────────────────
// Fires when an event doc is created or updated.
// - If `logoUrl`/`event_logo` changed → extracts and writes `brand_color`
// - If `nextEventImage` changed → extracts and writes `next_brand_color`
// Manual Firestore edits to either color field are safe — they don't change
// the image URLs so this function won't overwrite them.
exports.onEventLogoChanged = functions.firestore
  .document('events/{eventId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;

    const after = change.after.data() || {};
    const before = change.before.exists ? (change.before.data() || {}) : {};
    const eventId = context.params.eventId;
    const sharp = require('sharp');

    const extractColor = async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const { data } = await sharp(buffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .resize(1, 1, { kernel: 'lanczos3' })
        .raw()
        .toBuffer({ resolveWithObject: true });
      return `#${data[0].toString(16).padStart(2, '0')}${data[1].toString(16).padStart(2, '0')}${data[2].toString(16).padStart(2, '0')}`;
    };

    const updates = {};

    const newLogoUrl = after.logoUrl || after.event_logo || null;
    const oldLogoUrl = before.logoUrl || before.event_logo || null;
    if (newLogoUrl && newLogoUrl !== oldLogoUrl) {
      try {
        updates.brand_color = await extractColor(newLogoUrl);
        console.log(`🎨 ${eventId} brand_color → ${updates.brand_color}`);
      } catch (err) {
        console.error(`❌ Failed to extract brand_color for ${eventId}:`, err);
      }
    }

    const newNextImage = after.nextEventImage || null;
    const oldNextImage = before.nextEventImage || null;
    if (newNextImage && newNextImage !== oldNextImage) {
      try {
        updates.next_brand_color = await extractColor(newNextImage);
        console.log(`🎨 ${eventId} next_brand_color → ${updates.next_brand_color}`);
      } catch (err) {
        console.error(`❌ Failed to extract next_brand_color for ${eventId}:`, err);
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.doc(`events/${eventId}`).update(updates);
    }

    return null;
  });

async function handlePlayerStatusChange(eventId, playerId, change) {
  if (!change.after.exists) return;
  const after = change.after.data() || {};
  const before = change.before.exists ? change.before.data() || {} : {};
  const newStatus = after.Status;
  const oldStatus = before.Status;

  if (!newStatus || newStatus === oldStatus) return;

  // Stamp StatusUpdatedAt if missing/unchanged on this write.
  const beforeTs = before.StatusUpdatedAt;
  const afterTs = after.StatusUpdatedAt;
  const tsUnchanged =
    (beforeTs && afterTs && beforeTs.isEqual && beforeTs.isEqual(afterTs)) ||
    (!beforeTs && !afterTs);
  if (tsUnchanged) {
    try {
      await change.after.ref.update({
        StatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to stamp StatusUpdatedAt:', e);
    }
  }

  // Find users who picked this player for this event.
  const usersSnap = await db
    .collection('users')
    .where(`pickems.${eventId}`, '!=', null)
    .get();

  const playerName = String(after.Player || 'Player');

  // Resolve a friendly event name.
  let eventName = eventId;
  try {
    const eventDoc = await db.doc(`events/${eventId}`).get();
    if (eventDoc.exists) {
      const ed = eventDoc.data() || {};
      eventName = ed.name || ed.displayName || eventId;
    }
  } catch (_) {}

  const batch = db.batch();
  let count = 0;
  usersSnap.docs.forEach((userDoc) => {
    const pickems = userDoc.data().pickems || {};
    const ids = Array.isArray(pickems[eventId]) ? pickems[eventId] : [];
    const matched = ids.some((id) => String(id) === String(playerId));
    if (!matched) return;
    const ref = db.collection('notifications').doc();
    batch.set(ref, {
      userId: userDoc.id,
      type: 'player_status_changed',
      playerId: String(playerId),
      playerName,
      eventId,
      eventName,
      oldStatus: oldStatus || null,
      newStatus,
      message: `${playerName} is now ${newStatus} for ${eventName}`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    count += 1;
  });

  if (count > 0) {
    await batch.commit();
    console.log(
      `📨 Sent ${count} player_status_changed notification(s) for ${playerName} (${oldStatus || 'none'} → ${newStatus})`,
    );
  }
}

// ─── Scheduled post-event badge recalculation ─────────────────────────────
// The post-event modal only becomes eligible once a user's `lastBadgeCalcEvent`
// advances to the just-ended event, which happens when badges are recalculated.
// Rather than rely on a user opening the dashboard (the only place the
// client-side trigger fires) or a wasteful daily cron, we schedule a one-off
// Cloud Task to run at each event's `eventEndsAt`. By then the macro has
// uploaded results (eventEndsAt is padded ~1h past the real finish), so ranks,
// points and kills are present.
//
// `recalcBadgesTask` calls the existing /api/badges/calculate endpoint so the
// badge logic lives in exactly one place (src/lib/badgeCalculator.ts).

const BADGE_TASK_QUEUE = 'recalcBadgesTask';
// Cloud Tasks only accepts a scheduleTime up to 30 days out.
const CLOUD_TASKS_MAX_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

exports.recalcBadgesTask = onTaskDispatched(
  {
    secrets: [apiSecretKey],
    // Transient failures (e.g. macro slightly late) are retried with backoff.
    retryConfig: { maxAttempts: 5, minBackoffSeconds: 60 },
    rateLimits: { maxConcurrentDispatches: 1 },
  },
  async (req) => {
    const eventId = req.data && req.data.eventId;
    const appUrl = (process.env.APP_URL || 'https://pickempaintball.com').replace(/\/$/, '');
    const apiKey = apiSecretKey.value();
    if (!apiKey) {
      throw new Error('API_SECRET_KEY is not configured for functions');
    }

    console.log(`🏅 Running scheduled badge recalc (event: ${eventId || 'n/a'})`);
    const res = await fetch(`${appUrl}/api/badges/calculate`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
    });
    if (!res.ok) {
      const body = await res.text();
      // Throwing makes Cloud Tasks retry per retryConfig above.
      throw new Error(`badges/calculate failed ${res.status}: ${body}`);
    }
    console.log(`✅ Badge recalc complete for ${eventId || 'n/a'}:`, await res.json());
  },
);

// Firestore Trigger: schedule the badge recalc whenever an event's
// `eventEndsAt` is set or changed. Dedup state is kept in a separate
// `badgeRecalcSchedules` doc so we never write back to the event doc (which
// would re-fire recalculateLeaderboard and the other event onWrite triggers).
exports.scheduleBadgeRecalc = functions.firestore
  .document('events/{eventId}')
  .onWrite(async (change, context) => {
    const eventId = context.params.eventId;
    if (!change.after.exists) return null; // event deleted

    const data = change.after.data() || {};
    const endsAt =
      data.eventEndsAt && typeof data.eventEndsAt.toDate === 'function'
        ? data.eventEndsAt.toDate()
        : null;
    if (!endsAt) return null; // no end time → nothing to schedule

    const endsIso = endsAt.toISOString();
    const markerRef = db.doc(`badgeRecalcSchedules/${eventId}`);
    const marker = await markerRef.get();
    if (marker.exists && marker.get('scheduledFor') === endsIso) {
      return null; // already scheduled for this exact time
    }

    const now = Date.now();
    if (endsAt.getTime() - now > CLOUD_TASKS_MAX_HORIZON_MS) {
      // Too far out for Cloud Tasks. A later event write (the macro updates
      // events frequently as the date approaches) will enqueue it in time.
      console.log(`⏭️  ${eventId} eventEndsAt is >30d out; deferring schedule`);
      return null;
    }

    // If the end time is already past (e.g. backfill), run ~1 min from now.
    const scheduleTime = endsAt.getTime() > now ? endsAt : new Date(now + 60 * 1000);

    try {
      const queue = getFunctions().taskQueue(BADGE_TASK_QUEUE);
      await queue.enqueue({ eventId }, { scheduleTime });
      await markerRef.set({
        scheduledFor: endsIso,
        scheduleTime: admin.firestore.Timestamp.fromDate(scheduleTime),
        enqueuedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`📅 Scheduled badge recalc for ${eventId} at ${scheduleTime.toISOString()}`);
    } catch (err) {
      console.error(`❌ Failed to schedule badge recalc for ${eventId}:`, err);
    }
    return null;
  });
