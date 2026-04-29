/**
 * FAQ body from Firestore uses inline Tailwind (e.g. h3 accent classes, p text-base on bg-slate-900).
 * We insert the kill-types block with the same classes so it slots in visually.
 */

const KILL_TYPES_SENTINEL = "What are the different types of kills";
const ROSTER_UPDATES_SENTINEL = "Roster Confirmation &amp; Updates";

const FAQ_ROSTER_UPDATES_HTML = `
<h3 class="mt-4 font-bold text-black dark:text-white">Q: Roster Confirmation &amp; Updates</h3>
<p class="text-base">Pick&apos;Em relies on knowing who is playing so you can make your picks. Currently, there is no official NXL requirement for teams to release or confirm their rosters until the day before the event, when they check in.</p>
<h4 class="mt-4 font-bold text-black dark:text-white">Confirming Rosters</h4>
<p class="text-base">To ensure that we have the right players available for selection, with enough time for everyone to make their picks, we do our best to confirm rosters. We do this using three methods:</p>
<ol class="mt-2 list-decimal space-y-1 pl-5 text-base">
<li>~1 week out, we contact each team directly and ask for up-to-date roster information and update player statuses based on their feedback.</li>
<li>Monitor news and feedback from users on any confirmed roster development.</li>
<li>Day before the event, we check the official team rosters on pbleagues and update statuses to match.</li>
</ol>
<h4 class="mt-4 font-bold text-black dark:text-white">How do we see roster updates?</h4>
<p class="text-base">With this information, we can give each player a status displayed both in the Pick&apos;Em view and in the Roster Updates table on the Dashboard.</p>
<p class="text-base">If the status of any player you&apos;ve picked changes, we&apos;ll send you a notification — whether they&apos;re newly Confirmed, flipped to Injured / Questionable, or pulled Out / Dropped.</p>
<h4 class="mt-4 font-bold text-black dark:text-white">What does each player status mean</h4>
<ul class="mt-2 list-disc space-y-1 pl-5 text-base">
<li><strong>Confirmed</strong> — playing.</li>
<li><strong>Addition</strong> — new addition to the roster.</li>
<li><strong>Questionable</strong> — playing status uncertain either due to no response from the team, or uncertainty on their end.</li>
<li><strong>Injured</strong> — carrying an injury that may affect availability.</li>
<li><strong>Out</strong> — confirmed not playing this event.</li>
<li><strong>Dropped</strong> — removed from the roster.</li>
<li><strong>Unconfirmed</strong> — playing status uncertain either due to no response from the team, or uncertainty on their end.</li>
</ul>
<h4 class="mt-4 font-bold text-black dark:text-white">What happens to my picks if a player is Out when picks lock?</h4>
<p class="text-base">Picks freeze at the team lock deadline. If a player you&apos;ve picked ends up Out or Dropped, the slot stays in your lineup but scores zero kills. Because of this, we strongly encourage you to check the Roster Updates section before picks lock and swap out any affected picks while you still can.</p>
<h4 class="mt-4 font-bold text-black dark:text-white">Mistakes</h4>
<p class="text-base">While we make every effort to ensure that the roster updates are accurate, there&apos;s no requirement from the NXL to share this information. We do our best to collect accurate and timely information, but there is a chance that we may miss some. In those instances we apologise and welcome feedback to get better every event!</p>
`.trim();

