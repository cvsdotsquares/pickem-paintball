import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { ensureAdmin } from "@/src/lib/authEmailsServer";
import { currencyForRegion } from "@/src/lib/regionCurrency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/user/region (signed in): saves the country of this visit on the user's doc, so our emails can quote the
 * price in their own currency (£ / € / $) instead of all three. The browser calls it at most once a day.
 * Writes users/{uid}.lastCountry, lastCurrency, lastRegionAt. The email agent's sync passes lastCurrency to Klaviyo.
 */
export async function POST(request: NextRequest) {
  if (!ensureAdmin()) return NextResponse.json({ saved: false });
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const country = (request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ saved: false });
  await getFirestore().collection("users").doc(uid).set(
    { lastCountry: country, lastCurrency: currencyForRegion(country), lastRegionAt: Date.now() },
    { merge: true },
  );
  return NextResponse.json({ saved: true });
}
