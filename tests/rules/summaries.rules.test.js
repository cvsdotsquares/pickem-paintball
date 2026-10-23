/**
 * Firestore rules — events/{id}/summaries (pick % snapshots): anyone reads, nobody writes from a client.
 *   firebase emulators:exec --only firestore --project demo-pickem "npx jest tests/rules"
 */
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc } = require("firebase/firestore");

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-pickem-summaries",
    firestore: { rules: fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8") },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "events/world_cup_2026/summaries/pickPct"), { entries: 1 });
  });
});
afterAll(() => env.cleanup());

test("signed out can read a pick % snapshot", async () => {
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "events/world_cup_2026/summaries/pickPct")));
});
test("signed out can read the live pick %", async () => {
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "events/world_cup_2026/summaries/pickPctLive")));
});
test("a signed-in user cannot write a snapshot", async () => {
  await assertFails(setDoc(doc(env.authenticatedContext("alice").firestore(), "events/world_cup_2026/summaries/pickPct"), { entries: 999 }));
});
test("signed out cannot write the live pick %", async () => {
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), "events/world_cup_2026/summaries/pickPctLive"), { entries: 999 }));
});
