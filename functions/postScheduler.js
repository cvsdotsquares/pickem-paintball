/**
 * Post Scheduler — sends approved social posts to Instagram + the Facebook Page at their time.
 *
 * The admin panel (James's Mac) does the slow part on Approve: it uploads each slide to the
 * Pick'Em Page as a hidden (unpublished) photo and writes a `scheduledPosts/{id}` doc:
 *
 *   status:      'approved'                 only approved posts are ever sent
 *   publishAt:   Timestamp                  when to send
 *   caption:     string                     same caption on both accounts
 *   fbPhotoIds:  [string]                   hidden Page photos, in slide order (1 = single, 2+ = carousel)
 *   title, event, type                      for the panel and the Slack message
 *
 * This job claims each due doc (status → 'sending') so two passes can never post it twice,
 * then posts Instagram first, Facebook second, and writes back 'posted' + links or 'failed' + why.
 * A doc stuck in 'sending' is never retried automatically — James decides (it may have half-posted).
 *
 * Holds: a post can wait for Data jobs (pickem-hub/scheduler/playbook.json job ids):
 *
 *   waitFor:      [string]                   optional; missing/empty = no hold
 *   waiting:      string                     courier only: comma-joined jobs still not passed
 *   waitingSince: Timestamp                  courier only: the first pass that held it
 *
 * Each job's latest run is `agentJobs/{event}__{job}` (written by the panel's jobResult action).
 * A job passes when its result is 'ok' and, unless it repeats 'once', it finished today (ET).
 * A due post with any job not passed is left 'approved' and marked waiting; it goes out on the
 * first pass after the last job passes (late is fine), and the claim clears waiting/waitingSince.
 * Contract: post-holds-contract.md (25 Oct 2026).
 *
 * Plan: pickem-hub/ideas/2026-10-17-scheduler-plan.md.
 */
const GRAPH = 'https://graph.facebook.com/v26.0/';

async function graph(method, path, params, token) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = GRAPH + path + (method === 'GET' ? `?${body}` : '');
  const res = await fetch(url, method === 'GET' ? {} : { method, body });
  const json = await res.json();
  if (json.error) throw new Error(`${path}: ${json.error.message}`);
  return json;
}

/** The hidden photo's largest image link — fetched at send time because the links expire. */
async function imageUrl(photoId, token) {
  const { images } = await graph('GET', photoId, { fields: 'images' }, token);
  return images[0].source;
}

/** Instagram waits until the container has fetched its image before it can be published. */
async function waitReady(containerId, token) {
  for (let i = 0; i < 20; i++) {
    const { status_code } = await graph('GET', containerId, { fields: 'status_code' }, token);
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR') throw new Error(`Instagram could not read the image (${containerId})`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Instagram took over a minute to process the image');
}

async function postInstagram(post, cfg) {
  const { igUserId, token } = cfg;
  const urls = await Promise.all(post.fbPhotoIds.map((id) => imageUrl(id, token)));
  let container;
  if (urls.length === 1) {
    container = (await graph('POST', `${igUserId}/media`, { image_url: urls[0], caption: post.caption }, token)).id;
  } else {
    const children = [];
    for (const url of urls) {
      const child = (await graph('POST', `${igUserId}/media`, { image_url: url, is_carousel_item: 'true' }, token)).id;
      await waitReady(child, token);
      children.push(child);
    }
    container = (
      await graph('POST', `${igUserId}/media`, {
        media_type: 'CAROUSEL', children: children.join(','), caption: post.caption,
      }, token)
    ).id;
  }
  await waitReady(container, token);
  const { id } = await graph('POST', `${igUserId}/media_publish`, { creation_id: container }, token);
  const { permalink } = await graph('GET', id, { fields: 'permalink' }, token);
  return { id, permalink };
}

async function postFacebook(post, cfg) {
  const { pageId, token } = cfg;
  const params = { message: post.caption };
  post.fbPhotoIds.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
  const { id } = await graph('POST', `${pageId}/feed`, params, token);
  return { id, permalink: `https://www.facebook.com/${id}` };
}

