// The collaborators auto-fill rule (src/lib/admin/collab.ts). Run: node --test tests/collab.node.test.mjs
// (Node 23.6+ reads the .ts file directly; jest doesn't pick up .mjs files.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoCollaborators, cleanHandle, cleanList, headline } from "../src/lib/admin/collab.ts";

const handles = {
  "Pavel Karsliev": "@paintballkarsliev",
  "Alexander Berdnikov": "@maloy11",
  "Red Legion": "@redlegionclub",
  Aftermath: "@asgaftermath",
  PaintballFIT: "@paintballfit",
  Infamous: "@infamouspaintball",
  Heat: "@houstonheatpaintball",
  "Andrew Malsam": "@ajmalsam",
  "James Green": "@greenyy42",
  NXL: "@nxlpaintball",
};
const teams = {
  Aftermath: { name: "Perris ASG Aftermath", short: "Aftermath", code: "AFM", handle: "@asgaftermath" },
  Heat: { name: "Houston Heat", short: "Heat", code: "HEA", handle: "@houstonheatpaintball" },
  Damage: { name: "Tampa Bay Damage", short: "Damage", code: "DMG", handle: "@tampabay_damage" },
};
const auto = (data) => autoCollaborators(data, handles, teams);

test("player post: player + his team + NXL", () => {
  assert.deepEqual(auto({ player: "Pavel Karsliev", team: "Red Legion" }), ["paintballkarsliev", "redlegionclub", "nxlpaintball"]);
});

test("many players (a leaderboard): the #1 player and his team", () => {
  const data = { checkpoint: "thursday", rows: [{ player: "Pavel Karsliev", team: "Red Legion" }, { player: "Alexander Berdnikov", team: "Red Legion" }] };
  assert.deepEqual(auto(data), ["paintballkarsliev", "redlegionclub", "nxlpaintball"]);
});

test("one team's post (bracket breakdown): the team + NXL, opponents ignored", () => {
  const data = { bracket: "A", team: "Aftermath", opponents: [{ team: "Infamous" }, { team: "PaintballFIT" }] };
  assert.deepEqual(auto(data), ["asgaftermath", "nxlpaintball"]);
});

test("many teams (a bracket's odds): the #1 team, matched by key or full name", () => {
  assert.deepEqual(auto({ teams: [{ key: "PaintballFIT", name: "PaintballFIT" }, { key: "Infamous" }] }), ["paintballfit", "nxlpaintball"]);
  assert.deepEqual(auto({ teams: [{ name: "Houston Heat" }, { name: "Perris ASG Aftermath" }] }), ["houstonheatpaintball", "nxlpaintball"]);
});

test("team only in teams.json (by code): its teams.json handle", () => {
  assert.deepEqual(auto({ team: "DMG" }), ["tampabay_damage", "nxlpaintball"]);
});

test("a missing handle is skipped, never guessed", () => {
  assert.deepEqual(auto({ player: "Daniela Rojas", team: "LTF" }), ["nxlpaintball"]);
  assert.deepEqual(auto({ player: "Pavel Karsliev", team: "LTF" }), ["paintballkarsliev", "nxlpaintball"]);
});

test("a quoted nickname still finds the player", () => {
  assert.deepEqual(auto({ player: 'Andrew "AJ" Malsam' }), ["ajmalsam", "nxlpaintball"]);
});

test("no data (not made yet) or an event post with nobody in it: NXL only", () => {
  assert.deepEqual(auto(null), ["nxlpaintball"]);
  assert.deepEqual(auto({ entries: 100, lock_at: "2026-11-12T12:25:00.000Z" }), ["nxlpaintball"]);
});

test("never more than 3, never our own account", () => {
  const out = autoCollaborators({ player: "Pick Em", team: "Heat" }, { ...handles, "Pick Em": "@pickempaintball" }, teams);
  assert.deepEqual(out, ["houstonheatpaintball", "nxlpaintball"]);
  assert.ok(auto({ player: "James Green", team: "Aftermath" }).length <= 3);
});

test("headline: top-level team wins over the rows' teams", () => {
  assert.deepEqual(headline({ team: "Aftermath", rows: [{ player: "James Green", team: "Heat" }] }), { player: "James Green", team: ["Aftermath"] });
});

test("cleanHandle / cleanList: what James types", () => {
  assert.equal(cleanHandle("@NXLPaintball"), "nxlpaintball");
  assert.equal(cleanHandle("https://www.instagram.com/asgaftermath/"), "asgaftermath");
  assert.equal(cleanHandle("not a handle!"), null);
  assert.equal(cleanHandle(".dot"), null);
  assert.deepEqual(cleanList(["@a, @b", "@a", "@pickempaintball", "bad!"]), { ok: ["a", "b"], bad: ["bad!"], own: ["pickempaintball"], tooMany: false });
  assert.equal(cleanList(["a", "b", "c", "d"]).tooMany, true);
});
