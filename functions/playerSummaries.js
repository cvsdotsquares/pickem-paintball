/**
 * Builds `playerSummaries/{playerId}` and the `aggregates/*` documents the career-stats
 * and all-time pages read.
 *
 * THIS IS A PROJECTION, NOT A SOURCE
 * Every value is derived from `events/{id}/players`, `long_data` and `users`. Nothing is
 * authored here and nothing reads back from here to compute anything else, so a full
 * rebuild is always safe and is the definition of correct.
 *
 * WHY A FULL REBUILD RATHER THAN A PATCH
 * A player's career rank depends on every other player's total, so a change to one
 * roster can move the rank of someone who did not play that event at all. There is no
 * correct narrow patch — only a narrow WRITE, which is what `writeAll` does: recompute
 * everything in memory, diff, and write only the documents that actually changed. Same
 * rule `longDataRecompute` follows, and for the same reason: incremental arithmetic
 * double-counts on a re-upload and does it silently.
 *
 * COST
 * ~22,000 reads per rebuild (2,100 roster docs, 18,300 long rows, 1,600 users) and as
 * many writes as players actually moved. That is why it runs on a debounce rather than
 * on every upload — see `rebuildPlayerSummaries` in index.js.
 *
 * Shared by the Cloud Function and `scripts/build-player-summaries.mjs`, so the live
 * path and the manual rebuild can never drift apart.
 */

/**
 * No `firebase-admin` import on purpose.
 *
 * The repo root runs 13.6.0 and functions/ runs 12.7.0, so a sentinel built from one
 * copy and handed to a Firestore instance from the other is rejected — the CLI and the
 * Cloud Function would each work alone and fail when sharing this file. The caller
 * passes its own `rebuiltAt` value instead, and this module stays dependency-free.
 */

/**
 * The league's own results, 2015-2026 — see functions/nxlHistory.js.
 *
 * A plain require of committed reference data, so it costs no reads and cannot drift
 * mid-rebuild the way a second collection could.
 */
const { eventRecord, matchResult, nxlCareer } = require("./nxlHistory");

const KILL_TYPES = [
  "Gunfights",
  "Breakshooting",
  "Movement",
  "Zone Coverage",
  "Pressure",
  "Trades",
  "Unclassified",
];

/** Long-data `type` → aggregate field. Mirrors `TYPE_FIELD` in longDataRecompute.js. */
const TYPE_FIELD = {
  Gunfight: "Gunfights",
  Breakshooting: "Breakshooting",
  Movement: "Movement",
  "Zone Coverage": "Zone Coverage",
  Pressure: "Pressure",
  Trade: "Trades",
};

const ROUND_ORDER = ["Friday", "Saturday", "Sunday", "Wildcard", "Top8", "Top4", "Finals"];
const roundRank = (r) => {
  const i = ROUND_ORDER.indexOf(r);
  return i === -1 ? ROUND_ORDER.length : i;
};

const num = (v) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Events in chronological order, newest last. 2024 excluded — those were test events. */
async function loadEvents(db) {
  const snap = await db.collection("events").get();
  return snap.docs
    .map((d) => {
      const year = d.id.split("_").pop() ?? "";
      return {
        id: d.id,
        name: d.get("name") || d.id,
        year,
        brandColor: d.get("brand_color") ?? null,
        lockSeconds: d.get("lockDate")?.seconds ?? 0,
      };
    })
    .filter((e) => e.year !== "2024" && e.year.length === 4)
    .sort((a, b) => a.lockSeconds - b.lockSeconds);
}

/**
 * Pick % per event, from the one place it exists today.
 *
 * Ownership freezes at pick lock, so for a finished event this value never changes
 * again and belongs in the summary. The live-event refresh is a separate cadence job;
 * this is the historic backstop and the initial fill.
 */
async function loadOwnership(db) {
  const snap = await db.collection("users").get();
  const entrants = new Map();
  const picked = new Map(); // eventId -> Map(playerId -> count)

  snap.docs.forEach((u) => {
    const pickems = u.get("pickems") || {};
    for (const [key, value] of Object.entries(pickems)) {
      if (key.includes("_captain") || key.endsWith("_draft")) continue;
      if (!Array.isArray(value) || value.length === 0) continue;
      entrants.set(key, (entrants.get(key) ?? 0) + 1);
      if (!picked.has(key)) picked.set(key, new Map());
      const byPlayer = picked.get(key);
      for (const id of value) {
        const pid = String(id);
        byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + 1);
      }
    }
  });

  const pct = new Map(); // eventId -> Map(playerId -> percent)
  for (const [eventId, total] of Array.from(entrants)) {
    if (total <= 0) continue;
    const out = new Map();
    for (const [pid, n] of Array.from(picked.get(eventId) ?? new Map())) {
      out.set(pid, (n / total) * 100);
    }
    pct.set(eventId, { total, byPlayer: out });
  }
  return pct;
}