async function notifySlack(post, text, slackToken, channel) {
  if (!slackToken || !channel) return;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${slackToken}` },
    body: JSON.stringify({ channel, text }),
  }).catch((e) => console.warn('Slack message failed:', e.message));
}

const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Millis from a Firestore Timestamp, Date, ISO string or number (null if none). */
function millis(t) {
  if (t == null) return null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t instanceof Date) return t.getTime();
  const n = typeof t === 'number' ? t : Date.parse(t);
  return Number.isNaN(n) ? null : n;
}

/**
 * Which of the post's waitFor jobs have not passed yet. Pure, so it can be tested.
 * `jobDocs` = { jobId: agentJobs doc data, or null when the doc is missing }; `now` = millis.
 * Returns { waiting: [jobId] } — empty means the post may go.
 */
function holdState(post, jobDocs, now) {
  const today = ET_DAY.format(new Date(now));
  const waiting = (post.waitFor || []).filter((job) => {
    const j = jobDocs[job];
    if (!j || j.result !== 'ok') return true;
    if (j.repeat === 'once') return false;
    const done = millis(j.finishedAt);
    return done == null || ET_DAY.format(new Date(done)) !== today;   // a repeating job must have passed today (ET)
  });
  return { waiting };
}

/**
 * One pass: send every approved post whose time has come.
 * `cfg` = { db, Timestamp, FieldValue, token, pageId, igUserId, slackToken?, slackChannel? }.
 * Shared by the scheduled function and the local test runner (pickem-hub/scheduler/).
 */
async function runDue(cfg) {
  const { db, Timestamp, FieldValue } = cfg;
  // Only approved posts are read (a handful at most), and the time is checked here, so no
  // composite index is needed.
  const approved = await db.collection('scheduledPosts').where('status', '==', 'approved').get();
  const now = Timestamp.now().toMillis();
  // Only posts: the Schedule also holds agents' work and James's actions (kind 'work' / 'action'), never sent.
  const due = approved.docs.filter((d) => (d.get('kind') ?? 'post') === 'post' && d.get('publishAt') && d.get('publishAt').toMillis() <= now);

  for (const doc of due) {
    // Held? Read each job's latest run; any not passed → leave it approved, mark it waiting, move on.
    const waitFor = doc.get('waitFor') || [];
    if (waitFor.length) {
      const event = doc.get('event');
      const jobDocs = {};
      for (const job of waitFor) {
        const snap = await db.collection('agentJobs').doc(`${event}__${job}`).get();
        jobDocs[job] = snap.exists ? snap.data() : null;
      }
      const { waiting } = holdState({ waitFor }, jobDocs, now);
      if (waiting.length) {
        const mark = { waiting: waiting.join(',') };
        if (!doc.get('waitingSince')) mark.waitingSince = FieldValue.serverTimestamp();
        await doc.ref.update(mark);
        console.log(`⏳ Holding ${doc.id} (${event}): waiting for ${mark.waiting}`);
        continue;
      }
    }

    // Claim it, so an overlapping pass (or Post now) can't send it twice.
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (fresh.get('status') !== 'approved') return false;
      tx.update(doc.ref, {
        status: 'sending', sendingAt: FieldValue.serverTimestamp(),
        waiting: FieldValue.delete(), waitingSince: FieldValue.delete(),
      });
      return true;
    });
    if (!claimed) continue;

    const post = doc.data();
    const result = {};
    try {
      result.instagram = await postInstagram(post, cfg);
      result.facebook = await postFacebook(post, cfg);
      await doc.ref.update({ status: 'posted', postedAt: FieldValue.serverTimestamp(), result });
      console.log(`✅ Posted ${doc.id}`, result);
      await notifySlack(post, `✅ Posted *${post.title || doc.id}*\nInstagram: ${result.instagram.permalink}\nFacebook: ${result.facebook.permalink}`, cfg.slackToken, cfg.slackChannel);
    } catch (e) {
      // Keep whatever did go out, so James can see a half-post (e.g. Instagram yes, Facebook no).
      await doc.ref.update({ status: 'failed', failedAt: FieldValue.serverTimestamp(), error: e.message, result });
      console.error(`❌ Failed ${doc.id}:`, e.message);
      await notifySlack(post, `❌ Failed to post *${post.title || doc.id}*: ${e.message}${result.instagram ? `\n(Instagram did go out: ${result.instagram.permalink})` : ''}`, cfg.slackToken, cfg.slackChannel);
    }
  }
  return due.length;
}

module.exports = { runDue, holdState };
