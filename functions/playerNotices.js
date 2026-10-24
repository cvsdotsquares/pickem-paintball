// What a write to events/{eventId}/players/{playerId} should tell the users who picked that player.
// Pure, so it can be tested without Firestore (functions/test/playerNotices.test.cjs).
//
//   Status changed                     → 'player_status_changed' ("X is now Out for World Cup")
//   team_id changed on an existing doc → 'player_team_changed'   ("X has moved to Dynasty for World Cup")
//                                         (James, 24 Oct 2026: a roster move notifies pickers too)
// A new doc (the roster's first sync) only counts for Status, as before; a team change needs a team on both sides,
// so a field being filled in for the first time notifies nobody.
function playerChangeNotices({ before = {}, after = {}, beforeExists = false, playerName, eventName }) {
  const out = [];
  if (after.Status && after.Status !== before.Status) {
    out.push({
      type: 'player_status_changed',
      oldStatus: before.Status || null,
      newStatus: after.Status,
      message: `${playerName} is now ${after.Status} for ${eventName}`,
    });
  }
  const oldTeam = String(before.team_id || '');
  const newTeam = String(after.team_id || '');
  if (beforeExists && oldTeam && newTeam && oldTeam !== newTeam) {
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

module.exports = { playerChangeNotices };
