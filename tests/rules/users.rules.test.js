/**
 * Firestore rules — users/{uid} pick lock and ownership.
 *
 * Needs the Firestore emulator (and Java):
 *   firebase emulators:exec --only firestore --project demo-pickem "npx jest tests/rules"
 *
 * Every write shape below is copied from the app code it names, so a failure here
 * means a real page would break.
 */
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  arrayUnion,
  arrayRemove,
  Timestamp,
} = require("firebase/firestore");

const HOUR = 60 * 60 * 1000;
let env;

const ALICE = "alice";
const BOB = "bob";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-pickem",
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "events", "open_2026"), {
      status: "live",
      lockDate: Timestamp.fromMillis(Date.now() + 24 * HOUR),
    });
    await setDoc(doc(db, "events", "locked_2026"), {
      status: "completed",
      lockDate: Timestamp.fromMillis(Date.now() - 24 * HOUR),
    });
    await setDoc(doc(db, "events", "nolock_2026"), { status: "upcoming" });
    await setDoc(doc(db, "events", "strlock_2026"), {
      lockDate: new Date(Date.now() + 24 * HOUR).toISOString(),
    });
    await setDoc(doc(db, "users", ALICE), {
      email: "alice@example.com",
      firstName: "Alice",
      username: "alice",
      pickems: {
        locked_2026: ["p1", "p2"],
        locked_2026_captain: "p1",
        open_2026: ["p3"],
        open_2026_captain: "p3",
      },
      leagues: [],
    });
    // Legacy-style doc with no pickems map at all.
    await setDoc(doc(db, "users", "carol"), { email: "carol@example.com" });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const ten = Array.from({ length: 10 }, (_, i) => `p${i + 10}`);

// pick-em/page.tsx writeOfficialPicks (autosave, Confirm, share flush)
const officialSave = (eventId, captain = "p10") => ({
  [`pickems.${eventId}`]: ten,
  [`pickems.${eventId}_captain`]: captain,
  pickemsEventId: eventId,
});
// pick-em/page.tsx draft autosave
const draftSave = (eventId) => ({
  [`pickems.${eventId}_draft`]: ten.slice(0, 4),
  [`pickems.${eventId}_draft_captain`]: "p10",
  pickemsEventId: eventId,
});

describe("pick saves (owner)", () => {
  test("owner saves picks + captain before lock", async () => {
    await assertSucceeds(updateDoc(doc(as(ALICE), "users", ALICE), officialSave("open_2026")));
  });

  test("owner saves with captain null (pick-em page allows unset)", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        "pickems.open_2026": ten,
        "pickems.open_2026_captain": null,
        pickemsEventId: "open_2026",
      }),
    );
  });

  test("pick-table.tsx shape (picks only) before lock", async () => {
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        "pickems.open_2026": ten,
        pickemsEventId: "open_2026",
      }),
    );
  });

  test("first pick save on a doc with no pickems field", async () => {
    await assertSucceeds(updateDoc(doc(as("carol"), "users", "carol"), officialSave("open_2026")));
  });

  test("first pick save on a doc created by login ({pickems: {}})", async () => {
    const db = as("dave");
    await assertSucceeds(
      setDoc(doc(db, "users", "dave"), {
        email: "dave@example.com",
        createdAt: new Date(),
        pickems: {},
        total_points: 0,
      }),
    );
    await assertSucceeds(updateDoc(doc(db, "users", "dave"), officialSave("open_2026")));
  });

  test("owner saves picks after lock: denied", async () => {
    await assertFails(updateDoc(doc(as(ALICE), "users", ALICE), officialSave("locked_2026")));
  });

  test("owner changes only the captain after lock: denied", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        "pickems.locked_2026_captain": "p2",
        pickemsEventId: "locked_2026",
      }),
    );
  });

  test("locked key smuggled in with an open event's save: denied", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        ...officialSave("open_2026"),
        "pickems.locked_2026_captain": "p2",
      }),
    );
  });

  test("save without pickemsEventId (old client bundle): denied", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        "pickems.open_2026": ten,
        "pickems.open_2026_captain": "p10",
      }),
    );
  });

  test("pickemsEventId left over from an earlier save does not open a locked event", async () => {
    // Alice saved open_2026 earlier, so the stored pickemsEventId is open_2026 ...
    await assertSucceeds(updateDoc(doc(as(ALICE), "users", ALICE), officialSave("open_2026")));
    // ... which must not let her touch locked_2026 without naming it.
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), { "pickems.locked_2026": ten }),
    );
  });

  test("event without lockDate: locked", async () => {
    await assertFails(updateDoc(doc(as(ALICE), "users", ALICE), officialSave("nolock_2026")));
  });

  test("event whose lockDate is a string, not a timestamp: locked", async () => {
    await assertFails(updateDoc(doc(as(ALICE), "users", ALICE), officialSave("strlock_2026")));
  });

  test("event that does not exist: locked", async () => {
    await assertFails(updateDoc(doc(as(ALICE), "users", ALICE), officialSave("no_such_event")));
  });

  test("event id with a slash: denied", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), {
        "pickems.open_2026": ten,
        pickemsEventId: "open_2026/players/x",
      }),
    );
  });

  test("replacing the whole pickems map (drops locked picks): denied", async () => {
    await assertFails(
      setDoc(doc(as(ALICE), "users", ALICE), {
        email: "alice@example.com",
        pickems: { open_2026: ten },
        pickemsEventId: "open_2026",
      }),
    );
  });

  test("deleting the pickems field: denied", async () => {
    const { deleteField } = require("firebase/firestore");
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), { pickems: deleteField() }),
    );
  });

  test("pickems set to a non-map: denied", async () => {
    await assertFails(
      updateDoc(doc(as(ALICE), "users", ALICE), { pickems: "x", pickemsEventId: "open_2026" }),
    );
  });
});

