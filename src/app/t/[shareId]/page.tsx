import type { Metadata } from "next";
import { headers } from "next/headers";
import { db } from "@/src/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";

// v1: shareId === the user's uid; the OG image reads live data.
// Later (with the Share button) this becomes an opaque shareCards/{id} that
// snapshots picks so the card is stable after edits.

export const dynamic = "force-dynamic";

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") || "pickempaintball.com";
  const proto =
    h.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Opaque shareId -> userId via the shareCards mapping (falls back to treating
// the id as a raw uid for older/dev links).
async function resolveUserId(shareId: string): Promise<string> {
  try {
    const sc = await getDoc(doc(db, "shareCards", shareId));
    if (sc.exists()) return (sc.get("userId") as string) || shareId;
  } catch {
    /* ignore */
  }
  return shareId;
}

async function getDisplayName(userId: string): Promise<string> {
  try {
    const ds = await getDoc(doc(db, "users", userId));
    if (ds.exists()) {
      const d = ds.data();
      const name =
        d.username ||
        (d.firstName && d.lastName ? `${d.firstName} ${d.lastName}` : "") ||
        d.name ||
        d.displayName;
      if (name) return String(name);
    }
  } catch {
    /* ignore */
  }
  return "";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;
  const base = await getBaseUrl();
  const ogImage = `${base}/api/share/og?share=${encodeURIComponent(shareId)}`;
  const userId = await resolveUserId(shareId);
  const raw = await getDisplayName(userId);
  const name = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
  const title = name
    ? `${name}'s PickEm Paintball team`
    : "PickEm Paintball team";
  const description =
    "Check out my fantasy paintball squad — build your own team and play free at PickEm Paintball.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${base}/t/${shareId}`,
      type: "website",
      images: [{ url: ogImage, width: 1080, height: 1920 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const ogImage = `/api/share/og?share=${encodeURIComponent(shareId)}`;

  return (
    <div className="min-h-screen w-full bg-[#0c0c0c] flex flex-col items-center px-4 py-8 gap-6 text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-dark.svg" alt="PickEm Paintball" className="h-10" />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ogImage}
        alt="Fantasy paintball team card"
        className="w-full max-w-[420px] rounded-2xl border border-white/10"
      />

      <a
        href="/dashboard"
        className="bg-[#00f976] hover:opacity-90 text-black font-black text-sm uppercase tracking-widest rounded-lg px-8 py-4"
      >
        Build your own team
      </a>

      <p className="text-white/40 text-[11px] uppercase tracking-widest font-bold text-center">
        Free to play fantasy paintball · pickempaintball.com
      </p>
    </div>
  );
}
