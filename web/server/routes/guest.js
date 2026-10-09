// API for invited guests (personal link → cookie): /api/g/...
import express from 'express';
import QRCode from 'qrcode';
import { q, tx } from '../db.js';
import { requireGuest, requireTeam, isTeam, limit } from '../auth.js';
import { features, liveState, guestContext, faqMatch, photosWithFace, uploadLink } from '../logic.js';
import { uploader, removeFile } from '../media.js';
import { publish, subscribe } from '../realtime.js';
import { answerGuestQuestion, draftSpeech } from '../ai.js';
import { epcPayload } from '../mail.js';
import { storePhotoUpload } from './shared.js';

export const guest = express.Router();
guest.use(requireGuest);

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const me = (req) => req.guest;
const W = (req) => req.wedding;
const name = (g) => `${g.first_name} ${g.last_name}`.trim();

/** Wedding data a guest may see. */
function publicWedding(w) {
  return {
    slug: w.slug, partner1: w.partner1, partner2: w.partner2, wedding_date: w.wedding_date, motto: w.motto,
    welcome_text: w.welcome_text, story_text: w.story_text, dresscode: w.dresscode, rsvp_deadline: w.rsvp_deadline,
    cover_path: w.cover_path, logo_path: w.logo_path, id: w.id, theme: w.theme, unplugged_ceremony: w.unplugged_ceremony, moderate_photos: w.moderate_photos,
    meal_options: (w.meal_options || '').split('|').filter(Boolean),
    gift_note: w.gift_note, has_bank: Boolean(w.gift_iban), has_paypal: Boolean(w.gift_paypal),
  };
}

guest.get('/me', (req, res) => {
  const g = me(req), w = W(req);
  const events = q.all(
    `SELECT e.*, i.rsvp, i.plus_one FROM events e JOIN invitations i ON i.event_id = e.id
     WHERE i.guest_id = ? ORDER BY e.starts_at`, g.id,
  );
  const { token, internal_note, face_descriptor, ...self } = g;
  res.json({
    wedding: publicWedding(w),
    me: { ...self, team: isTeam(g), has_face: Boolean(face_descriptor) },
    events,
    features: features(w),
    announcements: q.all('SELECT * FROM announcements WHERE wedding_id = ? ORDER BY created_at DESC LIMIT 20', w.id),
    faqs: q.all('SELECT question, answer FROM faqs WHERE wedding_id = ? ORDER BY sort, id', w.id),
    live: guestLive(req),
    uploadUrl: uploadLink(w),
  });
});

guest.get('/stream', (req, res) => subscribe(W(req).id, req, res));
/** Live state limited to the events this guest is invited to. */
const guestLive = (req) => liveState(q.get('SELECT * FROM weddings WHERE id = ?', W(req).id), new Date(),
  q.all('SELECT event_id FROM invitations WHERE guest_id = ?', me(req).id).map((i) => i.event_id));

guest.get('/live', (req, res) => res.json(guestLive(req)));

// ---------- RSVP ----------

guest.post('/rsvp', (req, res) => {
  const g = me(req), b = req.body || {};
  const responses = Array.isArray(b.responses) ? b.responses : [];
  tx(() => {
    for (const r of responses) {
      if (!['yes', 'no', 'open'].includes(r.rsvp)) continue;
      q.run("UPDATE invitations SET rsvp = ?, plus_one = ?, updated_at = datetime('now') WHERE guest_id = ? AND event_id = ?",
        r.rsvp, g.plus_one_allowed && r.plus_one && r.rsvp === 'yes' ? 1 : 0, g.id, r.event_id);
    }
    q.run(
      `UPDATE guests SET plus_one_name = ?, children = ?, meal = ?, allergies = ?, needs_stay = ?, song_wish = ?, note_to_couple = ? WHERE id = ?`,
      g.plus_one_allowed ? String(b.plus_one_name || '').slice(0, 100) : '', Math.min(Math.max(Number(b.children) || 0, 0), 10),
      String(b.meal || '').slice(0, 60), String(b.allergies || '').slice(0, 300), b.needs_stay ? 1 : 0,
      String(b.song_wish || '').slice(0, 200), String(b.note_to_couple || '').slice(0, 1000), g.id,
    );
  });
  publish(W(req).id, 'rsvp', { guest_id: g.id });
  res.json({ ok: true });
});

