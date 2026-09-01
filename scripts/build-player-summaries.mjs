/**
 * Build `playerSummaries/{playerId}` — one document per player, holding everything a
 * career page renders.
 *
 * WHY
 * A player page currently costs ~6,200 reads: `fetchPlayerCareer` reads all eight full
 * rosters to work out career rank and field size, `fetchOwnership` scans every user
 * document for pick %, and the Matches tab reads a whole event's long data. That grows
 * with every event added, forever. This collapses it to ONE read.
 *
 * THIS IS A PROJECTION, NOT A SOURCE
 * Every value here is derived from `events/{id}/players`, `long_data` and `users`.
 * Nothing is authored here and nothing reads back from here to compute anything else,
 * so a full rebuild is always safe and is the definition of correct. When the live
 * patch lands in `longDataRecompute`, this script stays the reconciliation: rebuild,
 * diff against what the patch produced, and any difference is a bug in the patch.
 *
 * Recomputes from source rather than adjusting stored values — the same rule
 * `longDataRecompute` documents, and for the same reason: incremental arithmetic
 * double-counts on a re-upload and does it silently.
 *
 *   node scripts/build-player-summaries.mjs            # dry run, writes nothing
 *   node scripts/build-player-summaries.mjs --yes      # write
 *   node scripts/build-player-summaries.mjs --player 100015 --yes
 *
 * Reads ~4,600 documents to build all 325 players — less than a single page view costs
 * today.
 */

import admin from "firebase-admin";

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

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
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

