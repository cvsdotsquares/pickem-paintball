// Client-side copies of the shapes in src/lib/admin/library.ts (that module reads the disk, so it can't be imported here).

export type Source = "past" | "inspo";
export type TagGroup = "post_types" | "phases" | "style";

export type TagList = {
  signed_off?: boolean;
  signed_off_at?: string;
  post_types: Record<string, string>;
  phases: Record<string, string>;
  style: Record<string, string>;
};

export type LibraryItem = {
  id: string;
  source: Source;
  files: string[];
  carousel: string[];
  slide: number;
  date: string;
  event: string;
  postTypes: string[];
  phases: string[];
  style: string[];
  tagsFrom: string;
  title: string;
  caption: string;
  permalink: string;
  notes: string;
  kind: "image" | "reel" | "screenshot";
  link: string;
  study: string;
};

export type Study = { videos: string[]; strips: string[]; breakdown: string };

export const imageUrl = (source: Source, file: string, thumb = false) =>
  `/api/admin/image?source=${source}&file=${encodeURIComponent(file)}${thumb ? "&thumb=1" : ""}`;

export const isVideo = (file: string) => /\.(mp4|mov)$/i.test(file);

export const pill = (active: boolean) =>
  `rounded-full border px-3 py-1 text-[10px] font-bold transition-colors ${
    active
      ? "border-gray-800 dark:border-white/60 bg-gray-900 dark:bg-white text-white dark:text-black"
      : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/50 hover:border-gray-400 dark:hover:border-white/30"
  }`;

export const primaryButton =
  "rounded-lg bg-[#1a3c6e] px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-[#1a3c6e]/90 disabled:opacity-40";

export const sectionLabel = "text-[8px] font-black uppercase tracking-widest text-gray-400 dark:text-white/40";
