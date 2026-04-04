/**
 * Dev CLI: verify each user's profilePicture (and default user/{uid}/profile_200x200)
 * resolves to an object in Firebase Storage, using the same path variants and buckets
 * as src/lib/resolveProfilePictureUrl.ts (Admin SDK, no browser).
 *
 * This does NOT clear in-browser image caches. To reset the app resolver cache + refetch
 * UI, run in the browser console on the dashboard (after exposing it once) or hard-reload:
 *   forceRefreshAllProfileImages()
 *
 * Usage (from repo root):
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
 *   node functions/verify-profile-image-paths.js
 *   node functions/verify-profile-image-paths.js --limit 100
 *   node functions/verify-profile-image-paths.js --uid <firebaseUid>
 *   node functions/verify-profile-image-paths.js --username patrick23
 *
 * Exit code 1 if any checked user with a storage path is MISSING (unless --warn-only).
 */
const admin = require('firebase-admin');

const LEGACY_BUCKETS = [
  'fantasy-paintball.firebasestorage.app',
  'fantasy-paintball.appspot.com',
];

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = { limit: null, uid: null, username: null, warnOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit' && argv[i + 1]) {
      out.limit = parseInt(argv[++i], 10);
    } else if (argv[i] === '--uid' && argv[i + 1]) {
      out.uid = argv[++i];
    } else if (argv[i] === '--username' && argv[i + 1]) {
      out.username = argv[++i];
    } else if (argv[i] === '--warn-only') {
      out.warnOnly = true;
    }
  }
  return out;
}

function bucketsToProbe() {
  const primary =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.GCLOUD_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    '';
  const ordered = [];
  if (primary.trim()) ordered.push(primary.trim());
  for (const b of LEGACY_BUCKETS) {
    if (!ordered.includes(b)) ordered.push(b);
  }
  return ordered;
}

function normalizeInput(raw) {
  if (raw == null) return { kind: 'empty' };
  let s = String(raw).trim();
  if (!s) return { kind: 'empty' };
  if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:')) {
    if (s.startsWith('//')) s = `https:${s}`;
    return { kind: 'http', url: s };
  }
  if (s.startsWith('gs://')) {
    const idx = s.indexOf('/', 5);
    if (idx === -1) return { kind: 'empty' };
    s = s.slice(idx + 1);
  }
  return { kind: 'path', path: s.replace(/^\/+/, '') };
}

function pathVariants(path) {
  const out = [path];
  if (path.endsWith('/profile_200x200')) {
    out.push(path.replace(/\/profile_200x200$/, '/profile_200x200_200x200'));
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
      out.push(path.replace(/\/profile_200x200$/, `/profile_200x200_200x200${ext}`));
    }
  }
  const extRe = /\.(jpe?g|png|webp)$/i;
  if (extRe.test(path)) {
    out.push(path.replace(extRe, ''));
  } else {
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
      out.push(path + ext);
    }
  }
  return [...new Set(out)];
}

function collectCandidates(normalizedPath, userId) {
  const candidates = [];
  for (const p of pathVariants(normalizedPath)) {
    candidates.push(p);
  }
  if (userId) {
    const def = `user/${userId}/profile_200x200`;
    if (def !== normalizedPath) {
      for (const p of pathVariants(def)) {
        candidates.push(p);
      }
    }
  }
  return [...new Set(candidates)];
}

async function tryResolvePath(storage, buckets, objectPath) {
  for (const bucketName of buckets) {
    try {
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(objectPath);
      const [exists] = await file.exists();
      if (exists) {
        return { bucket: bucketName, objectPath };
      }
    } catch (e) {
      // wrong bucket / permission noise — try next
    }
  }
  return null;
}

async function resolveForUser(storage, buckets, uid, profilePictureRaw) {
  const normalized = normalizeInput(profilePictureRaw);

  if (normalized.kind === 'http') {
    return {
      status: 'external_url',
      detail: normalized.url.slice(0, 80) + (normalized.url.length > 80 ? '…' : ''),
    };
  }

  let candidates;
  if (normalized.kind === 'empty') {
    candidates = collectCandidates(`user/${uid}/profile_200x200`, undefined);
  } else {
    candidates = collectCandidates(normalized.path, uid);
  }

  for (const p of candidates) {
    const hit = await tryResolvePath(storage, buckets, p);
    if (hit) {
      return {
        status: 'ok',
        bucket: hit.bucket,
        resolvedPath: hit.objectPath,
        firestorePath: normalized.kind === 'path' ? normalized.path : '(empty → default layout)',
      };
    }
  }

  return {
    status: 'missing',
    triedSample: candidates.slice(0, 6),
    totalCandidates: candidates.length,
    firestorePath:
      normalized.kind === 'path' ? normalized.path : '(empty, default layout only)',
  };
}

async function main() {
  const { limit, uid: argUid, username, warnOnly } = parseArgs();

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'fantasy-paintball' });
  }
  const db = admin.firestore();
  const storage = admin.storage();
  const buckets = bucketsToProbe();

  console.log('\nverify-profile-image-paths.js');
  console.log('Buckets (order):', buckets.join(', '));
  console.log('');

  let snap;
  if (argUid) {
    const d = await db.doc(`users/${argUid}`).get();
    if (!d.exists) {
      console.error(`No user doc users/${argUid}`);
      process.exit(1);
    }
    snap = { docs: [d] };
  } else if (username) {
    let q = await db.collection('users').where('username', '==', username).limit(1).get();
    if (q.empty) {
      q = await db
        .collection('users')
        .where('username', '==', username.toLowerCase())
        .limit(1)
        .get();
    }
    if (q.empty) {
      console.error(`No user with username "${username}"`);
      process.exit(1);
    }
    snap = q;
  } else {
    let ref = db.collection('users');
    if (limit && Number.isFinite(limit) && limit > 0) {
      ref = ref.limit(limit);
    }
    snap = await ref.get();
  }

  const rows = [];
  let missingCount = 0;

  for (const doc of snap.docs) {
    const uid = doc.id;
    const data = doc.data() || {};
    const uname = data.username || data.displayName || data.name || '—';
    const pp = data.profilePicture;

    const result = await resolveForUser(storage, buckets, uid, pp);
    rows.push({ uid, username: uname, profilePicture: pp, ...result });
    if (result.status === 'missing') missingCount += 1;
  }

  for (const r of rows) {
    if (r.status === 'ok') {
      console.log(
        `OK   ${r.uid}  ${r.username}  bucket=${r.bucket}  path=${r.resolvedPath}  (Firestore: ${r.firestorePath})`,
      );
    } else if (r.status === 'external_url') {
      console.log(`URL  ${r.uid}  ${r.username}  ${r.detail}`);
    } else {
      console.log(
        `MISS ${r.uid}  ${r.username}  firestore=${JSON.stringify(r.profilePicture)}  tried(first 6)=${JSON.stringify(r.triedSample)}  totalCandidates=${r.totalCandidates}`,
      );
    }
  }

  console.log(`\nSummary: ${rows.length} user(s) checked, ${missingCount} missing storage object(s).\n`);

  if (missingCount > 0 && !warnOnly) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
