// Domain logic shared by the couple and guest APIs.
import { q } from './db.js';
import { config } from './config.js';
import { randomToken } from './auth.js';

/** Design templates for the guest-facing pages (see public/js/themes.js). */
export const THEMES = ['klassisch', 'zeitung', 'sofortbild', 'konfetti', 'standesamt', 'ballnacht', 'wunderkerzen', 'atelier', 'bluetenmeer'];

export const PREMIUM_FEATURES = ['wall', 'video', 'guestbook_media', 'face_search', 'photobook', 'ai', 'seating', 'unlimited'];

export const isPremium = (w) => w.plan === 'premium';

export function features(w) {
  const p = isPremium(w);
  return {
    plan: w.plan,
    wall: p, video: p, guestbookMedia: p, faceSearch: p && Boolean(w.face_search), photobook: p, seating: p,
    ai: p && config.ai.enabled,
    maxPhotos: p ? null : config.limits.freePhotos,
    maxGuests: p ? null : config.limits.freeGuests,
  };
}

export function slugify(text) {
  const base = text.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'hochzeit';
  let slug = base;
  for (let i = 2; q.get('SELECT 1 FROM weddings WHERE slug = ?', slug); i++) slug = `${base}-${i}`;
  return slug;
}

export const newGuestToken = () => randomToken(12);

export const guestLink = (g) => `${config.baseUrl}/e/${g.token}`;
export const uploadLink = (w) => `${config.baseUrl}/foto/${w.slug}?k=${w.upload_key}`;
export const wallLink = (w) => `${config.baseUrl}/wand/${w.slug}?k=${w.wall_key}`;

/** Local "YYYY-MM-DDTHH:MM" of an event date + "HH:MM" program time. */
function itemStart(eventStartsAt, hhmm) {
  if (!hhmm) return null;
  const d = new Date(eventStartsAt);
  const [h, m] = hhmm.split(':').map(Number);
  // Evening programs past midnight belong to the next calendar day.
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
  if (start < d && h < 6) start.setDate(start.getDate() + 1);
  return start;
}

/**
 * What's happening right now? Uses the manual override set by the team if present,
 * otherwise the program schedule. Surprise items are revealed only once they start.
 */
export function liveState(w, now = new Date(), eventIds = null) {
  const items = q.all(
    `SELECT p.*, e.starts_at AS event_start, e.title AS event_title FROM program_items p
     JOIN events e ON e.id = p.event_id WHERE p.wedding_id = ? AND p.status = 'confirmed'`, w.id,
  ).filter((p) => !eventIds || eventIds.includes(p.event_id))
    .map((p) => ({ ...p, start: itemStart(p.event_start, p.start_time) }))
    .filter((p) => p.start)
    .sort((a, b) => a.start - b.start);

  let current = items.find((p) => p.id === w.live_item_id) || null;
  if (!current) {
    current = [...items].reverse().find((p) => p.start <= now && now - p.start < Math.max(p.duration_min, 30) * 60e3) || null;
  }
  const next = items.find((p) => p.start > (current ? current.start : now) && p.id !== current?.id) || null;
  const shape = (p, reveal) => p && {
    id: p.id, title: p.surprise && !reveal ? 'Überraschung ✨' : p.title,
    host: p.surprise && !reveal ? '' : p.host_name,
    time: p.start_time, duration: p.duration_min, event: p.event_title, starts: p.start.toISOString(),
  };
  return { current: shape(current, true), next: shape(next, false), manual: Boolean(w.live_item_id && current?.id === w.live_item_id) };
}

/** Plain-text summary of everything a guest may know – used for the Q&A assistant. */
export function guestContext(w) {
  const fmt = (s) => new Date(s).toLocaleString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const events = q.all('SELECT * FROM events WHERE wedding_id = ? ORDER BY starts_at', w.id);
  const faqs = q.all('SELECT * FROM faqs WHERE wedding_id = ? ORDER BY sort, id', w.id);
  const lines = [
    `Brautpaar: ${w.partner1} & ${w.partner2}`,
    w.motto && `Motto: ${w.motto}`,
    w.dresscode && `Dresscode: ${w.dresscode}`,
    w.rsvp_deadline && `Rückmeldung bis: ${new Date(w.rsvp_deadline).toLocaleDateString('de-DE')}`,
    w.welcome_text && `Begrüßung: ${w.welcome_text}`,
    w.unplugged_ceremony && 'Bitte während der Trauung keine Fotos mit dem Handy (Unplugged Ceremony).',
    w.gift_note && `Zu Geschenken: ${w.gift_note}`,
    'Termine:',
    ...events.map((e) => `- ${e.title}: ${fmt(e.starts_at)}${e.location ? `, ${e.location}` : ''}${e.address ? ` (${e.address})` : ''}${e.notes ? `. ${e.notes}` : ''}`),
    'Häufige Fragen:',
    ...faqs.map((f) => `- ${f.question} → ${f.answer}`),
  ];
  return { couple: `${w.partner1} & ${w.partner2}`, text: lines.filter(Boolean).join('\n') };
}

const STOP = new Set('der die das und oder ist sind wir ihr ich du es ein eine einen wo wie was wann wer gibt es kann man mit zu zum zur auf für bei am im in an von den dem des ob nicht noch auch mal bitte gibt'.split(' '));
const tokens = (s) => s.toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));

const commonPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

/**
 * Keyword match against the couple's FAQ (fallback when AI is not available).
 * Exact words count 2, shared word stems (≥ 4 letters, e.g. "parken"/"Parkplätze") count 1.5.
 */
export function faqMatch(question, faqs) {
  const qt = tokens(question);
  let best = null, bestScore = 0;
  for (const f of faqs) {
    // The question text weighs double: it is what guests usually paraphrase.
    const qWords = new Set(tokens(f.question));
    const aWords = new Set(tokens(f.answer));
    let score = 0;
    for (const t of qt) {
      let s = 0;
      for (const [words, weight] of [[qWords, 1], [aWords, 0.6]]) {
        for (const x of words) {
          if (x === t) s = Math.max(s, 2 * weight);
          else if (commonPrefix(x, t) >= 4) s = Math.max(s, 1.5 * weight);
        }
      }
      score += s;
    }
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return bestScore >= 1.5 ? best : null;
}

/** Euclidean distance between two 128-d face descriptors. */
export function faceDistance(a, b) {
  let s = 0;
  for (let i = 0; i < 128; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** Photos containing a face close to the given descriptor (face-api.js default threshold 0.6). */
export function photosWithFace(weddingId, descriptor, threshold = 0.5) {
  const out = [];
  for (const p of q.all('SELECT id, faces FROM photos WHERE wedding_id = ? AND approved = 1 AND faces IS NOT NULL', weddingId)) {
    let faces;
    try { faces = JSON.parse(p.faces); } catch { continue; }
    const d = Math.min(...faces.map((f) => faceDistance(f, descriptor)));
    if (d < threshold) out.push({ id: p.id, distance: d });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

export const money = (cents) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
