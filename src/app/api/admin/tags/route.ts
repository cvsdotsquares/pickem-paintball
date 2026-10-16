import { NextResponse } from "next/server";
import { adminGate } from "@/src/lib/admin/gate";
import { readTags, replaceTagEverywhere, writeTags, type TagGroup } from "@/src/lib/admin/library";

export const dynamic = "force-dynamic";

const GROUPS: TagGroup[] = ["post_types", "phases", "style"];

/**
 * Edit the tag list. Body: { action, group, key, label?, to? }
 *   add     — new tag (key = short word, label = what it means / full post-type name)
 *   edit    — change the short word and/or label; a post-type/phase label change is applied to every post
 *   merge   — fold `key` into `to` in every post, then remove `key`
 *   delete  — remove the tag from the list and from every post
 *   signoff — James signs off the whole list
 * Post types and phases are stored on posts by label; style tags by their short word.
 */
export async function POST(request: Request) {
  const blocked = adminGate();
  if (blocked) return blocked;
  const b = await request.json();
  const tags = readTags();
  const fail = (error: string) => NextResponse.json({ error }, { status: 400 });

  if (b.action === "signoff") {
    tags.signed_off = true;
    tags.signed_off_at = new Date().toISOString().slice(0, 10);
    writeTags(tags);
    return NextResponse.json({ tags, changed: 0 });
  }

  const group = b.group as TagGroup;
  if (!GROUPS.includes(group)) return fail("Unknown tag group");
  const list = tags[group];
  const key = String(b.key ?? "").trim().toLowerCase();
  const stored = (k: string) => (group === "style" ? k : list[k]); // value as written on posts
  let changed = 0;

  if (b.action === "add") {
    if (!key || list[key]) return fail("That tag already exists or is empty");
    list[key] = String(b.label ?? "").trim() || key;
  } else if (!(key in list) && !(group === "style" && (b.action === "merge" || b.action === "delete"))) {
    // (a "new" style word typed in Slack is on posts but not in the list yet: it can still be merged or removed)
    return fail("Tag not found");
  } else if (b.action === "edit") {
    const newKey = String(b.newKey ?? key).trim().toLowerCase();
    const newLabel = String(b.label ?? list[key]).trim();
    if (newKey !== key && list[newKey]) return fail("That short word is already used");
    const before = stored(key);
    const entries = Object.entries(list).map(([k, v]) => (k === key ? [newKey, newLabel] : [k, v]));
    tags[group] = Object.fromEntries(entries);
    const after = group === "style" ? newKey : newLabel;
    if (before !== after) changed = replaceTagEverywhere(group, before, after);
  } else if (b.action === "merge") {
    const to = String(b.to ?? "").trim().toLowerCase();
    if (!(to in list) || to === key) return fail("Pick a different tag to merge into");
    changed = replaceTagEverywhere(group, stored(key), stored(to));
    delete list[key];
  } else if (b.action === "delete") {
    changed = replaceTagEverywhere(group, stored(key), null);
    delete list[key];
  } else {
    return fail("Unknown action");
  }

  writeTags(tags);
  return NextResponse.json({ tags, changed });
}