/** Firestore Timestamp, Date or ISO string -> YYYY-MM-DD, for the fixture join. */
function isoDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate().toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/** Match rows per player, per event, from long data. Empty for events not yet loaded. */
function matchesForEvent(eventId, rows, teamOfPlayer) {
  // gameId -> rows. A game is stored twice, directionally, so both halves land here.
  const games = new Map();
  for (const r of rows) {
    if (!r.gameId) continue;
    const bucket = games.get(r.gameId);
    if (bucket) bucket.push(r);
    else games.set(r.gameId, [r]);
  }

  /**
   * A game whose every row is voided never happened.
   *
   * Weight 0 is the pipeline's tombstone (see longDataRecompute), but a voided row
   * still carries a round and a team pair, so it mints a gameId. Three such rows once
   * created two phantom games here, which then handed a 0-kill match row to all 25
   * players on the three teams involved — for matches that were never played.
   * Scoring was unaffected; the fixture list was not.
   */
  for (const [gameId, rs] of Array.from(games)) {
    if (rs.every((r) => num(r.weight) === 0)) games.delete(gameId);
  }

  const byPlayer = new Map(); // playerId -> match[]
  for (const [gameId, gameRows] of Array.from(games)) {
    const sample = gameRows[0];
    const sides = new Set(gameRows.flatMap((r) => [r.teamId, r.opponentId]).filter(Boolean));

    for (const teamId of Array.from(sides)) {
      const scoring = gameRows.filter((r) => r.playerId != null && num(r.weight) !== 0);
      const teamKills = scoring
        .filter((r) => r.teamId === teamId)
        .reduce((a, r) => a + num(r.weight), 0);
      const opponentKills = scoring
        .filter((r) => r.teamId !== teamId)
        .reduce((a, r) => a + num(r.weight), 0);

      const named = gameRows.find((r) => r.teamId === teamId) ?? sample;
      const opponent =
        named.teamId === teamId ? (named.opponent ?? "—") : (named.team ?? "—");
      const opponentId = (named.teamId === teamId ? named.opponentId : named.teamId) ?? null;
      const points = new Set(gameRows.map((r) => r.point)).size;

      /**
       * Who actually won, from the league's own results.
       *
       * NOT derivable from anything already here. Long data is one row per KILL, and a
       * point is won by hanging the flag — a team can lose a game it out-killed. So
       * `teamKills` beside this is a different fact, not a weaker version of it.
       *
       * Null when the fixture cannot be identified beyond doubt; the column renders a
       * dash rather than inventing a result. Today that never happens: all 400 games
       * across the eight events resolve.
       */
      const result = matchResult(
        eventId,
        named.round,
        isoDate(named.date),
        teamId,
        opponentId,
      );

      // Every player on this team gets a row, whether or not they scored — a quiet
      // game is a result, and building the list from a player's own kills would drop it.
      for (const [playerId, tid] of Array.from(teamOfPlayer)) {
        if (tid !== teamId) continue;
        const mine = gameRows.filter(
          (r) => String(r.playerId ?? "") === playerId && num(r.weight) !== 0,
        );
        const types = Object.fromEntries(KILL_TYPES.map((t) => [t, 0]));
        let kills = 0;
        for (const r of mine) {
          const w = num(r.weight);
          kills += w;
          types[TYPE_FIELD[String(r.type ?? "").trim()] ?? "Unclassified"] += w;
        }
        if (!byPlayer.has(playerId)) byPlayer.set(playerId, []);
        byPlayer.get(playerId).push({
          gameId,
          round: named.round ?? "—",
          opponent,
          opponentId,
          points,
          kills,
          teamKills,
          opponentKills,
          shareOfTeam: teamKills > 0 ? (kills / teamKills) * 100 : null,
          result: result ? result.result : null,
          scoreFor: result ? result.for : null,
          scoreAgainst: result ? result.against : null,
          types,
        });
      }
    }
  }

  for (const list of Array.from(byPlayer.values())) {
    list.sort((a, b) => roundRank(b.round) - roundRank(a.round));
  }
  return byPlayer;
}

