"use client";

import { useState } from "react";
import { primaryButton, sectionLabel, type LibraryItem, type TagGroup, type TagList } from "./types";

const GROUPS: { group: TagGroup; title: string; keyHint: string; labelHint: string }[] = [
  { group: "post_types", title: "Post types", keyHint: "Slack word", labelHint: "Post type name" },
  { group: "phases", title: "Phases", keyHint: "Slack word", labelHint: "Phase name" },
  { group: "style", title: "Style", keyHint: "Tag", labelHint: "What it means" },
];

const GRID = "120px minmax(160px,1fr) 56px 220px";

/**
 * The tag list, for James to review and sign off. Each row: the short word (what he types in Slack),
 * what it means, how many posts use it, and edit / merge / delete. Edits apply to every post.
 */
export default function TagListEditor({
  tags,
  items,
  onChanged,
}: {
  tags: TagList;
  items: LibraryItem[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<{ group: TagGroup; key: string; newKey: string; label: string } | null>(null);
  const [merging, setMerging] = useState<{ group: TagGroup; key: string } | null>(null);
  const [adding, setAdding] = useState<{ group: TagGroup; key: string; label: string } | null>(null);

  const call = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMessage(data.error ?? "Could not save");
    setMessage(data.changed ? `Done — ${data.changed} post images updated.` : "Done.");
    setEditing(null);
    setMerging(null);
    setAdding(null);
    onChanged();
  };

  const used = (group: TagGroup, value: string) =>
    items.filter((i) => (group === "post_types" ? i.postTypes : group === "phases" ? i.phases : i.style).includes(value))
      .length;

  // Style words on posts that aren't in the list yet (typed in Slack): add them, merge them, or remove them.
  const newWords = Array.from(new Set(items.flatMap((i) => i.style))).filter((w) => !(w in tags.style));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-5 py-6">
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white dark:bg-[#0d0d0d] p-5">
        <div className="flex-1">
          <div className="text-xs font-black uppercase tracking-widest">
            {tags.signed_off ? `Signed off ${tags.signed_off_at ?? ""}` : "Not signed off yet"}
          </div>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-white/50">
            {tags.signed_off
              ? "New words typed in Slack are kept on the image but show as “new” until you add them here."
              : "Check each list, fix what's wrong, then sign off. After that, new words need your OK."}
          </p>
        </div>
        {!tags.signed_off && (
          <button
            className={primaryButton}
            disabled={busy}
            onClick={() => call({ action: "signoff" }, "Sign off the tag list as it is now?")}
          >
            Sign off tag list
          </button>
        )}
      </div>

      {message && <div className="text-[11px] font-bold text-green-600 dark:text-green-400">{message}</div>}

      {GROUPS.map(({ group, title, keyHint, labelHint }) => {
        const list = tags[group];
        const stored = (k: string) => (group === "style" ? k : list[k]);
        return (
          <section key={group} className="rounded-xl bg-white dark:bg-[#0d0d0d] p-5">
            <div className="mb-3 flex items-center">
              <h2 className="flex-1 text-xs font-black uppercase tracking-widest">{title}</h2>
              <button className="text-[10px] font-bold underline" onClick={() => setAdding({ group, key: "", label: "" })}>
                + Add
              </button>
            </div>
            <div
              className={sectionLabel}
              style={{ display: "grid", gridTemplateColumns: GRID, gap: "12px", padding: "6px 0" }}
            >
              <div>{keyHint}</div>
              <div>{labelHint}</div>
              <div>Posts</div>
              <div />
            </div>
            {adding?.group === group && (
              <div style={{ display: "grid", gridTemplateColumns: GRID, gap: "12px", padding: "6px 0" }}>
                <input
                  className="rounded border border-gray-200 dark:border-white/10 bg-transparent px-2 py-1 text-[11px]"
                  value={adding.key}
                  placeholder={keyHint}
                  onChange={(e) => setAdding({ ...adding, key: e.target.value })}
                />
                <input
                  className="rounded border border-gray-200 dark:border-white/10 bg-transparent px-2 py-1 text-[11px]"
                  value={adding.label}
                  placeholder={labelHint}
                  onChange={(e) => setAdding({ ...adding, label: e.target.value })}
                />
                <div />
                <div className="flex gap-2 text-[10px] font-bold">
                  <button disabled={busy} onClick={() => call({ action: "add", group, key: adding.key, label: adding.label })}>
                    Add
                  </button>
                  <button className="text-gray-400" onClick={() => setAdding(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {Object.entries(list).map(([key, label]) => {
              const isEditing = editing?.group === group && editing.key === key;
              const isMerging = merging?.group === group && merging.key === key;
              const count = used(group, stored(key));
              return (
                <div
                  key={key}
                  className="items-center border-t border-gray-100 dark:border-white/5 text-[11px]"
                  style={{ display: "grid", gridTemplateColumns: GRID, gap: "12px", padding: "8px 0" }}
                >
                  {isEditing ? (
                    <>
                      <input
                        className="rounded border border-gray-200 dark:border-white/10 bg-transparent px-2 py-1"
                        value={editing.newKey}
                        onChange={(e) => setEditing({ ...editing, newKey: e.target.value })}
                      />
                      <input
                        className="rounded border border-gray-200 dark:border-white/10 bg-transparent px-2 py-1"
                        value={editing.label}
                        onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                      />
                    </>
                  ) : (
                    <>
                      <div className="font-bold">{key}</div>
                      <div className="text-gray-500 dark:text-white/50">{label}</div>
                    </>
                  )}
                  <div className={count ? "" : "text-gray-300 dark:text-white/25"}>{count}</div>
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                    {isEditing ? (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            call({ action: "edit", group, key, newKey: editing.newKey, label: editing.label })
                          }
                        >
                          Save
                        </button>
                        <button className="text-gray-400" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </>
                    ) : isMerging ? (
                      <>
                        <select
                          className="rounded border border-gray-200 dark:border-white/10 bg-transparent px-1 py-0.5"
                          defaultValue=""
                          onChange={(e) =>
                            e.target.value &&
                            call(
                              { action: "merge", group, key, to: e.target.value },
                              `Merge “${key}” into “${e.target.value}” on every post?`,
                            )
                          }
                        >
                          <option value="">Merge into…</option>
                          {Object.keys(list)
                            .filter((k) => k !== key)
                            .map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                        </select>
                        <button className="text-gray-400" onClick={() => setMerging(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditing({ group, key, newKey: key, label })}>Edit</button>
                        <button onClick={() => setMerging({ group, key })}>Merge</button>
                        <button
                          className="text-red-400"
                          disabled={busy}
                          onClick={() =>
                            call(
                              { action: "delete", group, key },
                              count ? `Delete “${key}”? It comes off ${count} posts.` : `Delete “${key}”?`,
                            )
                          }
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {group === "style" && newWords.length > 0 && (
              <div className="mt-4">
                <div className={`${sectionLabel} mb-2`}>New words on posts, not in the list</div>
                {newWords.map((w) => (
                  <div
                    key={w}
                    className="items-center border-t border-gray-100 dark:border-white/5 text-[11px]"
                    style={{ display: "grid", gridTemplateColumns: GRID, gap: "12px", padding: "8px 0" }}
                  >
                    <div className="font-bold text-yellow-600 dark:text-yellow-400">{w}</div>
                    <div />
                    <div>{used("style", w)}</div>
                    <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                      <button disabled={busy} onClick={() => call({ action: "add", group: "style", key: w, label: w })}>
                        Add to list
                      </button>
                      <select
                        className="rounded border border-gray-200 dark:border-white/10 bg-transparent px-1 py-0.5"
                        defaultValue=""
                        onChange={(e) =>
                          e.target.value &&
                          call(
                            { action: "merge", group: "style", key: w, to: e.target.value },
                            `Replace “${w}” with “${e.target.value}” on every post?`,
                          )
                        }
                      >
                        <option value="">Replace with…</option>
                        {Object.keys(tags.style).map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
