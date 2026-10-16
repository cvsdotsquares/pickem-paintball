"use client";

import { useEffect, useState } from "react";
import { IoMdClose } from "react-icons/io";
import { imageUrl, isVideo, pill, primaryButton, sectionLabel, type LibraryItem, type TagList } from "./types";

/** One post up close: every slide, its caption, and its tags to fix or confirm. */
export default function PostDrawer({
  item,
  tags,
  onClose,
  onSaved,
}: {
  item: LibraryItem;
  tags: TagList;
  onClose: () => void;
  onSaved: (item: LibraryItem) => void;
}) {
  const [slide, setSlide] = useState(0);
  const [postTypes, setPostTypes] = useState(item.postTypes);
  const [phases, setPhases] = useState(item.phases);
  const [style, setStyle] = useState(item.style);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSlide(0);
    setPostTypes(item.postTypes);
    setPhases(item.phases);
    setStyle(item.style);
    setError("");
  }, [item]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const changed =
    postTypes.join() !== item.postTypes.join() || phases.join() !== item.phases.join() || style.join() !== item.style.join();

  const save = async () => {
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/library", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, postTypes, phases, style }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) setError(data.error ?? "Could not save");
    else onSaved(data.item);
  };

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const typeLabels = Object.values(tags.post_types);
  const phaseLabels = Object.values(tags.phases);
  const styleKeys = Object.keys(tags.style);
  // Values on the post that aren't in the list (e.g. a new word typed in Slack) still show, marked "new".
  const extra = (have: string[], known: string[]) => have.filter((v) => !known.includes(v));
  const file = item.files[slide];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-white dark:bg-[#0d0d0d] md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex shrink-0 flex-col items-center justify-center bg-black p-4 md:w-1/2">
          {isVideo(file) ? (
            <video src={imageUrl(item.source, file)} controls className="max-h-[70vh] w-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl(item.source, file)} alt={item.title} className="max-h-[80vh] w-full object-contain" />
          )}
          {item.files.length > 1 && (
            <div className="mt-3 flex gap-1">
              {item.files.map((f, i) => (
                <button
                  key={f}
                  onClick={() => setSlide(i)}
                  className={`h-6 min-w-6 rounded px-2 text-[10px] font-bold ${
                    i === slide ? "bg-white text-black" : "bg-white/10 text-white/60"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className={sectionLabel}>
                {item.source === "past" ? "Past post" : "Inspiration"} · {item.date} · {item.event}
              </div>
              <div className="mt-1 text-sm font-black">{item.title || "(no headline)"}</div>
              {item.permalink && (
                <a href={item.permalink} target="_blank" rel="noreferrer" className="text-[10px] underline text-gray-400">
                  Open in Slack
                </a>
              )}
            </div>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900 dark:hover:text-white">
              <IoMdClose size={20} />
            </button>
          </div>

          <div
            className={`rounded-lg px-3 py-2 text-[10px] font-bold ${
              item.tagsFrom === "James"
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : "bg-yellow-400/10 text-yellow-700 dark:text-yellow-400"
            }`}
          >
            {item.tagsFrom === "James" ? "Tags confirmed by you" : "Tags suggested by Claude — fix or confirm"}
          </div>

          {[
            { label: "Post type", options: typeLabels, have: postTypes, set: setPostTypes },
            { label: "Phase", options: phaseLabels, have: phases, set: setPhases },
            { label: "Style", options: styleKeys, have: style, set: setStyle },
          ].map((g) => (
            <div key={g.label}>
              <div className={`${sectionLabel} mb-2`}>{g.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {[...g.options, ...extra(g.have, g.options)].map((v) => (
                  <button key={v} className={pill(g.have.includes(v))} onClick={() => toggle(g.have, g.set, v)}>
                    {v}
                    {!g.options.includes(v) && <span className="ml-1 text-yellow-500">new</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button className={primaryButton} onClick={save} disabled={saving || (!changed && item.tagsFrom === "James")}>
              {saving ? "Saving…" : changed ? "Save tags" : item.tagsFrom === "James" ? "Saved" : "Confirm tags"}
            </button>
            {error && <span className="text-[10px] text-red-400">{error}</span>}
          </div>

          {item.caption && (
            <div>
              <div className={`${sectionLabel} mb-2`}>Caption</div>
              <p className="whitespace-pre-wrap text-[11px] text-gray-500 dark:text-white/50">{item.caption}</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
