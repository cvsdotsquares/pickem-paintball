import { NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { calculateBadgesForAllUsers } from "@/src/lib/badgeCalculator";

export const dynamic = "force-dynamic";

function ensureAdmin(): boolean {
  if (getApps().length > 0) return true;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!privateKey || !clientEmail || !projectId) return false;
  try {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!ensureAdmin()) {
    return NextResponse.json(
      { error: "Admin SDK unavailable" },
      { status: 503 },
    );
  }

  const apiKey = request.headers.get("X-API-Key");
  const authHeader = request.headers.get("Authorization");

  let authorized = false;

  if (apiKey && apiKey === process.env.API_SECRET_KEY) {
    authorized = true;
  } else if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split("Bearer ")[1];
    try {
      await getAuth().verifyIdToken(token);
      authorized = true;
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getFirestore();
    const result = await calculateBadgesForAllUsers(db);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[badges/calculate] failed", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
