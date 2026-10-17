"use client";

import Link from "next/link";
import { genUrl, type GraphicRow, type Preview } from "./generatorTypes";
import StagePill from "./StagePill";

/** The picture for one graphic: signed-off post, current round, the first option, or an empty frame. */
function Thumb({ p, big }: { p: Preview; big?: boolean }) {
  const img = p.images[0];
  return img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={genUrl(img, true)} alt="" className="aspect-[4/5] w-full rounded object-cover" />
  ) : (
    <div className={`flex ${big ? "aspect-[4/5]" : "h-8"} w-full items-center justify-center rounded border border-dashed border-gray-200 text-[9px] text-gray-300 dark:border-white/10 dark:text-white/25`}>
      Not made yet
    </div>
  );
}

/**
 * Every graphic in one post type, side by side, scrolling across (James, 17 Oct). Small on the board card
 * (the card itself is the link), bigger on the post-type page (each tile links to its graphic).
 */
export default function GraphicStrip({
  event,
  graphics,
  big,
  onStop,
}: {
  event: string;
  graphics: GraphicRow[];
  big?: boolean;
  onStop: (g: GraphicRow) => void;
}) {
  return (
    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
      {graphics.map((g) => {
        const tile = (
          <div className={`flex shrink-0 snap-start flex-col gap-1 ${big ? "w-44" : "w-24"}`}>
            <div className="relative">
              <Thumb p={g.preview} big={big} />
              {g.running && (
                <button
                  onClick={(e) => {
                    e.preventDefault(); // tiles and cards are links
                    e.stopPropagation();
                    onStop(g);
                  }}
                  className="absolute right-1 top-1 rounded bg-white px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-gray-700 shadow hover:bg-gray-100"
                >
                  Stop
                </button>
              )}
            </div>
            <div className={`truncate font-bold ${big ? "text-[11px]" : "text-[9px]"}`} title={g.display}>
              {g.display}
            </div>
            <div className="origin-left scale-90">
              <StagePill stage={g.status.stage} running={g.running} failed={g.failed} />
            </div>
          </div>
        );
        return big ? (
          <Link key={g.key} href={`/admin/generator/${event}/${g.base}/${g.key}`} className="hover:opacity-80">
            {tile}
          </Link>
        ) : (
          <div key={g.key}>{tile}</div>
        );
      })}
    </div>
  );
}