describe("drafts (locked with the event: the page never writes them after lock)", () => {
  test("draft save before lock", async () => {
    await assertSucceeds(updateDoc(doc(as(ALICE), "users", ALICE), draftSave("open_2026")));
  });

  test("draft save after lock: denied", async () => {
    await assertFails(updateDoc(doc(as(ALICE), "users", ALICE), draftSave("locked_2026")));
  });
});

describe("someone else's picks", () => {
  test("another signed-in user writes my picks: denied", async () => {
    await assertFails(updateDoc(doc(as(BOB), "users", ALICE), officialSave("open_2026")));
  });

  test("signed out writes my picks: denied", async () => {
    await assertFails(updateDoc(doc(anon(), "users", ALICE), officialSave("open_2026")));
  });

  test("another user overwrites my profile: denied", async () => {
    await assertFails(
      setDoc(doc(as(BOB), "users", ALICE), { username: "hacked" }, { merge: true }),
    );
  });

  test("signed out overwrites my profile: denied", async () => {
    await assertFails(setDoc(doc(anon(), "users", ALICE), { firstName: "x" }, { merge: true }));
  });

  test("another user creates a doc under my uid: denied", async () => {
    await assertFails(setDoc(doc(as(BOB), "users", "erin"), { email: "x" }));
  });

  test("signed out creates a user doc: denied", async () => {
    await assertFails(setDoc(doc(anon(), "users", "erin"), { email: "x" }));
  });
});

describe("owner profile and settings writes (all after alice's locked event)", () => {
  const db = () => as(ALICE);
  const ref = () => doc(db(), "users", ALICE);

  test("updateFirestoreName (settings, register step 2)", async () => {
    await assertSucceeds(
      setDoc(ref(), { name: "Alice A", firstName: "Alice", lastName: "A" }, { merge: true }),
    );
  });
  test("register step 2 profile", async () => {
    await assertSucceeds(
      setDoc(
        ref(),
        {
          firstName: "Alice",
          lastName: "A",
          username: "alice_a",
          email: "alice@example.com",
          profilePicture: `user/${ALICE}/profile_200x200`,
        },
        { merge: true },
      ),
    );
  });
  test("ProfileCompletion", async () => {
    await assertSucceeds(
      setDoc(ref(), { firstName: "A", lastName: "B", username: "ab", profilePicture: "p" }, { merge: true }),
    );
  });
  test("settings username change", async () => {
    await assertSucceeds(setDoc(ref(), { username: "new", hasChangedUsername: true }, { merge: true }));
  });
  test("settings profile picture", async () => {
    await assertSucceeds(setDoc(ref(), { profilePicture: "user/alice/x" }, { merge: true }));
  });
  test("pick-em favourites", async () => {
    await assertSucceeds(updateDoc(ref(), { pickem_favourites: ["p1"] }));
  });
  test("displayBadges", async () => {
    await assertSucceeds(updateDoc(ref(), { displayBadges: ["b1"] }));
  });
  test("badgesAnnouncementSeen", async () => {
    await assertSucceeds(updateDoc(ref(), { badgesAnnouncementSeen: true }));
  });
  test("postEventModalSeen", async () => {
    await assertSucceeds(updateDoc(ref(), { postEventModalSeen: "locked_2026" }));
  });
  test("owner cannot delete their user doc", async () => {
    await assertFails(deleteDoc(ref()));
  });
  test("reads stay public", async () => {
    await assertSucceeds(getDoc(doc(anon(), "users", ALICE)));
  });
});

