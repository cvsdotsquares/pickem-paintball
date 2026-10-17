import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { addComment, deleteCard, readBoard, saveCard, saveColumns } from "@/src/lib/admin/todo";

export const dynamic = "force-dynamic";

/** The TODO board: stages, work streams and every card. */
export async function GET() {
  const blocked = adminGate();
  if (blocked) return blocked;
  return NextResponse.json(readBoard());
}

/**
 * POST { action, ... } → the whole board back
 *   card     {card}            add a card (no id) or change some of its fields (move, archive, checklist …)
 *   delete   {id}              delete a card (the backup before this save keeps it)
 *   comment  {id, text}        add a comment to a card
 *   columns  {group, columns}  replace the stage or work stream columns
 */
export async function POST(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const b = await request.json();
  try {
    if (b.action === "card") return NextResponse.json(saveCard(b.card ?? {}));
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