// ---------- Program ----------

guest.get('/program', (req, res) => {
  const g = me(req);
  const team = isTeam(g);
  const items = q.all(
    `SELECT p.*, e.title AS event_title FROM program_items p JOIN events e ON e.id = p.event_id
     JOIN invitations i ON i.event_id = e.id AND i.guest_id = ?
     WHERE p.wedding_id = ? ORDER BY e.starts_at, p.start_time`, g.id, W(req).id,
  ).filter((p) => team || p.guest_id === g.id || (p.status === 'confirmed' && !p.surprise))
    .map((p) => ({ ...p, mine: p.guest_id === g.id, requirements: team || p.guest_id === g.id ? p.requirements : '' }));
  res.json(items);
});

guest.post('/program', (req, res) => {
  const g = me(req), b = req.body || {};
  const inv = q.get('SELECT 1 FROM invitations WHERE guest_id = ? AND event_id = ?', g.id, b.event_id);
  if (!inv || !b.title) return bad(res, 'Bitte Termin und Titel angeben.');
  const r = q.run(
    `INSERT INTO program_items (wedding_id, event_id, title, start_time, duration_min, host_name, guest_id, description, requirements, surprise, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    W(req).id, b.event_id, String(b.title).slice(0, 120), b.start_time || '', Math.min(Number(b.duration_min) || 10, 240),
    String(b.host_name || name(g)).slice(0, 120), g.id, String(b.description || '').slice(0, 1000), String(b.requirements || '').slice(0, 500),
    b.surprise ? 1 : 0, isTeam(g) ? 'confirmed' : 'requested',
  );
  res.json({ id: r.lastInsertRowid });
});

/** Team members decide on requests (incl. surprises) and can move the live marker. */
guest.patch('/program/:id', requireTeam, (req, res) => {
  const b = req.body || {};
  const p = q.get('SELECT * FROM program_items WHERE id = ? AND wedding_id = ?', req.params.id, W(req).id);
  if (!p) return bad(res, 'Nicht gefunden.', 404);
  if (b.status && ['confirmed', 'declined', 'requested'].includes(b.status)) q.run('UPDATE program_items SET status = ? WHERE id = ?', b.status, p.id);
  if (b.start_time !== undefined) q.run('UPDATE program_items SET start_time = ? WHERE id = ?', String(b.start_time), p.id);
  res.json({ ok: true });
});

guest.delete('/program/:id', (req, res) => {
  const g = me(req);
  const p = q.get('SELECT * FROM program_items WHERE id = ? AND wedding_id = ?', req.params.id, W(req).id);
  if (!p || (p.guest_id !== g.id && !isTeam(g))) return bad(res, 'Nicht erlaubt.', 403);
  q.run('DELETE FROM program_items WHERE id = ?', p.id);
  res.json({ ok: true });
});

guest.post('/live', requireTeam, (req, res) => {
  const id = req.body?.item_id || null;
  if (id && !q.get('SELECT id FROM program_items WHERE id = ? AND wedding_id = ?', id, W(req).id)) return bad(res, 'Nicht gefunden.');
  q.run('UPDATE weddings SET live_item_id = ? WHERE id = ?', id, W(req).id);
  publish(W(req).id, 'live', liveState(q.get('SELECT * FROM weddings WHERE id = ?', W(req).id)));
  res.json(guestLive(req));
});

// ---------- Photos ----------

guest.get('/photos', (req, res) => {
  const g = me(req);
  const rows = q.all(
    `SELECT p.id, p.kind, p.file, p.thumb, p.caption, p.uploader_name, p.created_at, p.approved, p.guest_id, p.width, p.height,
            (SELECT COUNT(*) FROM photo_likes l WHERE l.photo_id = p.id) AS likes,
            EXISTS(SELECT 1 FROM photo_likes l WHERE l.photo_id = p.id AND l.liker = ?) AS liked
     FROM photos p WHERE p.wedding_id = ? AND (p.approved = 1 OR p.guest_id = ?) ORDER BY p.created_at DESC`,
    `g${g.id}`, W(req).id, g.id,
  );
  res.json(rows.map((p) => ({ ...p, mine: p.guest_id === g.id })));
});

guest.post('/photos', limit('upload', 120, 10 * 60e3), uploader(['image', 'video']).fields([{ name: 'file', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]), (req, res) => {
  const g = me(req);
  const result = storePhotoUpload(req, { guestId: g.id, uploaderName: name(g) });
  if (result.error) return bad(res, result.error, result.status);
  res.json(result);
});

guest.post('/photos/:id/like', (req, res) => {
  const liker = `g${me(req).id}`;
  const p = q.get('SELECT id FROM photos WHERE id = ? AND wedding_id = ?', req.params.id, W(req).id);
  if (!p) return bad(res, 'Nicht gefunden.', 404);
  if (q.get('SELECT 1 FROM photo_likes WHERE photo_id = ? AND liker = ?', p.id, liker)) q.run('DELETE FROM photo_likes WHERE photo_id = ? AND liker = ?', p.id, liker);
  else q.run('INSERT INTO photo_likes (photo_id, liker) VALUES (?, ?)', p.id, liker);
  res.json({ likes: q.get('SELECT COUNT(*) n FROM photo_likes WHERE photo_id = ?', p.id).n });
});

guest.delete('/photos/:id', (req, res) => {
  const p = q.get('SELECT * FROM photos WHERE id = ? AND wedding_id = ? AND guest_id = ?', req.params.id, W(req).id, me(req).id);
  if (!p) return bad(res, 'Nur eigene Fotos können gelöscht werden.', 403);
  removeFile(W(req).id, p.file); removeFile(W(req).id, p.thumb);
  q.run('DELETE FROM photos WHERE id = ?', p.id);
  publish(W(req).id, 'photo-removed', { id: p.id });
  res.json({ ok: true });
});

/**
 * "Find my photos": the browser computes the face descriptor from a selfie; the selfie itself never leaves the device.
 * With remember=true the descriptor is stored so the couple can personalise thank-you cards.
 */
guest.post('/face-search', (req, res) => {
  if (!features(W(req)).faceSearch) return bad(res, 'Diese Funktion ist für diese Hochzeit nicht aktiviert.', 403);
  const d = req.body?.descriptor;
  if (!Array.isArray(d) || d.length !== 128 || d.some((x) => typeof x !== 'number')) return bad(res, 'Ungültige Gesichtsdaten.');
  if (req.body.remember) q.run('UPDATE guests SET face_descriptor = ? WHERE id = ?', JSON.stringify(d), me(req).id);
  res.json({ matches: photosWithFace(W(req).id, d) });
});

guest.delete('/face', (req, res) => {
  q.run('UPDATE guests SET face_descriptor = NULL WHERE id = ?', me(req).id);
  res.json({ ok: true });
});

// ---------- Guestbook ----------

guest.get('/guestbook', (req, res) => {
  res.json(q.all('SELECT id, kind, text, file, created_at FROM guestbook WHERE wedding_id = ? AND guest_id = ? ORDER BY created_at DESC', W(req).id, me(req).id));
});

guest.post('/guestbook', limit('book', 20, 10 * 60e3), uploader(['audio', 'video']).single('file'), (req, res) => {
  const g = me(req);
  const text = String(req.body?.text || '').slice(0, 3000);
  let kind = 'text';
  if (req.file) {
    if (!features(W(req)).guestbookMedia) { removeFile(W(req).id, req.file.filename); return bad(res, 'Sprach- und Videobotschaften sind im Premium-Paket enthalten.', 402); }
    kind = req.file.mimetype.startsWith('video') ? 'video' : 'audio';
  } else if (!text.trim()) return bad(res, 'Bitte schreib etwas oder nimm eine Nachricht auf.');
  const r = q.run('INSERT INTO guestbook (wedding_id, guest_id, author_name, kind, text, file, size_bytes) VALUES (?,?,?,?,?,?,?)',
    W(req).id, g.id, name(g), kind, text, req.file?.filename || null, req.file?.size || 0);
  res.json({ id: r.lastInsertRowid });
});

// ---------- Gifts ----------

guest.get('/gifts', (req, res) => {
  const w = W(req);
  const items = q.all('SELECT * FROM gift_items WHERE wedding_id = ? ORDER BY sort, id', w.id).map((it) => {
    const s = q.get('SELECT COALESCE(SUM(amount_cents),0) amount, COALESCE(SUM(units),0) units FROM pledges WHERE item_id = ?', it.id);
    const mine = q.all('SELECT id, amount_cents, units, message, created_at FROM pledges WHERE item_id = ? AND guest_id = ?', it.id, me(req).id);
    return { ...it, pledged_cents: s.amount, pledged_units: s.units, mine };
  });
  res.json({
    items,
    payment: { holder: w.gift_account_holder || `${w.partner1} & ${w.partner2}`, iban: w.gift_iban, paypal: w.gift_paypal, note: w.gift_note },
  });
});

guest.post('/gifts/:id/pledge', async (req, res) => {
  const g = me(req), w = W(req), b = req.body || {};
  const it = q.get('SELECT * FROM gift_items WHERE id = ? AND wedding_id = ?', req.params.id, w.id);
  if (!it) return bad(res, 'Nicht gefunden.', 404);
  let units = 1, amount = 0;
  if (it.kind === 'item') {
    units = Math.max(1, Number(b.units) || 1);
    const taken = q.get('SELECT COALESCE(SUM(units),0) n FROM pledges WHERE item_id = ?', it.id).n;
    if (taken + units > it.quantity) return bad(res, 'Das ist leider schon vergeben.');
    amount = it.price_cents * units;
  } else {
    amount = Math.round(Number(b.amount_eur) * 100);
    if (!(amount >= 100)) return bad(res, 'Bitte einen Betrag ab 1 € angeben.');
  }
  const r = q.run('INSERT INTO pledges (wedding_id, item_id, guest_id, name, amount_cents, units, message) VALUES (?,?,?,?,?,?,?)',
    w.id, it.id, g.id, b.anonymous ? 'Anonym' : name(g), amount, units, String(b.message || '').slice(0, 500));
  const ref = `Hochzeitsgeschenk ${it.title}`.slice(0, 140);
  const epc = w.gift_iban && amount ? epcPayload({ name: w.gift_account_holder || `${w.partner1} ${w.partner2}`, iban: w.gift_iban, amountCents: amount, text: ref }) : null;
  res.json({
    id: r.lastInsertRowid,
    amount_cents: amount,
    // GiroCode: banking apps prefill the transfer when scanning it.
    epc_svg: epc ? await QRCode.toString(epc, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : null,
    iban: w.gift_iban || null,
    holder: w.gift_account_holder || `${w.partner1} & ${w.partner2}`,
    paypal: w.gift_paypal ? `https://paypal.me/${encodeURIComponent(w.gift_paypal.replace(/^.*paypal\.me\//i, ''))}/${(amount / 100).toFixed(2)}EUR` : null,
    reference: ref,
  });
});

