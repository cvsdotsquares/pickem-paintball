# Security Hardening — locking down the database

**Status: Stage 1 done and live. Stages 2 and 3 not started.**
Paused 22 August 2026. Pick up at "Next time: start here".

---

## The problem, in plain terms

Your website talks to the database using a key that ships inside the web page —
`NEXT_PUBLIC_FIREBASE_API_KEY`. That's normal and unavoidable: every Firebase app works
this way, and the key can't be hidden because the browser needs it.

The key identifies the project. It doesn't grant permission. Permission comes entirely
from the **security rules**. And until 22 August those rules said:

```
allow read, write: if true;     // i.e. anyone, anything
```

So anyone on the internet could read and write the whole database without logging in,
without using the website at all. Demonstrated with a single `curl` command that
returned a real user's email address and name.

**What was exposed:**

- 1,600 users' `email`, `firstName`, `lastName`, `stripeCustomerId`, `subscriptionTier`
- Anyone could set their own `isSubscribed: true` — the paywall was not enforced
- Anyone could rewrite their `{eventId}PTS` / `{eventId}Rank` — leaderboard positions
- Anyone could edit *another* user's picks, after lock
- Anyone could change player `Confirmed Kills`

Given European players and likely EU/UK users, the exposed personal data is a GDPR
matter, not just a hardening task.

---

## The two "doors"

| | How it works | Who uses it |
|---|---|---|
| **Door 1** — public API key | No credentials. Controlled only by security rules. | The website, and ~22 server routes |
| **Door 2** — admin credentials | A private key proving "this is our server". Bypasses rules entirely. | 3 server routes (currently failing — see below) |

The Google Sheets stats pipeline uses its own service-account credentials stored inside
Apps Script. It was always on Door 2 and is unaffected by any of this.

---

## Stage 1 — DONE (22 Aug 2026)

Deployed `firestore.rules` making all game data **read-only** to the public. Verified by
probing the REST API directly: reads return 200, every anonymous write returns 403.

Locked read-only: `events`, `events/{id}/players`, `leaderboards`, `long_data`,
`players/**`, `cmsPages`, `stats`. `uploads` is fully sealed. Everything not explicitly
named is denied by default.

Safe because **not one client or server route writes to any of them** — they're written
only by Cloud Functions and Apps Script, which bypass rules. Verified before deploying.

Still open (and still exposed): `users`, `leagues`, `notifications`, `shareCards`.

---

## Next time: start here

### Step 1 — download the credentials

1. Go to [Firebase → Service accounts](https://console.firebase.google.com/project/fantasy-paintball/settings/serviceaccounts/adminsdk)
2. Scroll down, click **Generate new private key**, then **Generate key**
3. A `.json` file downloads — leave it in Downloads, don't open it

### Step 2 — put them on your laptop

Claude reads the two values out of the file and adds them to `.env.local`:

```
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-…@fantasy-paintball.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
```

The private key must have newlines written as literal `\n` and be wrapped in quotes —
the code does `.replace(/\\n/g, "\n")`. Get it wrong and it fails **silently**.

### Step 3 — put them on Vercel

Vercel → project → Settings → Environment Variables → add the same two.
(Your laptop file is only for testing. The live site reads Vercel's copy.)

⚠️ Note: **`FIREBASE_PRIVATE_KEY` and `FIREBASE_CLIENT_EMAIL` are on neither the Project
nor the Shared tab today** — confirmed 22 Aug. They must be created, not found.

---

## Stage 2 — convert the server routes to Door 2

**16 routes write to Firestore using the client SDK. They need converting to
`firebase-admin`.** 8 further routes only read and can stay as they are.

| | |
|---|---|
| Total size | ~1,204 lines |
| `arrayUnion` / `arrayRemove` → `FieldValue.*` | 34 |
| `serverTimestamp()` → `FieldValue.serverTimestamp()` | 4 |
| `increment()` → `FieldValue.increment()` | 2 |

**The one hazard that fails silently — Timestamp shape:**

```
client SDK  ->  { "seconds": …, "nanoseconds": … }
admin SDK   ->  { "_seconds": …, "_nanoseconds": … }
```

9 of the 16 routes return raw `.data()` as JSON, and `leagues` carries `createdAt` +
`inviteCodeExpiry`, `notifications` carries `createdAt`. **Fix: normalise timestamps to
ISO strings at each response boundary.** (The one place doing timestamp maths on a
response — `leagues/search/route.ts:43` — is a read-only route we're not converting.)

**Order to do it in, least risky first:**
1. Leagues (10 routes)
2. Notifications + share link (2)
3. Stripe: webhook, sync-subscription, cancel-subscription (3) — slowest, most care
4. `user/create-pickem-data` (1)

**Do first:** write a shared `src/lib/firebaseAdmin.ts`. All three existing admin routes
duplicate the same 20-line init block; a shared helper makes each conversion a one-line
import.

**Testing reality:** there is no automated coverage — one Playwright visual spec, no API
tests. Every converted route must be exercised by hand before shipping.

---

## Stage 3 — lock the remaining collections

Target: `users`, `leagues`, `notifications`, `shareCards` require authentication, and
server-owned fields (`{event}PTS`, `{event}Rank`, `badges`, `isSubscribed`,
`subscription*`, `stripe*`) become non-writable by clients.

**Design decision to make first.** Firestore rules are all-or-nothing per document —
you cannot hide just the `email` field. But the leaderboard and the username-uniqueness
check both read the whole `users` collection. Two options:

- **(Recommended)** Move PII — `email`, `firstName`, `lastName`, `stripeCustomerId`,
  `stripeSubscriptionId` — into a `users/{uid}/private/` subcollection that rules deny
  outright. The main user doc stays readable, so nothing needs rewriting.
- Or repoint the leaderboard at `leaderboards/{eventId}` (which already holds display
  name, photo, PTS and rank) and move username checks to a `usernames/{name}` collection.

---

## Loose ends found along the way

- **Three routes are failing right now** because the admin credentials don't exist:
  `badges/calculate`, `badges/recalculate-self`, `leaderboard/users`. They return 503.
  Adding the credentials fixes them as a side effect.
- **`NEXT_PUBLIC_DEV_ALLOW_UNVERIFIED_LOGIN`** — if this is ever set to `true` outside
  local development, unverified accounts can sign in (`src/lib/firebasePublicEnv.ts:33`).
  Confirm it is not set in Vercel.
- **6 users have `isSubscribed: true` with no Stripe customer, tier or status** (42 others
  are properly subscribed and tiered `monthly`). Almost certainly accounts you comped
  manually — but worth confirming, since until 22 August anyone could have granted
  themselves exactly that with one HTTP request.
- **Three different URL variables** exist in the code — `APP_URL`, `NEXT_PUBLIC_APP_URL`,
  `NEXT_PUBLIC_URL`. Likely drift; worth consolidating.
- **`firestore.indexes.json` has one index.** Adding rules doesn't change indexes, but
  the career-dashboard work will likely need more.
