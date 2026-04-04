import { app, storage } from "./firebaseClient";
import { getDownloadURL, getStorage, ref, type FirebaseStorage } from "firebase/storage";

const LEGACY_BUCKETS = [
  "fantasy-paintball.firebasestorage.app",
  "fantasy-paintball.appspot.com",
] as const;

const SUCCESS_CACHE = new Map<string, string>();
const INFLIGHT = new Map<string, Promise<string | undefined>>();

/** Bumped on clear so in-flight resolutions cannot repopulate a cleared cache. */
let cacheGeneration = 0;

/** Dispatched on the window after {@link forceRefreshAllProfileImages} (client only). */
export const PICKEM_PROFILE_IMAGES_REFRESH_EVENT = "pickem:profile-images-refresh";

/** Clears resolved Storage URLs so the next call hits Firebase again. */
export function clearProfilePictureUrlCache(): void {
  cacheGeneration += 1;
  SUCCESS_CACHE.clear();
  INFLIGHT.clear();
}

/**
 * Clears the resolver cache and notifies mounted UI (leaderboard avatars, top bar,
 * profile, datatable) to re-fetch. Safe to call from a button, shortcut, or console:
 * `import { forceRefreshAllProfileImages } from '@/src/lib/resolveProfilePictureUrl'`.
 */
export function forceRefreshAllProfileImages(): void {
  clearProfilePictureUrlCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PICKEM_PROFILE_IMAGES_REFRESH_EVENT));
  }
}

/** Subscribe to {@link forceRefreshAllProfileImages} (returns unsubscribe). */
export function subscribeProfileImagesRefresh(onRefresh: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = () => onRefresh();
  window.addEventListener(PICKEM_PROFILE_IMAGES_REFRESH_EVENT, handler);
  return () => window.removeEventListener(PICKEM_PROFILE_IMAGES_REFRESH_EVENT, handler);
}

function storagesToProbe(): FirebaseStorage[] {
  const primary = (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
  const out: FirebaseStorage[] = [storage];
  for (const b of LEGACY_BUCKETS) {
    if (b === primary) continue;
    try {
      out.push(getStorage(app, `gs://${b}`));
    } catch {
      // ignore — misconfigured env in rare edge cases
    }
  }
  return out;
}

function buildCacheKey(raw: unknown, userId?: string): string {
  const r =
    typeof raw === "string" ? raw.trim() : raw == null ? "" : JSON.stringify(raw);
  return `${userId ?? ""}::${r}`;
}

/** Drop one resolved URL (e.g. after img onError when the token expired). */
export function invalidateProfilePictureCacheEntry(
  raw: unknown,
  options?: { userId?: string },
): void {
  SUCCESS_CACHE.delete(buildCacheKey(raw, options?.userId));
}

/** Normalize Firestore / API values into empty | http URL | storage object path. */
function normalizeInput(raw: unknown): { kind: "empty" } | { kind: "http"; url: string } | { kind: "path"; path: string } {
  if (raw == null) return { kind: "empty" };
  let s = String(raw).trim();
  if (!s) return { kind: "empty" };

  if (/^(https?:)?\/\//i.test(s) || s.startsWith("data:")) {
    if (s.startsWith("//")) s = `https:${s}`;
    return { kind: "http", url: s };
  }

  if (s.startsWith("gs://")) {
    const idx = s.indexOf("/", 5);
    if (idx === -1) return { kind: "empty" };
    s = s.slice(idx + 1);
  }

  return { kind: "path", path: s.replace(/^\/+/, "") };
}

/** Match getFirebaseStorageUrl behavior for external / full URLs. */
function finalizeHttpUrl(url: string): string {
  let u = url.replace(/&amp;/g, "&");
  if (u.includes("googleusercontent.com") || u.includes("google.com")) {
    return u;
  }
  if (!u.includes("_200x200")) {
    const withSize = u.replace(/(\.\w+)(\?|$)/, "_200x200$1$2");
    if (withSize !== u) return withSize;
  }
  return u;
}

function pathVariants(path: string): string[] {
  const out: string[] = [path];
  // Try legacy Resize-Images name next (Firestore often still has profile_200x200).
  if (path.endsWith("/profile_200x200")) {
    out.push(path.replace(/\/profile_200x200$/, "/profile_200x200_200x200"));
    for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
      out.push(path.replace(/\/profile_200x200$/, `/profile_200x200_200x200${ext}`));
    }
  }
  const extRe = /\.(jpe?g|png|webp)$/i;
  if (extRe.test(path)) {
    out.push(path.replace(extRe, ""));
  } else {
    for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
      out.push(path + ext);
    }
  }
  return Array.from(new Set(out));
}

async function tryPathOnAllStorages(path: string): Promise<string | undefined> {
  for (const st of storagesToProbe()) {
    try {
      const r = ref(st, path);
      return await getDownloadURL(r);
    } catch {
      // wrong bucket, missing object, or invalid path
    }
  }
  return undefined;
}

function collectCandidates(normalizedPath: string, userId?: string): string[] {
  const candidates: string[] = [];
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
  return Array.from(new Set(candidates));
}

/**
 * Resolves a profile picture for display: supports full URLs, gs:// paths, and
 * Storage object paths. Tries the default project bucket plus known legacy
 * bucket names (files sometimes landed in appspot vs firebasestorage.app),
 * and common filename variants (extensions, old resize extension layout).
 */
export async function resolveProfilePictureToUrl(
  raw: unknown,
  options?: { userId?: string },
): Promise<string | undefined> {
  const userId = options?.userId;
  const key = buildCacheKey(raw, userId);
  const genAtStart = cacheGeneration;

  const hit = SUCCESS_CACHE.get(key);
  if (hit) return hit;

  const existing = INFLIGHT.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<string | undefined> => {
    const normalized = normalizeInput(raw);

    if (normalized.kind === "http") {
      if (normalized.url.includes("firebasestorage.googleapis.com")) {
        return normalized.url.replace(/&amp;/g, "&");
      }
      return finalizeHttpUrl(normalized.url);
    }

    if (normalized.kind === "empty") {
      if (!userId) return undefined;
      const candidates = collectCandidates(`user/${userId}/profile_200x200`, undefined);
      for (const p of candidates) {
        const url = await tryPathOnAllStorages(p);
        if (url) {
          if (genAtStart === cacheGeneration) {
            SUCCESS_CACHE.set(key, url);
          }
          return url;
        }
      }
      return undefined;
    }

    const candidates = collectCandidates(normalized.path, userId);
    for (const p of candidates) {
      const url = await tryPathOnAllStorages(p);
      if (url) {
        if (genAtStart === cacheGeneration) {
          SUCCESS_CACHE.set(key, url);
        }
        return url;
      }
    }
    return undefined;
  })();

  INFLIGHT.set(key, promise);
  try {
    return await promise;
  } catch {
    return undefined;
  } finally {
    INFLIGHT.delete(key);
  }
}