guest.delete('/pledges/:id', (req, res) => {
  q.run('DELETE FROM pledges WHERE id = ? AND guest_id = ? AND paid = 0', req.params.id, me(req).id);
  res.json({ ok: true });
});

// ---------- Seat finder ----------

guest.get('/seat', (req, res) => {
  const w = W(req);
  const mine = me(req).table_id ? q.get('SELECT * FROM tables WHERE id = ?', me(req).table_id) : null;
  const mates = mine ? q.all('SELECT first_name, last_name, plus_one_name FROM guests WHERE table_id = ? AND id != ? ORDER BY first_name', mine.id, me(req).id) : [];
  const search = String(req.query.q || '').trim();
  const found = search.length >= 2
    ? q.all(`SELECT g.first_name, g.last_name, t.name AS table_name FROM guests g LEFT JOIN tables t ON t.id = g.table_id
             WHERE g.wedding_id = ? AND (g.first_name || ' ' || g.last_name) LIKE ? LIMIT 10`, w.id, `%${search}%`)
    : [];
  const published = q.get('SELECT COUNT(*) n FROM guests WHERE wedding_id = ? AND table_id IS NOT NULL', w.id).n > 0;
  res.json({ table: mine, mates, found, published });
});

// ---------- Questions (assistant) ----------

