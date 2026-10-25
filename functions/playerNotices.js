// What a write to events/{eventId}/players/{playerId} should tell the users who picked that player.
// Pure, so it can be tested without Firestore (functions/test/playerNotices.test.cjs).
//
//   Status changed                     → 'player_status_changed' ("X is now Out for World Cup")
//   team_id changed on an existing doc → 'player_team_changed'   ("X has moved to Dynasty for World Cup")
//                                         (James, 24 Oct 2026: a roster move notifies pickers too)
// A new doc (the roster's first sync) only counts for Status, as before; a team change needs a team on both sides,
// so a field being filled in for the first time notifies nobody. A new code under the same team name (Aftermath
// SDA → AFM, James 25 Oct 2026) is a rename, not a move, so it notifies nobody either.
//
// Notices are only there to tell pickers they may need to change a pick (James, 24 Oct 2026), so a player becoming
// Confirmed, Unconfirmed or Addition notifies nobody: e.g. Unconfirmed → Confirmed at roster lock, or Out → Confirmed.
const NO_NOTICE = new Set(['confirmed', 'unconfirmed', 'addition']);

/** Both docs name the same team (case and spacing aside). False when either side has no name. */
function sameTeamName(a, b) {
  const norm = (v) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(a) !== '' && norm(a) === norm(b);
}

function playerChangeNotices({ before = {}, after = {}, beforeExists = false, playerName, eventName }) {
  const out = [];
  if (after.Status && after.Status !== before.Status && !NO_NOTICE.has(String(after.Status).trim().toLowerCase())) {
    out.push({
      type: 'player_status_changed',
      oldStatus: before.Status || null,
      newStatus: after.Status,
      message: `${playerName} is now ${after.Status} for ${eventName}`,
    });
  }
  const oldTeam = String(before.team_id || '');
  const newTeam = String(after.team_id || '');
  const sameName = sameTeamName(before.Team, after.Team);
  if (beforeExists && oldTeam && newTeam && oldTeam !== newTeam && !sameName) {
    const teamName = String(after.Team || newTeam);
    out.push({
      type: 'player_team_changed',
      oldTeam: String(before.Team || oldTeam),
      newTeam: teamName,
      message: `${playerName} has moved to ${teamName} for ${eventName}`,
    });
  }
  return out;
}

module.exports = { playerChangeNotices, NO_NOTICE };