/** Appended after the “missing stats” answer; matches your cmsPages `faq` HTML patterns. */
const FAQ_KILL_TYPES_HTML = `
<h3 class="mt-4 font-bold text-black dark:text-white">Q: What are the different types of kills?</h3>
<p class="text-base">The breakdown below explains how kills are classified.</p>
<div class="mt-3 ml-4 border-l-2 border-black/20 pl-4 dark:border-white/25 sm:ml-6 sm:pl-5">
<h3 class="mt-4 font-bold text-black first:mt-0 dark:text-white">CONFIRMED KILL</h3>
<p class="text-base">Any kill that can confidently be attributed to a specific player or players.</p>
<h3 class="mt-4 font-bold text-black dark:text-white">BREAKSHOOTING KILL</h3>
<p class="text-base">Any kill a player gets off the break.</p>
<h3 class="mt-4 font-bold text-black dark:text-white">GUNFIGHT KILL</h3>
<p class="text-base">Any kill where two stationary players are shooting at each other and they don&apos;t trade.</p>
<h3 class="mt-4 font-bold text-black dark:text-white">MOVEMENT KILL</h3>
<p class="text-base">Any kill that is the result of a move.</p>
<p class="text-base">Examples include:</p>
<ul class="mt-2 list-disc space-y-1 pl-5 text-base">
<li>A player makes a move and shoots a player who&apos;s unaware of their new position.</li>
<li>A player shoots another player while running and gunning (not on the break).</li>
<li>A player bunkers another player and survives.</li>
</ul>
<h3 class="mt-4 font-bold text-black dark:text-white">TRADES</h3>
<p class="text-base">Where a player sacrifices their own body to shoot another player.</p>
<ul class="mt-2 list-disc space-y-1 pl-5 text-base">
<li>A mutual trade where each player shoots each other.</li>
<li>A player makes a play to shoot another player, getting shot by a third player.</li>
</ul>
<h3 class="mt-4 font-bold text-black dark:text-white">ZONE COVERAGE KILLS</h3>
<p class="text-base">A kill where an individual shoots a moving player (not as a result of a recent move).</p>
<h3 class="mt-4 font-bold text-black dark:text-white">PRESSURE KILLS</h3>
<p class="text-base">A kill where a player, or players, shoot another player out of their spot that is not the result of a gunfight or movement. Examples include pinches, bounce shots etc.</p>
<h3 class="mt-4 font-bold text-black dark:text-white">SHARED KILLS</h3>
<p class="text-base">Kills can be shared if 2 or more players are shooting at an opponent simultaneously; in this instance, each player will be awarded a half kill (analogous to half sacks in American Football).</p>
<p class="text-base">Shared kills typically occur:</p>
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

  let result = withGrammar;

  if (!result.includes(KILL_TYPES_SENTINEL)) {
    const lower = result.toLowerCase();
    const needle = "all players equally.";
    const idx = lower.indexOf(needle);
    if (idx !== -1) {
      const closeIdx = result.indexOf("</p>", idx);
      if (closeIdx !== -1) {
        const insertAt = closeIdx + "</p>".length;
        result = result.slice(0, insertAt) + FAQ_KILL_TYPES_HTML + result.slice(insertAt);
      }
    }
  }

  if (!result.includes(ROSTER_UPDATES_SENTINEL)) {
    const lower = result.toLowerCase();
    const anchor = "when can i make changes to my picks";
    const anchorIdx = lower.indexOf(anchor);
    if (anchorIdx !== -1) {
      const tagOpen = result.lastIndexOf("<", anchorIdx);
      if (tagOpen !== -1) {
        result = result.slice(0, tagOpen) + FAQ_ROSTER_UPDATES_HTML + result.slice(tagOpen);
      } else {
        result = result + FAQ_ROSTER_UPDATES_HTML;
      }
    } else {
      result = result + FAQ_ROSTER_UPDATES_HTML;
    }
  }

  return result;
}

/**
 * Dashboard FAQ: CMS HTML targets dark slate + white body copy. Remap to light page (black text, no navy panels).
 */
function transformFaqHtmlForDashboardLight(html: string): string {
  if (!html) return html;
  let s = html;
  s = s.replace(/\bbg-slate-950\b/g, "bg-white dark:bg-stone-950");
  s = s.replace(/\bbg-slate-900\b/g, "bg-white dark:bg-stone-900");
  s = s.replace(/\bbg-slate-800\b/g, "bg-white dark:bg-stone-900");
  s = s.replace(/\btext-white\/90\b/g, "text-gray-800 dark:text-stone-200");
  s = s.replace(/\btext-white\/80\b/g, "text-gray-700 dark:text-stone-300");
  s = s.replace(/\btext-white\/70\b/g, "text-gray-600 dark:text-stone-400");
  s = s.replace(/\btext-white\/60\b/g, "text-gray-600 dark:text-stone-400");
  s = s.replace(/\btext-white\b/g, "text-gray-900 dark:text-stone-100");
  /** Accent headings / Q lines: neutral black (white in dark mode) — avoids brand token / safelist issues. */
  const faqAccent = "text-black dark:text-white";
  const faqBorder = "border-black/20 dark:border-white/25";
  s = s.replace(/\btext-orange-600 dark:text-orange-400\b/g, faqAccent);
  s = s.replace(/\btext-orange-300\b/g, faqAccent);
  s = s.replace(/\btext-orange-600\b/g, faqAccent);
  s = s.replace(/\btext-orange-400\b/g, faqAccent);
  s = s.replace(/\bborder-orange-500\/35\b/g, faqBorder);
  s = s.replace(/\btext-pickem-navy\b/g, faqAccent);
  s = s.replace(/\bborder-pickem-navy\/35\b/g, faqBorder);
  s = s.replace(/\btext-pickem-green\b/g, faqAccent);
  s = s.replace(/\bborder-pickem-green\/35\b/g, faqBorder);
  return s;
}

/** FAQ body for `/dashboard/faq`: grammar + kill-types + light-theme class remap. */
export function transformFaqPageBodyForDashboard(html: string): string {
  return transformFaqHtmlForDashboardLight(transformFaqPageBody(html));
}