describe("account creation", () => {
  test("login: new doc with empty pickems", async () => {
    await assertSucceeds(
      setDoc(doc(as("frank"), "users", "frank"), {
        email: "frank@example.com",
        createdAt: new Date(),
        pickems: {},
        total_points: 0,
      }),
    );
  });
  test("register step 1: merge {email}", async () => {
    await assertSucceeds(
      setDoc(doc(as("gina"), "users", "gina"), { email: "gina@example.com" }, { merge: true }),
    );
  });
  test("create with picks already in it: denied", async () => {
    await assertFails(
      setDoc(doc(as("hank"), "users", "hank"), { pickems: { locked_2026: ten } }),
    );
  });
});

describe("client-SDK server routes (anonymous until stage 2)", () => {
  const ref = () => doc(anon(), "users", ALICE);

  test("leagues/create, join, leave, delete", async () => {
    await assertSucceeds(updateDoc(ref(), { leagues: arrayUnion("L1"), adminLeagues: arrayUnion("L1") }));
    await assertSucceeds(updateDoc(ref(), { leagues: arrayRemove("L1"), adminLeagues: arrayRemove("L1") }));
  });
  test("leagues request / members accept", async () => {
    await assertSucceeds(updateDoc(ref(), { leagueRequests: arrayUnion("L2") }));
    await assertSucceeds(
      updateDoc(ref(), { leagues: arrayUnion("L2"), leagueRequests: arrayRemove("L2") }),
    );
  });
  test("stripe webhook checkout completed", async () => {
    await assertSucceeds(
      updateDoc(ref(), {
        isSubscribed: true,
        subscriptionTier: "monthly",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        subscriptionStatus: "active",
        subscriptionCurrentPeriodEnd: new Date().toISOString(),
        subscriptionCancelAtPeriodEnd: false,
        updatedAt: new Date().toISOString(),
      }),
    );
  });
  test("stripe payment succeeded / failed, cancel", async () => {
    await assertSucceeds(
      updateDoc(ref(), { lastPaymentDate: "x", lastPaymentAmount: 500, updatedAt: "x" }),
    );
    await assertSucceeds(
      updateDoc(ref(), { paymentFailed: true, lastPaymentFailedDate: "x", updatedAt: "x" }),
    );
    await assertSucceeds(updateDoc(ref(), { subscriptionCancelAtPeriodEnd: true, updatedAt: "x" }));
  });
  test("share/link", async () => {
    await assertSucceeds(updateDoc(ref(), { shareId: "abc123" }));
  });
  test("server-route path cannot carry picks", async () => {
    await assertFails(updateDoc(ref(), { leagues: arrayUnion("L3"), ...officialSave("open_2026") }));
  });
  test("user/create-pickem-data (no caller in repo): now denied", async () => {
    await assertFails(
      updateDoc(ref(), { pickemData: {}, locked_2026Rank: 1, locked_2026PTS: 10 }),
    );
  });
});

describe("rest of the rules unchanged", () => {
  test("events still read-only", async () => {
    await assertSucceeds(getDoc(doc(anon(), "events", "open_2026")));
    await assertFails(setDoc(doc(as(ALICE), "events", "open_2026"), { lockDate: null }));
  });
});
