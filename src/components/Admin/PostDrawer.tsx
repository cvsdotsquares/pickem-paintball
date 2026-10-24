"use client";

import { useEffect, useState } from "react";
import { IoMdClose } from "react-icons/io";
import { ReelPlayer, StudyDetails, useStudy } from "./ReelStudy";
import { imageUrl, isVideo, pill, primaryButton, sectionLabel, type LibraryItem, type TagList } from "./types";

/** One post (one image) up close: its caption, its tags to fix or confirm, and its carousel siblings if any. */
export default function PostDrawer({
  item,
  tags,
  onClose,
  onSaved,
  onOpenFile,
}: {
  item: LibraryItem;
  tags: TagList;
  onClose: () => void;
  onSaved: (item: LibraryItem) => void;
  onOpenFile: (file: string) => void;
}) {
  const [postTypes, setPostTypes] = useState(item.postTypes);
  const [phases, setPhases] = useState(item.phases);
  const [style, setStyle] = useState(item.style);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(item.notes);
  const [notesState, setNotesState] = useState<"" | "saving" | "saved">("");

  // Reset the notes draft only when a different post opens (saving tags must not wipe an unsaved note).
  useEffect(() => {
    setNotes(item.notes);
    setNotesState("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
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

  const saveNotes = async () => {
    setNotesState("saving");
    setError("");
    const res = await fetch("/api/admin/library", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, notes }),
    });
    const data = await res.json();
    if (!res.ok) {
      setNotesState("");
      return setError(data.error ?? "Could not save the note");
    }
    setNotesState("saved");
    onSaved(data.item);
  };
  const notesChanged = notes.trim() !== item.notes;

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const typeLabels = Object.values(tags.post_types);
  const phaseLabels = Object.values(tags.phases);
  const styleKeys = Object.keys(tags.style);
  // Values on the post that aren't in the list (e.g. a new word typed in Slack) still show, marked "new".
  const extra = (have: string[], known: string[]) => have.filter((v) => !known.includes(v));
  const file = item.files[0];
  const isReel = item.kind === "reel";
  const study = useStudy(isReel ? item.study : "");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-white dark:bg-[#0d0d0d] md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex shrink-0 flex-col items-center justify-center bg-black p-4 md:w-1/2">
          {isReel ? (
            <ReelPlayer study={study} poster={imageUrl(item.source, file)} />
          ) : isVideo(file) ? (
            <video src={imageUrl(item.source, file)} controls className="max-h-[70vh] w-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl(item.source, file)} alt={item.title} className="max-h-[80vh] w-full object-contain" />
          )}
          {item.carousel.length > 1 && (
            <div className="mt-3 w-full">
              <div className="mb-1 text-center text-[9px] font-bold uppercase tracking-widest text-white/50">
                Slide {item.slide} of {item.carousel.length} — the other slides are separate posts
              </div>
              <div className="flex justify-center gap-1.5">
                {item.carousel.map((f, i) => (
                  <button
                    key={f}
                    onClick={() => onOpenFile(f)}
                    title={`Slide ${i + 1}`}
                    className={`h-14 w-11 overflow-hidden rounded border-2 bg-[#1a1a1a] ${
                      f === file ? "border-white" : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    {isVideo(f) ? (
                      <span className="text-[9px] text-white/60">{i + 1}</span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl(item.source, f, true)} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className={sectionLabel}>
                {item.source === "past" ? "Past post" : isReel ? "Inspiration · reel" : item.kind === "screenshot" ? "Inspiration · linked post" : "Inspiration"} · {item.date}
                {item.source === "past" && ` · ${item.event}`}
              </div>
              <div className="mt-1 text-sm font-black">{item.title || "(no headline)"}</div>
              <div className="flex gap-3">
                {item.link && (
                  <a href={item.link} target="_blank" rel="noreferrer" className="text-[10px] underline text-gray-400">
                    Open original
                  </a>
                )}
                {item.permalink && (
                  <a href={item.permalink} target="_blank" rel="noreferrer" className="text-[10px] underline text-gray-400">
                    Open in Slack
                  </a>
                )}
              </div>
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

          <div>
            <div className={`${sectionLabel} mb-2`}>Notes</div>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesState("");
              }}
              rows={3}
              placeholder={
                item.source === "inspo" ? "What you like about it — the idea, a detail, how we could use it" : "Your notes on this post"
              }
              className="w-full resize-y rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3 py-2 text-[11px] outline-none placeholder-gray-400 focus:border-gray-400 dark:placeholder-white/30 dark:focus:border-white/30"
            />
            <div className="mt-1 flex items-center gap-3">
              <button
                className="text-[10px] font-bold uppercase tracking-widest underline disabled:no-underline disabled:opacity-40"
                onClick={saveNotes}
                disabled={!notesChanged || notesState === "saving"}
              >
                {notesState === "saving" ? "Saving…" : "Save note"}
              </button>
              {notesState === "saved" && !notesChanged && (
                <span className="text-[10px] font-bold text-green-600 dark:text-green-400">Saved</span>
              )}
            </div>
          </div>

          {isReel && <StudyDetails study={study} />}

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