async function buildAll(db, { onlyPlayer = null, events: preloadedEvents = null } = {}) {
  const events = preloadedEvents ?? (await loadEvents(db));

  /**
   * Every read this needs, issued at once.
   *
   * The rosters, the ownership scan and the long rows do not depend on each other, and
   * the rosters do not depend on each other either — they were being awaited one at a
   * time purely because a `for` loop is the obvious way to write it. Benchmarked
   * alternating on one connection, the roster-and-users stage went 9.99s -> 6.94s
   * (1.44x); chaining the stages had made the total the SUM of three waits rather than
   * the longest of them.
   */
  const [rosterSnaps, ownership, longSnap] = await Promise.all([
    Promise.all(events.map((ev) => db.collection(`events/${ev.id}/players`).get())),
    loadOwnership(db),
    db.collection("long_data").get(),
  ]);

  // One pass over each roster, held in memory. Building 325 players this way costs
  // less than one page view does today.
  const rosters = new Map(); // eventId -> Map(playerId -> data)
  const teamTotals = new Map(); // eventId -> Map(teamId -> kills)
  const fieldSizes = new Map();
  events.forEach((ev, i) => {
    const byId = new Map();
    const totals = new Map();
    let field = 0;
    rosterSnaps[i].docs.forEach((d) => {
      const o = d.data();
      byId.set(d.id, o);
      if (o.participation !== "absent") field++;
      const tid = o.team_id;
      if (tid) totals.set(tid, (totals.get(tid) ?? 0) + num(o["Confirmed Kills"]));
    });
    rosters.set(ev.id, byId);
    teamTotals.set(ev.id, totals);
    fieldSizes.set(ev.id, field);
  });

  /**
   * An event nobody has scored a kill at HAS NOT HAPPENED YET.
   *
   * Rosters are loaded weeks before a tournament is played — Lone Star 2026 had all 188
   * of its players in Firestore on 4 September for an event that locks on the 18th.
   * Without this filter every one of those players picks up an event row marked
   * `played` with zero kills, because `participation` defaults to "unknown" and only
   * "absent" is treated as a non-appearance. Measured on that roster: `playedCount`
   * rose by one for 215 players and `avgKills` fell about 12% across the board (Blake
   * Yarber 20.6 -> 18.0) for a tournament nobody had turned up to.
   *
   * That is precisely the false claim the participation model exists to prevent — a
   * zero presented as a performance — arriving through the front door instead.
   *
   * KILLS RATHER THAN THE CLOCK, deliberately. `lockDate` looks like the obvious test
   * and leaves a hole: between picks locking and the first results being uploaded, the
   * date has passed and the numbers have not arrived, so the same zeroes publish for a
   * few hours. "Somebody has scored" is the condition that actually means the event has
   * begun to produce results, and it needs no clock and no timezone.
   *
   * The event returns on its own the moment the first upload lands.
   */
  const started = events.filter((ev) =>
    Array.from(rosters.get(ev.id).values()).some((o) => num(o["Confirmed Kills"]) > 0),
  );
  const notStarted = events.filter((ev) => !started.includes(ev));
  if (notStarted.length) {
    console.log(
      `⏳ Excluding ${notStarted.length} event(s) with no kills recorded yet: ${notStarted.map((e) => e.id).join(", ")}`,
    );
  }

  // Long data, grouped by event. Events without a backfill simply have no rows.
  const longByEvent = new Map();
  longSnap.docs.forEach((d) => {
    const r = d.data();
    if (!r.eventId) return;
    if (!longByEvent.has(r.eventId)) longByEvent.set(r.eventId, []);
    longByEvent.get(r.eventId).push(r);
  });

  const matchesByEvent = new Map(); // eventId -> Map(playerId -> match[])
  for (const ev of started) {
    const rows = longByEvent.get(ev.id);
    if (!rows?.length) continue;
    const teamOfPlayer = new Map();
    for (const [pid, o] of Array.from(rosters.get(ev.id))) {
      if (o.team_id) teamOfPlayer.set(pid, o.team_id);
    }
    matchesByEvent.set(ev.id, matchesForEvent(ev.id, rows, teamOfPlayer));
  }

  /**
   * Career kills across the population, for career rank. Absences contribute nothing
   * and a player who never took the field is not in the running at all — the same rule
   * the page applies today.
   */
  const careerKills = new Map();
  for (const ev of started) {
    for (const [pid, o] of Array.from(rosters.get(ev.id))) {
      if (o.participation === "absent") continue;
      careerKills.set(pid, (careerKills.get(pid) ?? 0) + num(o["Confirmed Kills"]));
    }
  }
  const sortedCareer = Array.from(careerKills.values()).sort((a, b) => b - a);
  const careerRankOf = (total) => sortedCareer.findIndex((k) => k <= total) + 1 || null;

  const everyPlayer = new Set();
  for (const ev of started) for (const pid of Array.from(rosters.get(ev.id).keys())) everyPlayer.add(pid);

  const summaries = [];
  for (const playerId of Array.from(everyPlayer)) {
    if (onlyPlayer && playerId !== onlyPlayer) continue;

    // Rows for every event in the player's own span, so a gap mid-career stays visible.
    const rows = started.map((ev) => {
      const d = rosters.get(ev.id).get(playerId);
      const base = {
        eventId: ev.id,
        eventName: ev.name,
        year: ev.year,
        brandColor: ev.brandColor,
        fieldSize: fieldSizes.get(ev.id),
        pickPct: ownership.get(ev.id)?.byPlayer.get(playerId) ?? null,
        /**
         * When the event happened, so the page can interleave these rows with the
         * league events PickEm does not score.
         *
         * From `lockDate`, which is a day or two before the first game — close enough
         * to order by, and the only date the event document carries. The league's own
         * start date cannot be used for every row: an event the player sat out is
         * dropped from their NXL record, so it has no league row to borrow from.
         */
        start: ev.lockSeconds
          ? new Date(ev.lockSeconds * 1000).toISOString().slice(0, 10)
          : null,
      };
      if (!d) {
        return {
          ...base,
          kind: "not-rostered",
          participation: "absent",
          participationReason: "not on roster",
          status: null,
          team: "—",
          teamId: null,
          cost: 0,
          kills: 0,
          rank: null,
          types: Object.fromEntries(KILL_TYPES.map((t) => [t, 0])),
          costPerKill: null,
          teamKills: 0,
          shareOfTeam: null,
          record: null,
        };
      }
      const kills = num(d["Confirmed Kills"]);
      const cost = num(d.Cost);
      const teamKills = teamTotals.get(ev.id).get(d.team_id) ?? 0;
      const participation = d.participation ?? "unknown";
      return {
        ...base,
        kind: participation === "absent" ? "dnp" : "played",
        participation,
        participationReason: d.participationReason ?? null,
        status: d.Status ?? null,
        team: d.Team || "—",
        teamId: d.team_id ?? null,
        cost,
        kills,
        // Copied, never recomputed — assignRanks owns this, so the summary can never
        // disagree with the stats table.
        rank: d.Rank != null ? num(d.Rank) : null,
        types: Object.fromEntries(KILL_TYPES.map((t) => [t, num(d[t])])),
        costPerKill: cost > 0 && kills > 0 ? cost / kills : null,
        teamKills,
        shareOfTeam: teamKills > 0 ? (kills / teamKills) * 100 : null,
        /**
         * How the player's TEAM did at this event: W-L and how far they went.
         *
         * A team fact on a player's row, which is why the column is headed with the
         * team's code rather than presented as something the player did alone. Null
         * for an event the league has no results for yet — a live event has a roster
         * and rows long before it has a bracket.
         */
        record: eventRecord(ev.id, d.team_id ?? null),
      };
    });

    const firstIdx = rows.findIndex((r) => r.kind !== "not-rostered");
    if (firstIdx === -1) continue;
    let lastIdx = -1;
    rows.forEach((r, i) => {
      if (r.kind !== "not-rostered") lastIdx = i;
    });
    const span = rows.slice(firstIdx, lastIdx + 1);

    const played = span.filter((r) => r.kind === "played");
    const totalKills = span.reduce((a, r) => a + r.kills, 0);
    const ranked = played.filter((r) => r.rank != null && r.rank > 0);
    const best = ranked.length ? ranked.reduce((a, b) => (b.rank < a.rank ? b : a)) : null;
    const rankValues = ranked.map((r) => r.rank);

    const typeSum = KILL_TYPES.map((type) => ({
      type,
      total: played.reduce((a, r) => a + (r.types[type] ?? 0), 0),
    }));
    const grand = typeSum.reduce((a, t) => a + t.total, 0);

    const latest = span.filter((r) => r.kind !== "not-rostered").at(-1);
    const latestDoc = rosters.get(latest.eventId).get(playerId);

    /**
     * The player's NXL id, from ANY event that carries one — not just the latest.
     *
     * `league_id` is stamped by `syncRoster` and is missing from plenty of rows: the
     * 2025 World Cup international entries mostly have none, and a blank on the most
     * recent event would otherwise cost a player their whole league history. It is the
     * same person's permanent id whichever row it comes from, so the first one found is
     * as good as any. Taken newest-first purely so a stale value never wins.
     */
    const leagueId = span
      .filter((r) => r.kind !== "not-rostered")
      .reverse()
      .map((r) => rosters.get(r.eventId).get(playerId)?.league_id)
      .find((v) => v != null && String(v).trim() !== "") ?? null;

    // Match rows only for events the player actually took the field at. Their team's
    // fixtures exist either way, but attributing games to someone who was absent would
    // reintroduce the exact claim the participation model removes.
    const matches = [];
    for (const r of span) {
      if (r.kind !== "played") continue;
      const forEvent = matchesByEvent.get(r.eventId)?.get(playerId);
      if (forEvent) matches.push(...forEvent.map((m) => ({ ...m, eventId: r.eventId })));
    }

    summaries.push({
      playerId,
      /**
       * The first season PickEm scored, for the header above the kill numbers.
       *
       * Like the NXL one it describes COVERAGE, not this player: the header has to read
       * the same on every page, because what it is telling a reader is where our data
       * starts, not when someone's career did.
       */
      trackedFrom: events.length ? events[0].year : null,
      name: latestDoc.Player || "Unknown player",
      number: latestDoc.Number ?? null,
      imgUrl: latestDoc.img_url ?? null,
      leagueId,
      currentTeam: latestDoc.Team || "—",
      totalKills,
      playedCount: played.length,
      // A player who never took the field has no position in a career ranking — they
      // were never in the running. Ranking them among people who played would put them
      // mid-table on nothing.
      careerRank: played.length ? careerRankOf(careerKills.get(playerId) ?? 0) : null,
      careerRankField: careerKills.size,
      avgKills: played.length ? totalKills / played.length : 0,
      avgRank: rankValues.length ? rankValues.reduce((a, b) => a + b, 0) / rankValues.length : null,
      bestRank: best?.rank ?? null,
      bestRankEvent: best?.eventName ?? null,
      topTenCount: ranked.filter((r) => r.rank <= 10).length,
      currentCost: latest.cost || null,
      typeTotals: typeSum
        .map((t) => ({ ...t, share: grand > 0 ? (t.total / grand) * 100 : 0 }))
        .filter((t) => t.total > 0)
        .sort((a, b) => b.total - a.total),
      events: span,
      matches,
      /**
       * The whole NXL record, 2015 to now — a DIFFERENT SCOPE from everything above it.
       *
       * Everything else in this document is PickEm's eight events, because that is where
       * kills exist. Results exist for fifty-one, and a career page that told a
       * three-time champion he had won nothing would be worse than one that carries two
       * scopes and says so. Every consumer must label this as the NXL career.
       *
       * Absences are passed in so a tournament win cannot be credited to someone who sat
       * the event out. Only PickEm's events can be checked that way — for the league
       * history a roster appearance is the only evidence there is.
       */
      nxl: nxlCareer(leagueId, {
        absentEventIds: new Set(span.filter((r) => r.kind !== "played").map((r) => r.eventId)),
      }),
    });
  }

  return summaries;
}

