/**
 * FAQ body from Firestore uses inline Tailwind (e.g. h3 text-orange-300, p text-base on bg-slate-900).
 * We insert the kill-types block with the same classes so it slots in visually.
 */

const KILL_TYPES_SENTINEL = "What are the different types of kills";

/** Appended after the “missing stats” answer; matches your cmsPages `faq` HTML patterns. */
const FAQ_KILL_TYPES_HTML = `
<h3 class="mt-4 font-bold text-orange-300">Q: What are the different types of kills?</h3>
<p class="text-base">A: The breakdown below explains how kills are classified.</p>
<div class="mt-3 ml-4 border-l-2 border-orange-500/35 pl-4 sm:ml-6 sm:pl-5">
<h3 class="mt-4 font-bold text-orange-300 first:mt-0">CONFIRMED KILL</h3>
<p class="text-base">A: Any kill that can confidently be attributed to a specific player or players.</p>
<h3 class="mt-4 font-bold text-orange-300">BREAKSHOOTING KILL</h3>
<p class="text-base">A: Any kill a player gets off the break.</p>
<h3 class="mt-4 font-bold text-orange-300">GUNFIGHT KILL</h3>
<p class="text-base">A: Any kill where two stationary players are shooting at each other and they don&apos;t trade.</p>
<h3 class="mt-4 font-bold text-orange-300">MOVEMENT KILL</h3>
<p class="text-base">A: Any kill that is the result of a move.</p>
<p class="text-base">A: Examples include:</p>
<ul class="mt-2 list-disc space-y-1 pl-5 text-base">
<li>A player makes a move and shoots a player who&apos;s unaware of their new position.</li>
<li>A player shoots another player while running and gunning (not on the break).</li>
<li>A player bunkers another player and survives.</li>
</ul>
<h3 class="mt-4 font-bold text-orange-300">TRADES</h3>
<p class="text-base">A: Where a player sacrifices their own body to shoot another player.</p>
<ul class="mt-2 list-disc space-y-1 pl-5 text-base">
<li>A mutual trade where each player shoots each other.</li>
<li>A player makes a play to shoot another player, getting shot by a third player.</li>
</ul>
<h3 class="mt-4 font-bold text-orange-300">ZONE COVERAGE KILLS</h3>
<p class="text-base">A: A kill where an individual shoots a moving player (not as a result of a recent move).</p>
<h3 class="mt-4 font-bold text-orange-300">PRESSURE KILLS</h3>
<p class="text-base">A: A kill where a player, or players, shoot another player out of their spot that is not the result of a gunfight or movement. Examples include pinches, bounce shots etc.</p>
<h3 class="mt-4 font-bold text-orange-300">SHARED KILLS</h3>
<p class="text-base">A: Kills can be shared if 2 or more players are shooting at an opponent simultaneously; in this instance, each player will be awarded a half kill (analogous to half sacks in American Football).</p>
<p class="text-base">A: Shared kills typically occur:</p>
<ul class="mt-2 list-disc space-y-1 pl-5 text-base">
<li>On the break</li>
<li>As part of a trade with an additional body covering the zone</li>
<li>A pressure kill at the end of the point</li>
</ul>
</div>
`.trim();

export function transformFaqPageBody(html: string): string {
  if (!html) return html;

  const withGrammar = html.replace(
    /What happens if player stats are missing\?/gi,
    "What happens if players' stats are missing?",
  );

  if (withGrammar.includes(KILL_TYPES_SENTINEL)) {
    return withGrammar;
  }

  const lower = withGrammar.toLowerCase();
  const needle = "all players equally.";
  const idx = lower.indexOf(needle);
  if (idx === -1) {
    return withGrammar;
  }

  const closeIdx = withGrammar.indexOf("</p>", idx);
  if (closeIdx === -1) {
    return withGrammar;
  }

  const insertAt = closeIdx + "</p>".length;
  return withGrammar.slice(0, insertAt) + FAQ_KILL_TYPES_HTML + withGrammar.slice(insertAt);
}