guest.post('/ask', limit('ask', 30, 10 * 60e3), async (req, res) => {
  const w = W(req);
  const question = String(req.body?.question || '').trim().slice(0, 500);
  if (question.length < 3) return bad(res, 'Bitte stell eine Frage.');
  const faqs = q.all('SELECT * FROM faqs WHERE wedding_id = ?', w.id);
  if (features(w).ai) {
    try {
      const r = await answerGuestQuestion(guestContext(w), question);
      if (!r.unknown) return res.json({ answer: r.answer, source: 'ai' });
    } catch (e) {
      console.error('AI answer failed:', e.message);
    }
  }
  const hit = faqMatch(question, faqs);
  if (hit) return res.json({ answer: hit.answer, source: 'faq', matched: hit.question });
  q.run('INSERT INTO questions (wedding_id, guest_id, question) VALUES (?,?,?)', w.id, me(req).id, question);
  res.json({ answer: null, forwarded: true });
});

guest.get('/questions', (req, res) => {
  res.json(q.all('SELECT question, answer, created_at FROM questions WHERE wedding_id = ? AND guest_id = ? ORDER BY created_at DESC', W(req).id, me(req).id));
});

// ---------- Anecdotes (any guest) & team area ----------

guest.post('/anecdotes', (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  if (!text) return bad(res, 'Bitte erzähl uns etwas.');
  q.run('INSERT INTO anecdotes (wedding_id, guest_id, author_name, text) VALUES (?,?,?,?)', W(req).id, me(req).id, name(me(req)), text);
  res.json({ ok: true });
});

