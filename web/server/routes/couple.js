// API for the couple's dashboard: /api/w/:wid/...
import express from 'express';
import { ZipArchive } from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import { q, tx, updateFields } from '../db.js';
import { requireOwnWedding } from '../auth.js';
import { config } from '../config.js';
import {
  THEMES, features, isPremium, newGuestToken, guestLink, uploadLink, wallLink, liveState, money, photosWithFace,
} from '../logic.js';
import { uploader, removeFile, filePath, folderSize } from '../media.js';
import { publish } from '../realtime.js';
import { autoSeat } from '../seating.js';
import { mailEnabled, sendMail } from '../mail.js';
import * as pdf from '../pdf.js';

export const couple = express.Router({ mergeParams: true });
couple.use(requireOwnWedding);

const wid = (req) => req.wedding.id;
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const premiumOnly = (req, res, next) => (isPremium(req.wedding) ? next() : bad(res, 'Diese Funktion ist im Premium-Paket enthalten.', 402));

// ---------- Overview & settings ----------

const WEDDING_FIELDS = ['partner1', 'partner2', 'wedding_date', 'motto', 'welcome_text', 'story_text', 'dresscode', 'rsvp_deadline',
  'moderate_photos', 'face_search', 'unplugged_ceremony', 'gift_iban', 'gift_account_holder', 'gift_paypal', 'gift_note', 'thanks_text', 'meal_options'];

couple.get('/', (req, res) => {
  const w = req.wedding;
  const n = (sql) => q.get(sql, w.id).n;
  const guests = q.all('SELECT id, plus_one_name, children, invited_at FROM guests WHERE wedding_id = ?', w.id);
  const inv = q.all(
    `SELECT i.rsvp, i.plus_one, g.children FROM invitations i JOIN guests g ON g.id = i.guest_id
     JOIN events e ON e.id = i.event_id WHERE g.wedding_id = ? AND e.is_main = 1`, w.id,
  );
  const stats = {
    guests: guests.length,
    invitedSent: guests.filter((g) => g.invited_at).length,
    yes: inv.filter((i) => i.rsvp === 'yes').length,
    no: inv.filter((i) => i.rsvp === 'no').length,
    open: inv.filter((i) => i.rsvp === 'open').length,
    headcount: inv.filter((i) => i.rsvp === 'yes').reduce((s, i) => s + 1 + i.plus_one + i.children, 0),
    photos: n("SELECT COUNT(*) n FROM photos WHERE wedding_id = ? AND kind = 'photo'"),
    videos: n("SELECT COUNT(*) n FROM photos WHERE wedding_id = ? AND kind = 'video'"),
    pendingPhotos: n('SELECT COUNT(*) n FROM photos WHERE wedding_id = ? AND approved = 0'),
    guestbook: n('SELECT COUNT(*) n FROM guestbook WHERE wedding_id = ?'),
    openQuestions: n("SELECT COUNT(*) n FROM questions WHERE wedding_id = ? AND answer = ''"),
    programRequests: n("SELECT COUNT(*) n FROM program_items WHERE wedding_id = ? AND status = 'requested' AND surprise = 0"),
    giftsTotal: money(q.get('SELECT COALESCE(SUM(amount_cents),0) s FROM pledges WHERE wedding_id = ?', w.id).s),
    storageMb: Math.round(folderSize(w.id) / 1048576),
    giftItems: n('SELECT COUNT(*) n FROM gift_items WHERE wedding_id = ?'),
    tables: n('SELECT COUNT(*) n FROM tables WHERE wedding_id = ?'),
  };
  res.json({
    wedding: w,
    features: features(w),
    stats,
    links: { upload: uploadLink(w), wall: wallLink(w), base: config.baseUrl },
    live: liveState(w),
    mail: mailEnabled(),
    aiConfigured: config.ai.enabled,
  });
});

couple.patch('/', (req, res) => {
  if (req.body?.theme !== undefined && !THEMES.includes(req.body.theme)) return bad(res, 'Unbekanntes Design.');
  updateFields('weddings', wid(req), req.body, [...WEDDING_FIELDS, 'theme']);
  if (req.body?.theme) publish(wid(req), 'theme', { theme: req.body.theme });
  res.json({ ok: true });
});