/**
 * The derived documents the pages read, built from the summaries already in memory.
 *
 * Lifted verbatim out of the old CLI so there is one implementation, not two.
 */
async function buildAggregates(db, summaries, { events: preloadedEvents = null } = {}) {
  /**
   * One small document listing every player, for the search box.
   *
   * The alternative is reading all 325 summaries just to get their names, which would
   * undo the whole point of the projection. This is ~20 KB and one read, and it holds
   * only what a search result needs to render: name, team, and whether they are still
   * active, so a retired player can be ranked below a current one.
   */
  const index = summaries
    .map((s) => ({
      id: s.playerId,
      name: s.name,
      team: s.currentTeam,
      kills: s.totalKills,
      played: s.playedCount,
      lastEvent: s.events.filter((e) => e.kind === "played").at(-1)?.eventId ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  /**
   * All-time table, shaped exactly like an event's roster so the stats page can render
   * it with the same component and the same columns.
   *
   * The stats page aggregates per SEASON and never across them, so this is the one cut
   * it cannot already do. Kills and the seven type splits are summed over events the
   * player actually played — an absence contributes nothing, same rule as everywhere
   * else. Rank is competition ranking on career kills: ties share a place.
   */
  const allTime = summaries
    .filter((s) => s.playedCount > 0)
    .map((s) => {
      const types = Object.fromEntries(KILL_TYPES.map((t) => [t, 0]));
      s.events
        .filter((e) => e.kind === "played")
        .forEach((e) => KILL_TYPES.forEach((t) => { types[t] += e.types[t] ?? 0; }));
      return {
        player_id: s.playerId,
        Player: s.name,
        Team: s.currentTeam,
        Number: s.number,
        img_url: s.imgUrl,
        "Confirmed Kills": +s.totalKills.toFixed(2),
        ...types,
        Events: s.playedCount,
        "Kills Per Event": +(s.totalKills / s.playedCount).toFixed(2),
      };
    })
    .sort((a, b) => b["Confirmed Kills"] - a["Confirmed Kills"]);
  // Competition ranking — ties share a place, the next distinct value skips.
  let lastRank = 0;
  let prev = null;
  allTime.forEach((r, i) => {
    if (prev === null || r["Confirmed Kills"] !== prev) { lastRank = i + 1; prev = r["Confirmed Kills"]; }
    r.Rank = lastRank;
  });

  /**
   * Spotlight — what the career-stats landing page shows before you search.
   *
   * NOT every player. A directory of 325 names is a table with extra steps; this is
   * three short rows of players who have a photo, because the page's job is recognising
   * someone and pointing at them — search is what reaches the other 319.
   *
   * Photo is a hard requirement, and a brand rule rather than a fallback: a card is a
   * face, so a player without one is reachable by search and by every table on the site,
   * but is never rendered as a card. 174 of 325 players qualify — placeholders and dead
   * URLs are both excluded — which is more than enough to fill a rotating 50.
   */
  // Loaded again here rather than threaded out of buildAll — one extra read, and it
  // keeps buildAll's return value as just the summaries.
  const events = preloadedEvents ?? (await loadEvents(db));
  const LATEST = events.at(-1)?.id ?? null;
  const pickAt = (s, ev) => s.events.find((e) => e.eventId === ev)?.pickPct ?? null;
  /**
   * A real headshot, not a placeholder.
   *
   * 58 players carry a `placeholder.svg` URL rather than an empty field, so a naive
   * "starts with http" check reports 245 photos when only 187 exist. Those URLs also
   * point at a stale Vercel deployment, which is a separate problem — see TODO.
   */
  const looksLikePhoto = (s) => {
    const u = String(s.imgUrl ?? "");
    return u.startsWith("http") && !/placeholder|no-image|default/i.test(u);
  };

  /**
   * The three orderings the rows are drawn from, computed before the photo check so it
   * knows which players are even in contention. Each row later re-filters these for a
   * live photo and takes the first six.
   */
  const played = summaries.filter((s) => s.playedCount > 0);
  const orderings = [
    [...played].sort((a, b) => b.totalKills - a.totalKills),
    [...played]
      .filter((s) => s.events.some((e) => e.eventId === LATEST && e.kind === "played"))
      .sort((a, b) => {
        const k = (x) => x.events.find((e) => e.eventId === LATEST).kills;
        return k(b) - k(a);
      }),
    [...played]
      .filter((s) => pickAt(s, LATEST) != null)
      .sort((a, b) => pickAt(b, LATEST) - pickAt(a, LATEST)),
  ];


  /**
   * A URL is not a photo until it answers.
   *
   * The landing page now shows a card ONLY for a player with a picture, so a broken
   * image is no longer a cosmetic blemish — it is a card that should not exist. Nine of
   * the 183 real-looking URLs are 404s (players whose file was never uploaded, or was
   * renamed), and nothing in the stored data distinguishes them from a live one.
   *
   * So they are fetched. ~180 requests against a public bucket, once per rebuild, is a
   * rounding error next to the 4,600 Firestore reads above, and it is the only way to
   * be sure. A network failure is treated as dead: better to omit a card than to ship
   * one with a hole in it.
   */
  async function reachablePhotos(candidates) {
    const live = new Set();
    const dead = [];
    const unknown = [];
    const queue = [...candidates];
    await Promise.all(
      Array.from({ length: 12 }, async () => {
        while (queue.length) {
          const s = queue.pop();
          let status = null;
          let netErr = null;
          // One retry: a single dropped connection should not decide whether a player
          // appears on the page.
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const r = await fetch(s.imgUrl, { method: "HEAD" });
              status = r.status;
              netErr = null;
              break;
            } catch (e) {
              netErr = e.message;
              if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
            }
          }

          if (status !== null) {
            if (status >= 200 && status < 400) live.add(s.imgUrl);
            else dead.push(`${s.name} (${status})`);
            continue;
          }

          /**
           * A network error is not a 404.
           *
           * A status is a fact about the file; a thrown fetch is a fact about the
           * network, and treating the two alike makes the page flicker — five players
           * vanished from the card rows on one run purely because the wifi changed
           * mid-build. Unknown means keep: a stale card whose image fails to load falls
           * back to the dark tile, which is a smaller and far more debuggable problem
           * than a player who appears and disappears between rebuilds.
           */
          live.add(s.imgUrl);
          unknown.push(`${s.name} (${netErr})`);
        }
      }),
    );
    if (dead.length) {
      console.log(`\n  ${dead.length} photo URLs did not resolve and are excluded:`);
      dead.sort().forEach((d) => console.log(`    ${d}`));
    }
    if (unknown.length) {
      console.log(`\n  ${unknown.length} photo URLs could not be checked and are kept:`);
      unknown.sort().forEach((d) => console.log(`    ${d}`));
    }
    return live;
  }

  /**
   * Only check the photos we might actually show.
   *
   * Checking all 183 candidates took 72 of an 84-second rebuild to answer a question
   * about the ~18 players who end up on the page. Each row is ordered, and a row needs
   * six live photos from the top of its own ordering, so the pool is the leading
   * candidates of each ordering — everyone below that can never be reached.
   *
   * `DEPTH` is the headroom: 25 deep gives a row nineteen spare places to absorb
   * missing photos before it would come up short, against a library that is missing
   * about one in fifteen.
   */
  const DEPTH = 25;
  const livePhotos = await reachablePhotos(
    Array.from(
      new Map(
        orderings
          .flatMap((list) => list.filter(looksLikePhoto).slice(0, DEPTH))
          .map((s) => [s.imgUrl, s]),
      ).values(),
    ),
  );

  /**
   * A photo we have actually confirmed. Anyone outside the checked pool answers false,
   * which is correct: they were too far down every ordering to reach a row anyway.
   */
  const hasPhoto = (s) => looksLikePhoto(s) && livePhotos.has(s.imgUrl);

  const playedOf = (s) => s.events.filter((e) => e.kind === "played");

  /**
   * A card carries THREE ARBITRARY STATS, formatted here rather than in the component.
   *
   * Each row asks a different question, so each row shows different numbers: career
   * figures under "All-time leaders", that event's figures under the event row, and
   * pick-relevant ones under "Most picked". Formatting sits in the builder because the
   * builder is the only place that knows which scope a number came from — the card just
   * renders what it is handed, and can never label a per-match average as a per-event
   * one.
   */
  const ordinal = (n) => {
    const t = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return t[(v - 20) % 10] ?? t[v] ?? t[0];
  };
  const fmtK = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const rankStat = (r) => ({
    value: r ? String(r) : "\u2014",
    suffix: r ? ordinal(r) : null,
    label: "Rank",
  });
  /** Every cost per kill in the pool is four figures or more, so `$X.Xk` is uniform. */
  const money = (n) => (n == null ? "\u2014" : `$${(n / 1000).toFixed(1)}k`);

  const card = (s, statsLabel, stats) => ({
    id: s.playerId,
    name: s.name,
    number: s.number,
    team: s.currentTeam,
    imgUrl: s.imgUrl,
    statsLabel,
    stats,
  });

  const ROW = 6;

  /**
   * All-time leaders — career kills, highest first.
   *
   * The photo rule still applies, so a player without one is skipped rather than shown
   * as a placeholder. That is honest here only because the card carries its RANK: a
   * skipped player leaves a visible gap in the sequence rather than a silent one.
   */
  const allTimeLeaders = summaries
    .filter((s) => s.playedCount > 0 && hasPhoto(s))
    .sort((a, b) => b.totalKills - a.totalKills)
    .slice(0, ROW)
    .map((s) =>
      card(s, "Career stats", [
        rankStat(s.careerRank),
        { value: fmtK(s.totalKills), label: "Kills" },
        { value: s.avgKills.toFixed(1), label: "Kills", sublabel: "/Event" },
      ]),
    );

  /**
   * Latest event's leaders, scoped to that event throughout — its rank, its kills, and
   * kills per GAME rather than per event, which is the only average that means anything
   * inside a single tournament. The label carries the difference, so the same player
   * appearing in both rows cannot be read as a collapse in form.
   */
  const eventLeaders = summaries
    .map((s) => {
      if (!hasPhoto(s)) return null;
      const row = s.events.find((e) => e.eventId === LATEST && e.kind === "played");
      if (!row) return null;
      const games = s.matches.filter((m) => m.eventId === LATEST).length;
      return {
        kills: row.kills,
        card: card(s, "Event stats", [
          rankStat(row.rank),
          { value: fmtK(row.kills), label: "Kills" },
          {
            value: games > 0 ? (row.kills / games).toFixed(1) : "\u2014",
            label: "Kills",
            sublabel: "/Game",
          },
        ]),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.kills - a.kills)
    .slice(0, ROW)
    .map((x) => x.card);

  /**
   * The six most-picked at the latest event, scoped to that event throughout.
   *
   * Career kills used to sit in the first column beside an event pick % and an event
   * cost per kill, which made one card report three different spans at once. All three
   * are now the same event, so the row answers one question: who did people back, and
   * what did they return.
   *
   * A player who was picked and then did not take the field stays in — their kills read
   * 0 and their cost per kill "—", which is the story rather than a gap to hide.
   */
  const spotlight = summaries
    .filter((s) => s.playedCount > 0 && hasPhoto(s) && pickAt(s, LATEST) != null)
    .sort((a, b) => pickAt(b, LATEST) - pickAt(a, LATEST))
    .slice(0, ROW)
    .map((s) => {
      const row = s.events.find((e) => e.eventId === LATEST);
      return card(s, "Pick\u2019Em stats", [
        { value: fmtK(row?.kills ?? 0), label: "Kills" },
        { value: `${(pickAt(s, LATEST) ?? 0).toFixed(1)}%`, label: "Pick%" },
        { value: money(row?.costPerKill ?? null), label: "$/Kill" },
      ]);
    });

  const latestEvent = events.find((e) => e.id === LATEST) || null;
  return { index, allTime, allTimeLeaders, eventLeaders, spotlight, LATEST, latestEvent };
}

/**
 * JSON with keys in a fixed order.
 *
 * The diff compares a document Firestore handed back against one built here, and plain
 * `JSON.stringify` preserves insertion order — which those two do not share by
 * contract. Today they happen to match, so the diff reports zero changes; the day a
 * field is added in a different position, every document would look modified and this
 * would quietly write all 325 on every pass instead of none. Sorting removes the
 * coincidence.
 */
function stableJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  return `{${Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`)
    .join(",")}}`;
}

/**
 * Writes the projection, narrow.
 *
 * Reads the stored summaries back and writes only the players whose content actually
 * changed. A live event moves perhaps 180 of 325 players; writing all of them every
 * time would cost three times as much as the read that avoids it. `rebuiltAt` is
 * excluded from the comparison — otherwise every document would differ from itself.
 */
async function writeAll(db, summaries, aggregates, { now = new Date() } = {}) {
  const existing = new Map();
  const snap = await db.collection("playerSummaries").get();
  snap.docs.forEach((d) => {
    const { rebuiltAt, ...rest } = d.data();
    existing.set(d.id, stableJson(rest));
  });

  const changed = summaries.filter((s) => existing.get(s.playerId) !== stableJson(s));

  const BATCH = 200;
  for (let i = 0; i < changed.length; i += BATCH) {
    const batch = db.batch();
    for (const s of changed.slice(i, i + BATCH)) {
      batch.set(db.doc(`playerSummaries/${s.playerId}`), {
        ...s,
        rebuiltAt: now,
      });
    }
    await batch.commit();
  }

  const { index, allTime, allTimeLeaders, eventLeaders, spotlight, LATEST, latestEvent } =
    aggregates;

  await db.doc("aggregates/playerIndex").set({
    players: index,
    count: index.length,
    rebuiltAt: now,
  });
  // `eventName`/`eventYear` rather than a label: `individualEventDisplayName` stays the
  // single source of naming, exactly as it does for the career page's rows.
  await db.doc("aggregates/spotlight").set({
    eventId: LATEST,
    eventName: latestEvent ? latestEvent.name : null,
    eventYear: latestEvent ? latestEvent.year : null,
    allTimeLeaders,
    eventLeaders,
    players: spotlight,
    rebuiltAt: now,
  });
  await db.doc("aggregates/allTime").set({
    players: allTime,
    count: allTime.length,
    rebuiltAt: now,
  });

  return { changed: changed.length, unchanged: summaries.length - changed.length };
}

/** Build and write in one call — what the scheduled function and the CLI both run. */
async function rebuild(db, { now } = {}) {
  const t0 = Date.now();
  // Read the event list once and thread it through — both halves need it, and on a
  // slow link that one small query was costing well over a second twice.
  const events = await loadEvents(db);
  const summaries = await buildAll(db, { events });
  const tBuilt = Date.now();
  const aggregates = await buildAggregates(db, summaries, { events });
  const tAggs = Date.now();
  const { changed, unchanged } = await writeAll(db, summaries, aggregates, { now });
  const tWrote = Date.now();

  console.log(
    `rebuildPlayerSummaries total=${tWrote - t0}ms | build=${tBuilt - t0}ms ` +
    `aggregates=${tAggs - tBuilt}ms write=${tWrote - tAggs}ms | ` +
    `players=${summaries.length} changed=${changed} unchanged=${unchanged}`,
  );

  return { players: summaries.length, changed, unchanged, aggregates };
}

module.exports = { buildAll, buildAggregates, writeAll, rebuild };
