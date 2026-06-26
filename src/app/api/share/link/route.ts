import { db } from "@/src/lib/firebaseClient";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Opaque, non-enumerable id (~12 url-safe chars) so share links never expose
// raw Firebase uids.
function genShareId(): string {
  return randomBytes(9).toString("base64url");
}

/**
 * GET /api/share/link?uid=<uid>
 * Returns the user's stable opaque shareId, creating it (and the
 * shareCards/{id} -> userId mapping) on first request.
 */
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) {
    return NextResponse.json({ error: "missing uid" }, { status: 400 });
  }

  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  // Reuse the cached shareId on the user doc when its mapping still exists.
  const existing = userSnap.get("shareId");
  if (typeof existing === "string" && existing) {
    const mapping = await getDoc(doc(db, "shareCards", existing));
    if (mapping.exists()) {
      return NextResponse.json({ shareId: existing });
    }
    await setDoc(doc(db, "shareCards", existing), {
      userId: uid,
      createdAt: Date.now(),
    });
    return NextResponse.json({ shareId: existing });
  }

  // Mint a new one (collision odds are negligible).
  const shareId = genShareId();
  await setDoc(doc(db, "shareCards", shareId), {
    userId: uid,
    createdAt: Date.now(),
  });
  await updateDoc(userRef, { shareId });

  return NextResponse.json({ shareId });
}