couple.delete('/', (req, res) => {
  if (req.body?.confirm !== req.wedding.slug) return bad(res, 'Bitte zur Bestätigung die Adresse der Hochzeit eingeben.');
  const dir = path.dirname(filePath(wid(req), 'x'));
  q.run('DELETE FROM weddings WHERE id = ?', wid(req));
  fs.rmSync(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

/** Square logo that replaces the couple's name lettering (the browser pads it to a square PNG). */
couple.post('/logo', uploader(['image']).single('file'), (req, res) => {
  if (!req.file) return bad(res, 'Kein Bild erhalten.');
  removeFile(wid(req), req.wedding.logo_path);
  q.run('UPDATE weddings SET logo_path = ? WHERE id = ?', req.file.filename, wid(req));
  publish(wid(req), 'theme', { theme: req.wedding.theme });
  res.json({ logo_path: req.file.filename });
});

couple.delete('/logo', (req, res) => {
  removeFile(wid(req), req.wedding.logo_path);
  q.run('UPDATE weddings SET logo_path = NULL WHERE id = ?', wid(req));
  publish(wid(req), 'theme', { theme: req.wedding.theme });
  res.json({ ok: true });
});

couple.post('/cover', uploader(['image']).single('file'), (req, res) => {
  if (!req.file) return bad(res, 'Kein Bild erhalten.');
  removeFile(wid(req), req.wedding.cover_path);
  q.run('UPDATE weddings SET cover_path = ? WHERE id = ?', req.file.filename, wid(req));
  res.json({ cover_path: req.file.filename });
});

couple.post('/upgrade', (req, res) => {
  q.run('INSERT INTO upgrade_requests (wedding_id, note) VALUES (?, ?)', wid(req), String(req.body?.note || '').slice(0, 1000));
  res.json({ ok: true });
});

// ---------- Events ----------

const EVENT_FIELDS = ['title', 'starts_at', 'ends_at', 'location', 'address', 'notes', 'is_main'];

couple.get('/events', (req, res) => res.json(q.all('SELECT * FROM events WHERE wedding_id = ? ORDER BY starts_at', wid(req))));

couple.post('/events', (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.starts_at) return bad(res, 'Titel und Beginn sind Pflichtfelder.');
  const id = tx(() => {
    if (b.is_main) q.run('UPDATE events SET is_main = 0 WHERE wedding_id = ?', wid(req));
    const r = q.run(
      'INSERT INTO events (wedding_id, title, starts_at, ends_at, location, address, notes, is_main) VALUES (?,?,?,?,?,?,?,?)',
      wid(req), b.title, b.starts_at, b.ends_at || null, b.location || '', b.address || '', b.notes || '', b.is_main ? 1 : 0,
    );
    if (b.invite_all) {
      q.run('INSERT OR IGNORE INTO invitations (guest_id, event_id) SELECT id, ? FROM guests WHERE wedding_id = ?', r.lastInsertRowid, wid(req));
    }
    return r.lastInsertRowid;
  });
  res.json({ id });
});

couple.patch('/events/:id', (req, res) => {
  tx(() => {
    if (req.body?.is_main) q.run('UPDATE events SET is_main = 0 WHERE wedding_id = ?', wid(req));
    updateFields('events', req.params.id, req.body || {}, EVENT_FIELDS, 'AND wedding_id = ?', [wid(req)]);
  });
  res.json({ ok: true });
});

couple.delete('/events/:id', (req, res) => {
  q.run('DELETE FROM events WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  res.json({ ok: true });
});

// ---------- Guests ----------

const GUEST_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'group_label', 'side', 'role', 'plus_one_allowed', 'plus_one_name',
  'children', 'meal', 'allergies', 'needs_stay', 'song_wish', 'internal_note', 'table_id'];

function listGuests(weddingId) {
  const guests = q.all('SELECT * FROM guests WHERE wedding_id = ? ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE', weddingId);
  const inv = q.all(
    'SELECT i.* FROM invitations i JOIN guests g ON g.id = i.guest_id WHERE g.wedding_id = ?', weddingId,
  );
  const byGuest = new Map();
  for (const i of inv) (byGuest.get(i.guest_id) || byGuest.set(i.guest_id, []).get(i.guest_id)).push(i);
  return guests.map(({ face_descriptor, ...g }) => ({ ...g, link: guestLink(g), invitations: byGuest.get(g.id) || [], has_face: Boolean(face_descriptor) }));
}

couple.get('/guests', (req, res) => res.json(listGuests(wid(req))));

function insertGuest(weddingId, b, eventIds) {
  const r = q.run(
    `INSERT INTO guests (wedding_id, token, first_name, last_name, email, phone, group_label, side, role, plus_one_allowed, children, internal_note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    weddingId, newGuestToken(), b.first_name.trim(), (b.last_name || '').trim(), (b.email || '').trim(), (b.phone || '').trim(),
    (b.group_label || '').trim(), b.side || 'both', b.role || 'guest', b.plus_one_allowed ? 1 : 0, Number(b.children) || 0, b.internal_note || '',
  );
  for (const e of eventIds) q.run('INSERT OR IGNORE INTO invitations (guest_id, event_id) VALUES (?, ?)', r.lastInsertRowid, e);
  return r.lastInsertRowid;
}

function guestLimitReached(w, adding) {
  const f = features(w);
  if (!f.maxGuests) return false;
  return q.get('SELECT COUNT(*) n FROM guests WHERE wedding_id = ?', w.id).n + adding > f.maxGuests;
}

couple.post('/guests', (req, res) => {
  const b = req.body || {};
  if (!b.first_name?.trim()) return bad(res, 'Vorname fehlt.');
  if (guestLimitReached(req.wedding, 1)) return bad(res, `Im kostenlosen Paket sind bis zu ${features(req.wedding).maxGuests} Einladungen möglich.`, 402);
  const events = Array.isArray(b.event_ids) ? b.event_ids
    : q.all('SELECT id FROM events WHERE wedding_id = ?', wid(req)).map((e) => e.id);
  const id = tx(() => insertGuest(wid(req), b, events));
  res.json({ id });
});

couple.patch('/guests/:id', (req, res) => {
  const b = { ...req.body };
  if (b.table_id === '') b.table_id = null;
  if (b.table_id) {
    const t = q.get('SELECT id FROM tables WHERE id = ? AND wedding_id = ?', b.table_id, wid(req));
    if (!t) return bad(res, 'Tisch nicht gefunden.');
  }
  updateFields('guests', req.params.id, b, GUEST_FIELDS, 'AND wedding_id = ?', [wid(req)]);
  res.json({ ok: true });
});

couple.delete('/guests/:id', (req, res) => {
  q.run('DELETE FROM guests WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  res.json({ ok: true });
});

couple.post('/guests/:id/new-link', (req, res) => {
  q.run('UPDATE guests SET token = ? WHERE id = ? AND wedding_id = ?', newGuestToken(), req.params.id, wid(req));
  res.json({ ok: true });
});

couple.put('/guests/:id/invitations/:eventId', (req, res) => {
  const g = q.get('SELECT id FROM guests WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  const e = q.get('SELECT id FROM events WHERE id = ? AND wedding_id = ?', req.params.eventId, wid(req));
  if (!g || !e) return bad(res, 'Nicht gefunden.', 404);
  if (req.body?.invited === false) q.run('DELETE FROM invitations WHERE guest_id = ? AND event_id = ?', g.id, e.id);
  else {
    q.run('INSERT OR IGNORE INTO invitations (guest_id, event_id) VALUES (?, ?)', g.id, e.id);
    if (req.body?.rsvp) q.run("UPDATE invitations SET rsvp = ?, updated_at = datetime('now') WHERE guest_id = ? AND event_id = ?", req.body.rsvp, g.id, e.id);
  }
  res.json({ ok: true });
});

/** CSV import: header row with any of Vorname, Nachname, E-Mail, Telefon, Gruppe, Seite, Begleitung. */
couple.post('/guests/import', (req, res) => {
  const text = String(req.body?.csv || '').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return bad(res, 'Die Datei braucht eine Kopfzeile und mindestens einen Gast.');
  const sep = [';', ',', '\t'].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const split = (l) => {
    const out = []; let cur = ''; let quoted = false;
    for (const ch of l) {
      if (ch === '"') quoted = !quoted;
      else if (ch === sep && !quoted) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const idx = {
    first: col('vorname', 'first'), last: col('nachname', 'last', 'familienname'), email: col('mail'), phone: col('telefon', 'handy', 'phone', 'mobil'),
    group: col('gruppe', 'group'), side: col('seite', 'side'), plus: col('begleit', 'plus'),
  };
  if (idx.first < 0) return bad(res, 'Spalte „Vorname“ nicht gefunden.');
  const rows = lines.slice(1).map(split).filter((r) => r[idx.first]);
  if (guestLimitReached(req.wedding, rows.length)) return bad(res, `Im kostenlosen Paket sind bis zu ${features(req.wedding).maxGuests} Einladungen möglich.`, 402);
  const events = q.all('SELECT id FROM events WHERE wedding_id = ?', wid(req)).map((e) => e.id);
  const sideOf = (s = '') => (/braut|bride|1/i.test(s) && !/bräutigam/i.test(s) ? 'partner1' : /bräutigam|groom|2/i.test(s) ? 'partner2' : 'both');
  tx(() => {
    for (const r of rows) {
      insertGuest(wid(req), {
        first_name: r[idx.first], last_name: idx.last >= 0 ? r[idx.last] : '', email: idx.email >= 0 ? r[idx.email] : '',
        phone: idx.phone >= 0 ? r[idx.phone] : '', group_label: idx.group >= 0 ? r[idx.group] : '',
        side: idx.side >= 0 ? sideOf(r[idx.side]) : 'both', plus_one_allowed: idx.plus >= 0 && /^(ja|yes|1|x)$/i.test(r[idx.plus] || ''),
      }, events);
    }
  });
  res.json({ imported: rows.length });
});

couple.get('/guests/export.csv', (req, res) => {
  const events = q.all('SELECT * FROM events WHERE wedding_id = ? ORDER BY starts_at', wid(req));
  const guests = listGuests(wid(req));
  const tables = new Map(q.all('SELECT id, name FROM tables WHERE wedding_id = ?', wid(req)).map((t) => [t.id, t.name]));
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Vorname', 'Nachname', 'E-Mail', 'Telefon', 'Gruppe', 'Begleitung', 'Kinder', ...events.map((e) => e.title), 'Essen', 'Allergien', 'Übernachtung', 'Musikwunsch', 'Nachricht', 'Tisch', 'Link'];
  const label = { yes: 'Zusage', no: 'Absage', open: 'offen' };
  const rows = guests.map((g) => [g.first_name, g.last_name, g.email, g.phone, g.group_label, g.plus_one_name, g.children,
    ...events.map((e) => { const i = g.invitations.find((x) => x.event_id === e.id); return i ? label[i.rsvp] : '–'; }),
    g.meal, g.allergies, g.needs_stay ? 'ja' : '', g.song_wish, g.note_to_couple, tables.get(g.table_id) || '', g.link]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="gaesteliste-${req.wedding.slug}.csv"`);
  res.send('﻿' + [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n'));
});

function inviteText(w, g) {
  const events = q.all(
    'SELECT e.* FROM events e JOIN invitations i ON i.event_id = e.id WHERE i.guest_id = ? ORDER BY e.starts_at', g.id,
  );
  const when = (s) => new Date(s).toLocaleString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `Liebe/r ${g.first_name},

wir heiraten – und du sollst dabei sein!

${events.map((e) => `• ${e.title}: ${when(e.starts_at)}${e.location ? `, ${e.location}` : ''}`).join('\n')}

Alle Infos, deine Zu- oder Absage und später die Fotos findest du hier:
${guestLink(g)}
${w.rsvp_deadline ? `\nBitte gib uns bis ${new Date(w.rsvp_deadline).toLocaleDateString('de-DE')} Bescheid.\n` : ''}
Wir freuen uns auf dich!
${w.partner1} & ${w.partner2}`;
}

couple.get('/guests/:id/invite-text', (req, res) => {
  const g = q.get('SELECT * FROM guests WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  if (!g) return bad(res, 'Gast nicht gefunden.', 404);
  res.json({ text: inviteText(req.wedding, g), subject: `Einladung zur Hochzeit von ${req.wedding.partner1} & ${req.wedding.partner2}` });
});

couple.post('/guests/:id/mark-invited', (req, res) => {
  q.run("UPDATE guests SET invited_at = datetime('now') WHERE id = ? AND wedding_id = ?", req.params.id, wid(req));
  res.json({ ok: true });
});

/** Sends invitation e-mails to all guests with an address who haven't been invited yet (or the given ids). */
couple.post('/guests/send-invites', async (req, res) => {
  if (!mailEnabled()) return bad(res, 'E-Mail-Versand ist auf diesem Server nicht eingerichtet. Nutze WhatsApp oder kopiere den Link.');
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  const guests = q.all("SELECT * FROM guests WHERE wedding_id = ? AND email != ''", wid(req))
    .filter((g) => (ids ? ids.includes(g.id) : !g.invited_at));
  let sent = 0; const failed = [];
  for (const g of guests) {
    try {
      await sendMail({ to: g.email, subject: `Einladung zur Hochzeit von ${req.wedding.partner1} & ${req.wedding.partner2}`, text: inviteText(req.wedding, g) });
      q.run("UPDATE guests SET invited_at = datetime('now') WHERE id = ?", g.id);
      sent++;
    } catch (e) { failed.push(`${g.first_name} ${g.last_name}: ${e.message}`); }
  }
  res.json({ sent, failed });
});

// ---------- Program & live ----------

const PROGRAM_FIELDS = ['event_id', 'title', 'start_time', 'duration_min', 'host_name', 'description', 'requirements', 'surprise', 'status'];

couple.get('/program', (req, res) => {
  // Surprises stay hidden from the couple – that's the point.
  res.json(q.all("SELECT * FROM program_items WHERE wedding_id = ? AND surprise = 0 ORDER BY event_id, start_time", wid(req)));
});

couple.post('/program', (req, res) => {
  const b = req.body || {};
  const e = q.get('SELECT id FROM events WHERE id = ? AND wedding_id = ?', b.event_id, wid(req));
  if (!e || !b.title) return bad(res, 'Termin und Titel sind Pflichtfelder.');
  const r = q.run(
    'INSERT INTO program_items (wedding_id, event_id, title, start_time, duration_min, host_name, description, requirements, status) VALUES (?,?,?,?,?,?,?,?,?)',
    wid(req), e.id, b.title, b.start_time || '', Number(b.duration_min) || 15, b.host_name || '', b.description || '', b.requirements || '', 'confirmed',
  );
  res.json({ id: r.lastInsertRowid });
});

couple.patch('/program/:id', (req, res) => {
  const b = { ...req.body };
  delete b.surprise;
  updateFields('program_items', req.params.id, b, PROGRAM_FIELDS, 'AND wedding_id = ? AND surprise = 0', [wid(req)]);
  publish(wid(req), 'live', liveState(q.get('SELECT * FROM weddings WHERE id = ?', wid(req))));
  res.json({ ok: true });
});

couple.delete('/program/:id', (req, res) => {
  q.run('DELETE FROM program_items WHERE id = ? AND wedding_id = ? AND surprise = 0', req.params.id, wid(req));
  res.json({ ok: true });
});

couple.post('/live', (req, res) => {
  const id = req.body?.item_id || null;
  if (id && !q.get('SELECT id FROM program_items WHERE id = ? AND wedding_id = ?', id, wid(req))) return bad(res, 'Programmpunkt nicht gefunden.');
  q.run('UPDATE weddings SET live_item_id = ? WHERE id = ?', id, wid(req));
  const state = liveState(q.get('SELECT * FROM weddings WHERE id = ?', wid(req)));
  publish(wid(req), 'live', state);
  res.json(state);
});

// ---------- Photos ----------

couple.get('/photos', (req, res) => {
  const rows = q.all(
    `SELECT p.id, p.kind, p.file, p.thumb, p.caption, p.approved, p.favorite, p.quality, p.width, p.height, p.uploader_name, p.created_at,
            (p.faces IS NOT NULL) AS has_faces, (SELECT COUNT(*) FROM photo_likes l WHERE l.photo_id = p.id) AS likes
     FROM photos p WHERE p.wedding_id = ? ORDER BY p.created_at DESC`, wid(req),
  );
  res.json(rows);
});

couple.patch('/photos/:id', (req, res) => {
  updateFields('photos', req.params.id, req.body || {}, ['approved', 'favorite', 'caption'], 'AND wedding_id = ?', [wid(req)]);
  if (req.body?.approved) publish(wid(req), 'photo', { id: Number(req.params.id) });
  res.json({ ok: true });
});

couple.post('/photos/approve-all', (req, res) => {
  q.run('UPDATE photos SET approved = 1 WHERE wedding_id = ?', wid(req));
  publish(wid(req), 'photo', {});
  res.json({ ok: true });
});

couple.delete('/photos/:id', (req, res) => {
  const p = q.get('SELECT * FROM photos WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  if (!p) return bad(res, 'Nicht gefunden.', 404);
  removeFile(wid(req), p.file);
  removeFile(wid(req), p.thumb);
  q.run('DELETE FROM photos WHERE id = ?', p.id);
  publish(wid(req), 'photo-removed', { id: p.id });
  res.json({ ok: true });
});

/** Full-resolution archive of all photos, videos and guestbook recordings. */
couple.get('/archiv.zip', (req, res) => {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="hochzeit-${req.wedding.slug}.zip"`);
  const zip = new ZipArchive({ store: true });
  zip.on('error', () => res.end());
  zip.pipe(res);
  const pad = (n) => String(n).padStart(4, '0');
  q.all('SELECT * FROM photos WHERE wedding_id = ? ORDER BY created_at', wid(req)).forEach((p, i) => {
    const who = (p.uploader_name || 'gast').replace(/[^\wäöüÄÖÜß-]+/g, '_');
    zip.file(filePath(wid(req), p.file), { name: `${p.kind === 'video' ? 'Videos' : 'Fotos'}/${pad(i + 1)}_${who}${path.extname(p.file)}` });
  });
  const book = q.all('SELECT * FROM guestbook WHERE wedding_id = ? ORDER BY created_at', wid(req));
  book.filter((b) => b.file).forEach((b, i) => zip.file(filePath(wid(req), b.file), { name: `Gaestebuch/${pad(i + 1)}_${b.author_name.replace(/[^\wäöüÄÖÜß-]+/g, '_')}${path.extname(b.file)}` }));
  zip.append(book.map((b) => `${b.author_name} (${b.created_at}):\n${b.text || `[${b.kind}]`}\n`).join('\n'), { name: 'Gaestebuch/Eintraege.txt' });
  zip.finalize();
});

/** Picks photos for the book: favourites first, then best quality, skipping near-duplicates. */
function pickBookPhotos(weddingId, max) {
  const rows = q.all("SELECT * FROM photos WHERE wedding_id = ? AND kind = 'photo' AND approved = 1", weddingId);
  rows.sort((a, b) => b.favorite - a.favorite || (b.quality || 0) - (a.quality || 0));
  const chosen = [];
  const hamming = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
  for (const p of rows) {
    if (chosen.length >= max) break;
    if (!p.favorite && p.ahash && chosen.some((c) => c.ahash && hamming(c.ahash, p.ahash) <= 6)) continue;
    chosen.push(p);
  }
  return chosen.sort((a, b) => b.favorite - a.favorite || a.created_at.localeCompare(b.created_at));
}

couple.get('/fotobuch.pdf', premiumOnly, (req, res) => {
  const max = Math.min(Number(req.query.max) || 40, 200);
  pdf.photoBook(res, { wedding: req.wedding, photos: pickBookPhotos(wid(req), max) });
});

couple.get('/fotobuch-auswahl', (req, res) => {
  res.json(pickBookPhotos(wid(req), Math.min(Number(req.query.max) || 40, 200)).map((p) => p.id));
});

// ---------- Guestbook ----------

couple.get('/guestbook', (req, res) => res.json(q.all('SELECT * FROM guestbook WHERE wedding_id = ? ORDER BY created_at DESC', wid(req))));

couple.delete('/guestbook/:id', (req, res) => {
  const e = q.get('SELECT * FROM guestbook WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  if (e) { removeFile(wid(req), e.file); q.run('DELETE FROM guestbook WHERE id = ?', e.id); }
  res.json({ ok: true });
});

// ---------- Gifts ----------

const GIFT_FIELDS = ['kind', 'title', 'description', 'price_cents', 'quantity', 'link', 'sort'];

couple.get('/gifts', (req, res) => {
  const items = q.all('SELECT * FROM gift_items WHERE wedding_id = ? ORDER BY sort, id', wid(req));
  const pledges = q.all('SELECT * FROM pledges WHERE wedding_id = ? ORDER BY created_at DESC', wid(req));
  res.json({ items, pledges });
});

couple.post('/gifts', (req, res) => {
  const b = req.body || {};
  if (!b.title) return bad(res, 'Titel fehlt.');
  const r = q.run('INSERT INTO gift_items (wedding_id, kind, title, description, price_cents, quantity, link, sort) VALUES (?,?,?,?,?,?,?,?)',
    wid(req), b.kind === 'item' ? 'item' : 'fund', b.title, b.description || '', Math.max(0, Number(b.price_cents) || 0),
    Math.max(1, Number(b.quantity) || 1), b.link || '', Number(b.sort) || 0);
  res.json({ id: r.lastInsertRowid });
});

couple.patch('/gifts/:id', (req, res) => {
  updateFields('gift_items', req.params.id, req.body || {}, GIFT_FIELDS, 'AND wedding_id = ?', [wid(req)]);
  res.json({ ok: true });
});

couple.delete('/gifts/:id', (req, res) => {
  q.run('DELETE FROM gift_items WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  res.json({ ok: true });
});

couple.patch('/pledges/:id', (req, res) => {
  updateFields('pledges', req.params.id, req.body || {}, ['paid'], 'AND wedding_id = ?', [wid(req)]);
  res.json({ ok: true });
});

// ---------- Seating ----------

couple.get('/seating', (req, res) => {
  const tables = q.all('SELECT * FROM tables WHERE wedding_id = ? ORDER BY sort, id', wid(req));
  const rules = q.all('SELECT * FROM seat_rules WHERE wedding_id = ?', wid(req));
  const guests = q.all(
    `SELECT g.id, g.first_name, g.last_name, g.group_label, g.table_id, g.plus_one_name, g.children,
            COALESCE((SELECT i.rsvp FROM invitations i JOIN events e ON e.id = i.event_id WHERE i.guest_id = g.id AND e.is_main = 1), 'open') AS rsvp
     FROM guests g WHERE g.wedding_id = ? ORDER BY g.group_label, g.last_name`, wid(req),
  );
  res.json({ tables, rules, guests });
});

couple.post('/tables', (req, res) => {
  const b = req.body || {};
  const count = Math.min(Math.max(Number(b.count) || 1, 1), 50);
  const existing = q.get('SELECT COUNT(*) n FROM tables WHERE wedding_id = ?', wid(req)).n;
  tx(() => {
    for (let i = 0; i < count; i++) {
      q.run('INSERT INTO tables (wedding_id, name, capacity, sort) VALUES (?,?,?,?)', wid(req),
        count > 1 || !b.name ? `Tisch ${existing + i + 1}` : b.name, Math.max(1, Number(b.capacity) || 8), existing + i);
    }
  });
  res.json({ ok: true });
});

couple.patch('/tables/:id', (req, res) => {
  updateFields('tables', req.params.id, req.body || {}, ['name', 'capacity', 'sort'], 'AND wedding_id = ?', [wid(req)]);
  res.json({ ok: true });
});

couple.delete('/tables/:id', (req, res) => {
  q.run('DELETE FROM tables WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  res.json({ ok: true });
});

couple.post('/seat-rules', (req, res) => {
  const { guest_a, guest_b, kind } = req.body || {};
  const ok = q.get('SELECT COUNT(*) n FROM guests WHERE wedding_id = ? AND id IN (?, ?)', wid(req), guest_a, guest_b).n === 2;
  if (!ok || guest_a === guest_b || !['together', 'apart'].includes(kind)) return bad(res, 'Bitte zwei verschiedene Gäste wählen.');
  q.run('INSERT INTO seat_rules (wedding_id, guest_a, guest_b, kind) VALUES (?,?,?,?)', wid(req), guest_a, guest_b, kind);
  res.json({ ok: true });
});

couple.delete('/seat-rules/:id', (req, res) => {
  q.run('DELETE FROM seat_rules WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  res.json({ ok: true });
});

couple.post('/seating/auto', premiumOnly, (req, res) => {
  const keep = Boolean(req.body?.keep_existing);
  const tables = q.all('SELECT * FROM tables WHERE wedding_id = ?', wid(req));
  if (!tables.length) return bad(res, 'Lege zuerst Tische an.');
  let guests = q.all(
    `SELECT g.* FROM guests g JOIN invitations i ON i.guest_id = g.id JOIN events e ON e.id = i.event_id
     WHERE g.wedding_id = ? AND e.is_main = 1 AND i.rsvp != 'no'`, wid(req),
  );
  const seats = (g) => 1 + (g.plus_one_name ? 1 : 0) + (g.children || 0);
  const tableInput = tables.map((t) => ({ id: t.id, capacity: t.capacity - (keep ? guests.filter((g) => g.table_id === t.id).reduce((s, g) => s + seats(g), 0) : 0) }));
  if (keep) guests = guests.filter((g) => !g.table_id);
  const rules = q.all('SELECT * FROM seat_rules WHERE wedding_id = ?', wid(req));
  const { assignment, unplaced, conflicts } = autoSeat(guests.map((g) => ({ id: g.id, group_label: g.group_label, seats: seats(g) })), tableInput, rules);
  tx(() => {
    if (!keep) q.run('UPDATE guests SET table_id = NULL WHERE wedding_id = ?', wid(req));
    for (const [gid, tid] of assignment) q.run('UPDATE guests SET table_id = ? WHERE id = ?', tid, gid);
  });
  res.json({ placed: assignment.size, unplaced: unplaced.length, conflicts });
});

// ---------- FAQ, questions, announcements ----------

couple.get('/faqs', (req, res) => res.json(q.all('SELECT * FROM faqs WHERE wedding_id = ? ORDER BY sort, id', wid(req))));
couple.post('/faqs', (req, res) => {
  const b = req.body || {};
  if (!b.question || !b.answer) return bad(res, 'Frage und Antwort ausfüllen.');
  res.json({ id: q.run('INSERT INTO faqs (wedding_id, question, answer, sort) VALUES (?,?,?,?)', wid(req), b.question, b.answer, Number(b.sort) || 0).lastInsertRowid });
});
couple.patch('/faqs/:id', (req, res) => {
  updateFields('faqs', req.params.id, req.body || {}, ['question', 'answer', 'sort'], 'AND wedding_id = ?', [wid(req)]);
  res.json({ ok: true });
});
couple.delete('/faqs/:id', (req, res) => {
  q.run('DELETE FROM faqs WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  res.json({ ok: true });
});

couple.get('/questions', (req, res) => res.json(q.all(
  `SELECT qu.*, g.first_name, g.last_name FROM questions qu LEFT JOIN guests g ON g.id = qu.guest_id
   WHERE qu.wedding_id = ? ORDER BY (qu.answer = '') DESC, qu.created_at DESC`, wid(req),
)));
couple.patch('/questions/:id', (req, res) => {
  const qu = q.get('SELECT * FROM questions WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  if (!qu) return bad(res, 'Nicht gefunden.', 404);
  q.run("UPDATE questions SET answer = ?, answered_by = 'Brautpaar' WHERE id = ?", req.body?.answer || '', qu.id);
  if (req.body?.add_to_faq && req.body.answer) q.run('INSERT INTO faqs (wedding_id, question, answer) VALUES (?,?,?)', wid(req), qu.question, req.body.answer);
  res.json({ ok: true });
});
couple.delete('/questions/:id', (req, res) => {
  q.run('DELETE FROM questions WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  res.json({ ok: true });
});

couple.get('/announcements', (req, res) => res.json(q.all('SELECT * FROM announcements WHERE wedding_id = ? ORDER BY created_at DESC', wid(req))));
couple.post('/announcements', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return bad(res, 'Text fehlt.');
  const id = q.run('INSERT INTO announcements (wedding_id, text) VALUES (?, ?)', wid(req), text).lastInsertRowid;
  publish(wid(req), 'announcement', { id, text });
  let mailed = 0;
  if (req.body?.email && mailEnabled()) {
    for (const g of q.all("SELECT * FROM guests WHERE wedding_id = ? AND email != ''", wid(req))) {
      try {
        await sendMail({ to: g.email, subject: `Neuigkeiten von ${req.wedding.partner1} & ${req.wedding.partner2}`, text: `Liebe/r ${g.first_name},\n\n${text}\n\nAlle Infos: ${guestLink(g)}` });
        mailed++;
      } catch { /* keep going */ }
    }
  }
  res.json({ id, mailed });
});
couple.delete('/announcements/:id', (req, res) => {
  q.run('DELETE FROM announcements WHERE id = ? AND wedding_id = ?', req.params.id, wid(req));
  res.json({ ok: true });
});

// ---------- Printables ----------

couple.get('/tischkarten.pdf', async (req, res) => {
  const tables = q.all('SELECT * FROM tables WHERE wedding_id = ? ORDER BY sort, id', wid(req));
  const extra = Math.min(Number(req.query.leer) || 0, 40);
  await pdf.tableCards(res, { wedding: req.wedding, tables: [...tables, ...Array.from({ length: extra }, () => ({ name: '' }))], uploadUrl: uploadLink(req.wedding) });
});

couple.get('/aushang.pdf', async (req, res) => {
  const wall = req.query.typ === 'wand';
  await pdf.poster(res, wall
    ? { wedding: req.wedding, url: wallLink(req.wedding), title: 'Live-Fotowand', subtitle: 'Diesen Link auf dem Beamer oder Fernseher öffnen.' }
    : { wedding: req.wedding, url: uploadLink(req.wedding), title: 'Eure Fotos für uns', subtitle: 'QR-Code scannen, fotografieren, hochladen – direkt in unser gemeinsames Album. Keine App nötig.' });
});

couple.get('/gaesteliste.pdf', (req, res) => {
  pdf.guestList(res, {
    wedding: req.wedding,
    guests: q.all('SELECT * FROM guests WHERE wedding_id = ? ORDER BY group_label, last_name', wid(req)),
    events: q.all('SELECT * FROM events WHERE wedding_id = ? ORDER BY starts_at', wid(req)),
    invitations: q.all('SELECT i.* FROM invitations i JOIN guests g ON g.id = i.guest_id WHERE g.wedding_id = ?', wid(req)),
    tables: q.all('SELECT * FROM tables WHERE wedding_id = ?', wid(req)),
  });
});

couple.get('/dankeskarten.pdf', (req, res) => {
  const guests = q.all(
    `SELECT DISTINCT g.* FROM guests g JOIN invitations i ON i.guest_id = g.id
     WHERE g.wedding_id = ? AND i.rsvp = 'yes' ORDER BY g.last_name`, wid(req),
  );
  const photos = q.all("SELECT * FROM photos WHERE wedding_id = ? AND kind = 'photo' AND approved = 1 ORDER BY favorite DESC, quality DESC", wid(req));
  const byId = new Map(photos.map((p) => [p.id, p]));
  const own = new Map();
  for (const p of photos) if (p.guest_id && !own.has(p.guest_id)) own.set(p.guest_id, p);
  const cover = photos.find((p) => p.favorite) || photos[0] || null;
  // Prefer a photo the guest appears in (if they opted into face search), then one they took.
  const photoFor = (g) => {
    if (g.face_descriptor) {
      const hit = photosWithFace(wid(req), JSON.parse(g.face_descriptor)).map((m) => byId.get(m.id)).find(Boolean);
      if (hit) return hit;
    }
    return own.get(g.id) || cover;
  };
  pdf.thankYouCards(res, { wedding: req.wedding, guests, text: req.wedding.thanks_text, photoFor });
});