/** Match rows per player, per event, from long data. Empty for events not yet loaded. */
function matchesForEvent(rows, teamOfPlayer) {
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

export async function buildAll(db, { onlyPlayer = null } = {}) {
  const events = await loadEvents(db);

  // One pass over each roster, held in memory. Building 325 players this way costs
  // less than one page view does today.
  const rosters = new Map(); // eventId -> Map(playerId -> data)
  const teamTotals = new Map(); // eventId -> Map(teamId -> kills)
  const fieldSizes = new Map();
  for (const ev of events) {
    const snap = await db.collection(`events/${ev.id}/players`).get();
    const byId = new Map();
    const totals = new Map();
    let field = 0;
    snap.docs.forEach((d) => {
      const o = d.data();
      byId.set(d.id, o);
      if (o.participation !== "absent") field++;
      const tid = o.team_id;
      if (tid) totals.set(tid, (totals.get(tid) ?? 0) + num(o["Confirmed Kills"]));
    });
    rosters.set(ev.id, byId);
    teamTotals.set(ev.id, totals);
    fieldSizes.set(ev.id, field);
  }

  const ownership = await loadOwnership(db);

  // Long data, grouped by event. Events without a backfill simply have no rows.
  const longSnap = await db.collection("long_data").get();
  const longByEvent = new Map();
  longSnap.docs.forEach((d) => {
    const r = d.data();
    if (!r.eventId) return;
    if (!longByEvent.has(r.eventId)) longByEvent.set(r.eventId, []);
    longByEvent.get(r.eventId).push(r);
  });

  const matchesByEvent = new Map(); // eventId -> Map(playerId -> match[])
  for (const ev of events) {
    const rows = longByEvent.get(ev.id);
    if (!rows?.length) continue;
    const teamOfPlayer = new Map();
    for (const [pid, o] of Array.from(rosters.get(ev.id))) {
      if (o.team_id) teamOfPlayer.set(pid, o.team_id);
    }
    matchesByEvent.set(ev.id, matchesForEvent(rows, teamOfPlayer));
  }

  /**
   * Career kills across the population, for career rank. Absences contribute nothing
   * and a player who never took the field is not in the running at all — the same rule
   * the page applies today.
   */
  const careerKills = new Map();
  for (const ev of events) {
    for (const [pid, o] of Array.from(rosters.get(ev.id))) {
      if (o.participation === "absent") continue;
      careerKills.set(pid, (careerKills.get(pid) ?? 0) + num(o["Confirmed Kills"]));
    }
  }
  const sortedCareer = Array.from(careerKills.values()).sort((a, b) => b - a);
  const careerRankOf = (total) => sortedCareer.findIndex((k) => k <= total) + 1 || null;

  const everyPlayer = new Set();
  for (const ev of events) for (const pid of Array.from(rosters.get(ev.id).keys())) everyPlayer.add(pid);

  const summaries = [];
  for (const playerId of Array.from(everyPlayer)) {
    if (onlyPlayer && playerId !== onlyPlayer) continue;

    // Rows for every event in the player's own span, so a gap mid-career stays visible.
    const rows = events.map((ev) => {
      const d = rosters.get(ev.id).get(playerId);
      const base = {
        eventId: ev.id,
        eventName: ev.name,
        year: ev.year,
        brandColor: ev.brandColor,
        fieldSize: fieldSizes.get(ev.id),
        pickPct: ownership.get(ev.id)?.byPlayer.get(playerId) ?? null,
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
      name: latestDoc.Player || "Unknown player",
      number: latestDoc.Number ?? null,
      imgUrl: latestDoc.img_url ?? null,
      leagueId: latestDoc.league_id ?? null,
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
    });
  }

  return summaries;
}

async function main() {
  const confirmed = process.argv.includes("--yes");
  const onlyPlayer = arg("--player");

  admin.initializeApp({ projectId: "fantasy-paintball" });
  const db = admin.firestore();

  const t0 = Date.now();
  const summaries = await buildAll(db, { onlyPlayer });
  const built = Date.now();

  const sizes = summaries.map((s) => Buffer.byteLength(JSON.stringify(s), "utf8"));
  const biggest = summaries[sizes.indexOf(Math.max(...sizes))];

  console.log(`\nBuilt ${summaries.length} player summaries in ${built - t0}ms`);
  console.log(`  events per player  ${Math.min(...summaries.map((s) => s.events.length))}–${Math.max(...summaries.map((s) => s.events.length))}`);
  console.log(`  matches per player ${Math.min(...summaries.map((s) => s.matches.length))}–${Math.max(...summaries.map((s) => s.matches.length))}`);
  console.log(`  doc size           avg ${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)}B, max ${Math.max(...sizes)}B (${biggest.name})`);
  console.log(`  largest is ${((Math.max(...sizes) / 1048576) * 100).toFixed(2)}% of the 1 MiB limit`);

  if (!confirmed) {
    console.log("\nNo --yes flag, so nothing was written.\n");
    return;
  }

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
  const events = await loadEvents(db);
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
    const queue = [...candidates];
    await Promise.all(
      Array.from({ length: 12 }, async () => {
        while (queue.length) {
          const s = queue.pop();
          try {
            const r = await fetch(s.imgUrl, { method: "HEAD" });
            if (r.ok) live.add(s.imgUrl);
            else dead.push(`${s.name} (${r.status})`);
          } catch (e) {
            dead.push(`${s.name} (${e.message})`);
          }
        }
      }),
    );
    if (dead.length) {
      console.log(`\n  ${dead.length} photo URLs did not resolve and are excluded:`);
      dead.sort().forEach((d) => console.log(`    ${d}`));
    }
    return live;
  }

  const livePhotos = await reachablePhotos(summaries.filter(looksLikePhoto));
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

  const BATCH = 200;
  let written = 0;
  for (let i = 0; i < summaries.length; i += BATCH) {
    const batch = db.batch();
    for (const s of summaries.slice(i, i + BATCH)) {
      batch.set(db.doc(`playerSummaries/${s.playerId}`), {
        ...s,
        rebuiltAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    written += Math.min(BATCH, summaries.length - i);
    console.log(`  ${written}/${summaries.length}`);
  }
  await db.doc("aggregates/playerIndex").set({
    players: index,
    count: index.length,
    rebuiltAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  // `eventName`/`eventYear` rather than a label: `individualEventDisplayName` stays the
  // single source of naming, exactly as it does for the career page's rows.
  const latestEvent = events.find((e) => e.id === LATEST) ?? null;
  await db.doc("aggregates/spotlight").set({
    eventId: LATEST,
    eventName: latestEvent?.name ?? null,
    eventYear: latestEvent?.year ?? null,
    allTimeLeaders,
    eventLeaders,
    players: spotlight,
    rebuiltAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.doc("aggregates/allTime").set({
    players: allTime,
    count: allTime.length,
    rebuiltAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const kb = (n) => (Buffer.byteLength(JSON.stringify(n), "utf8") / 1024).toFixed(1);
  console.log(`\nWrote ${written} documents to playerSummaries/.`);
  console.log(`Wrote aggregates/playerIndex — ${index.length} players, ${kb(index)} KB.`);
  console.log(`Wrote aggregates/allTime    — ${allTime.length} players, ${kb(allTime)} KB.`);
  console.log(`Wrote aggregates/spotlight  — ${allTimeLeaders.length} all-time, ${eventLeaders.length} at ${LATEST}, ${spotlight.length} most picked, ${kb({ allTimeLeaders, eventLeaders, spotlight })} KB.\n`);
}

// Only run as a CLI. Imported (by the verifier, or a future Cloud Function) this file
// exposes `buildAll` and does nothing on its own.
if (process.argv[1] && process.argv[1].endsWith("build-player-summaries.mjs")) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
