import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { addComment, askMini, clearDone, deleteCard, onMini, readBoard, saveCard, saveColumns } from "@/src/lib/admin/todo";

export const dynamic = "force-dynamic";

/** The mini's answer, passed straight back (a panel off the mini has no board of its own: see onMini). */
async function fromMini(init?: RequestInit) {
  const r = await askMini(init);
  return new NextResponse(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
}

/** The TODO board: stages, work streams and every card. */
export async function GET() {
  const blocked = adminGate();
  if (blocked) return blocked;
  if (!onMini()) return fromMini();
  return NextResponse.json(readBoard());
}

/**
 * POST { action, ... } → the whole board back
 *   card     {card}            add a card (no id) or change some of its fields (move, archive, checklist …)
 *   delete   {id}              delete a card (the backup before this save keeps it)
 *   clear-done                 archive every card in Done
 *   comment  {id, text}        add a comment to a card
 *   columns  {group, columns}  replace the stage or work stream columns
 */
export async function POST(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  if (!onMini()) return fromMini({ method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text() });
  const b = await request.json();
  try {
    if (b.action === "card") return NextResponse.json(saveCard(b.card ?? {}));
    if (b.action === "clear-done") return NextResponse.json(clearDone());
    if (b.action === "delete") return NextResponse.json(deleteCard(String(b.id)));
    if (b.action === "comment") {
      if (!String(b.text ?? "").trim()) throw new Error("Empty comment");
      return NextResponse.json(addComment(String(b.id), String(b.text)));
    }
    if (b.action === "columns") {
      if (b.group !== "stages" && b.group !== "streams") throw new Error("Unknown column group");
      return NextResponse.json(saveColumns(b.group, Array.isArray(b.columns) ? b.columns : []));
    }
    throw new Error("Unknown action");
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