guest.get('/team', requireTeam, (req, res) => {
  const w = W(req);
  res.json({
    posts: q.all('SELECT * FROM team_posts WHERE wedding_id = ? ORDER BY created_at DESC', w.id),
    anecdotes: q.all('SELECT * FROM anecdotes WHERE wedding_id = ? ORDER BY created_at DESC', w.id),
    program: q.all(
      `SELECT p.*, e.title AS event_title FROM program_items p JOIN events e ON e.id = p.event_id
       WHERE p.wedding_id = ? ORDER BY e.starts_at, p.start_time`, w.id,
    ),
    team: q.all("SELECT first_name, last_name, role, phone, email FROM guests WHERE wedding_id = ? AND role IN ('witness','organizer')", w.id),
    aiAvailable: features(w).ai,
  });
});

guest.post('/team/posts', requireTeam, (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 3000);
  if (!text) return bad(res, 'Text fehlt.');
  q.run('INSERT INTO team_posts (wedding_id, guest_id, author_name, text) VALUES (?,?,?,?)', W(req).id, me(req).id, name(me(req)), text);
  res.json({ ok: true });
});

guest.post('/team/speech', requireTeam, limit('speech', 10, 60 * 60e3), async (req, res) => {
  const w = W(req), g = me(req);
  const anecdotes = q.all('SELECT * FROM anecdotes WHERE wedding_id = ? ORDER BY created_at', w.id);
  if (!features(w).ai) {
    // Without AI: a structured outline with the anecdotes slotted in.
    const outline = [
      `Liebe ${w.partner1}, lieber ${w.partner2}, liebe Gäste,`,
      '',
      `[Einstieg: Wer bist du und woher kennst du das Brautpaar?]`,
      '',
      ...anecdotes.slice(0, 3).map((a, i) => `[Geschichte ${i + 1} – erzählt von ${a.author_name}]\n${a.text}\n[Was sagt diese Geschichte über die beiden?]\n`),
      '[Was wünschst du den beiden für die Zukunft?]',
      '',
      `Bitte erhebt euer Glas: Auf ${w.partner1} und ${w.partner2}!`,
    ].join('\n');
    return res.json({ text: outline, source: 'template' });
  }
  try {
    const text = await draftSpeech({
      couple: `${w.partner1} & ${w.partner2}`, speaker: name(g), relation: g.role === 'witness' ? 'Trauzeuge/in' : 'Organisator/in',
      anecdotes, tone: req.body?.tone, minutes: req.body?.minutes,
    });
    if (!text) return bad(res, 'Der Entwurf konnte nicht erstellt werden.', 502);
    res.json({ text, source: 'ai' });
  } catch (e) {
    console.error('AI speech failed:', e.message);
    bad(res, 'Der KI-Dienst ist gerade nicht erreichbar.', 502);
  }
});

