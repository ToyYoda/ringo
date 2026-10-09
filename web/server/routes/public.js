// Unauthenticated / key-based endpoints: accounts, QR photo upload, live wall, media, operator console.
import express from 'express';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { q, tx } from '../db.js';
import { config } from '../config.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, randomToken, limit, setCookie, parseCookies,
} from '../auth.js';
import { slugify, features, liveState, uploadLink } from '../logic.js';
import { uploader, filePath } from '../media.js';
import { subscribe } from '../realtime.js';
import { storePhotoUpload } from './shared.js';

export const pub = express.Router();
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// ---------- Couple accounts ----------

pub.post('/auth/signup', limit('signup', 10, 60 * 60e3), (req, res) => {
  const { email, password, partner1, partner2, wedding_date } = req.body || {};
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return bad(res, 'Bitte eine gültige E-Mail-Adresse angeben.');
  if (String(password || '').length < 8) return bad(res, 'Das Passwort braucht mindestens 8 Zeichen.');
  if (!partner1?.trim() || !partner2?.trim()) return bad(res, 'Bitte beide Vornamen angeben.');
  if (q.get('SELECT 1 FROM users WHERE email = ?', mail)) return bad(res, 'Zu dieser E-Mail gibt es schon ein Konto.');
  const { userId, weddingId } = tx(() => {
    const u = q.run('INSERT INTO users (email, pw_hash) VALUES (?, ?)', mail, hashPassword(password));
    const w = q.run(
      `INSERT INTO weddings (slug, owner_id, partner1, partner2, wedding_date, plan, upload_key, wall_key, welcome_text)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      slugify(`${partner1}-und-${partner2}`), u.lastInsertRowid, partner1.trim(), partner2.trim(), wedding_date || null,
      config.defaultPlan, randomToken(9), randomToken(9), 'Wir freuen uns so sehr, diesen Tag mit euch zu feiern!',
    );
    if (wedding_date) {
      q.run('INSERT INTO events (wedding_id, title, starts_at, is_main) VALUES (?, ?, ?, 1)', w.lastInsertRowid, 'Hochzeitsfeier', `${wedding_date}T14:00`);
    }
    return { userId: u.lastInsertRowid, weddingId: w.lastInsertRowid };
  });
  createSession(res, userId);
  res.json({ wedding_id: Number(weddingId) });
});

pub.post('/auth/login', limit('login', 20, 15 * 60e3), (req, res) => {
  const mail = String(req.body?.email || '').trim().toLowerCase();
  const u = q.get('SELECT * FROM users WHERE email = ?', mail);
  if (!u || !verifyPassword(String(req.body?.password || ''), u.pw_hash)) return bad(res, 'E-Mail oder Passwort stimmen nicht.', 401);
  createSession(res, u.id);
  res.json({ ok: true });
});

pub.post('/auth/logout', (req, res) => { destroySession(req, res); res.json({ ok: true }); });

pub.get('/auth/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user, weddings: q.all('SELECT id, slug, partner1, partner2, wedding_date, plan FROM weddings WHERE owner_id = ? ORDER BY id', req.user.id) });
});

pub.post('/auth/password', limit('pw', 10, 15 * 60e3), (req, res) => {
  if (!req.user) return bad(res, 'Bitte melde dich an.', 401);
  const u = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPassword(String(req.body?.old || ''), u.pw_hash)) return bad(res, 'Das bisherige Passwort stimmt nicht.');
  if (String(req.body?.new || '').length < 8) return bad(res, 'Das neue Passwort braucht mindestens 8 Zeichen.');
  q.run('UPDATE users SET pw_hash = ? WHERE id = ?', hashPassword(req.body.new), u.id);
  res.json({ ok: true });
});

// ---------- Key-based access (QR upload, live wall) ----------

function weddingByKey(req, res, next) {
  const w = q.get('SELECT * FROM weddings WHERE slug = ?', req.params.slug);
  const k = String(req.query.k || '');
  const ok = w && k && (safeEq(k, w.upload_key) || safeEq(k, w.wall_key));
  if (!ok) return bad(res, 'Dieser Link ist ungültig oder abgelaufen.', 404);
  req.wedding = w;
  req.keyType = safeEq(k, w.wall_key) ? 'wall' : 'upload';
  next();
}

function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

pub.get('/foto/:slug', weddingByKey, (req, res) => {
  const w = req.wedding;
  res.json({
    partner1: w.partner1, partner2: w.partner2, motto: w.motto, cover_path: w.cover_path, logo_path: w.logo_path, id: w.id, theme: w.theme,
    wedding_date: w.wedding_date,
    moderate: Boolean(w.moderate_photos), unplugged: Boolean(w.unplugged_ceremony), features: features(w),
    guestName: req.guest?.wedding_id === w.id ? `${req.guest.first_name} ${req.guest.last_name}`.trim() : null,
  });
});

pub.post('/foto/:slug/upload', weddingByKey, limit('qrupload', 150, 10 * 60e3), uploader(['image', 'video']).fields([{ name: 'file', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]), (req, res) => {
  const g = req.guest?.wedding_id === req.wedding.id ? req.guest : null;
  const result = storePhotoUpload(req, { guestId: g?.id ?? null, uploaderName: g ? `${g.first_name} ${g.last_name}`.trim() : req.body?.name });
  if (result.error) return bad(res, result.error, result.status);
  res.json(result);
});

pub.get('/wand/:slug', weddingByKey, (req, res) => {
  const w = req.wedding;
  if (req.keyType !== 'wall') return bad(res, 'Für die Fotowand wird der Wand-Link benötigt.', 403);
  if (!features(w).wall) return bad(res, 'Die Live-Fotowand ist im Premium-Paket enthalten.', 402);
  const photos = q.all(
    `SELECT id, kind, file, thumb, caption, uploader_name, width, height FROM photos
     WHERE wedding_id = ? AND approved = 1 ORDER BY created_at DESC LIMIT 300`, w.id,
  );
  res.json({ partner1: w.partner1, partner2: w.partner2, motto: w.motto, id: w.id, theme: w.theme, logo_path: w.logo_path, photos, live: liveState(w), uploadUrl: uploadLink(w), slug: w.slug });
});

pub.get('/wand/:slug/photo/:id', weddingByKey, (req, res) => {
  const p = q.get('SELECT id, kind, file, thumb, caption, uploader_name, width, height FROM photos WHERE id = ? AND wedding_id = ? AND approved = 1', req.params.id, req.wedding.id);
  if (!p) return bad(res, 'Nicht gefunden.', 404);
  res.json(p);
});

pub.get('/wand/:slug/stream', weddingByKey, (req, res) => subscribe(req.wedding.id, req, res));

// ---------- QR codes as SVG (only for links to this server) ----------

pub.get('/qr.svg', async (req, res) => {
  const data = String(req.query.d || '');
  if (!data.startsWith(config.baseUrl) || data.length > 500) return bad(res, 'Ungültig.');
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400')
    .send(await QRCode.toString(data, { type: 'svg', margin: 1, color: { dark: '#2E2427', light: '#FFFFFF' } }));
});

// ---------- Operator console ----------

const opToken = () => crypto.createHmac('sha256', config.operatorPassword).update('operator').digest('base64url');
const isOperator = (req) => config.operatorPassword && safeEq(parseCookies(req).hb_op || '', opToken());

pub.post('/betreiber/login', limit('op', 10, 15 * 60e3), (req, res) => {
  if (!config.operatorPassword) return bad(res, 'Die Betreiber-Konsole ist deaktiviert (OPERATOR_PASSWORD fehlt).', 403);
  if (!safeEq(String(req.body?.password || ''), config.operatorPassword)) return bad(res, 'Falsches Passwort.', 401);
  setCookie(res, 'hb_op', opToken(), 1);
  res.json({ ok: true });
});

pub.get('/betreiber/weddings', (req, res) => {
  if (!isOperator(req)) return bad(res, 'Nicht angemeldet.', 401);
  res.json(q.all(
    `SELECT w.id, w.slug, w.partner1, w.partner2, w.wedding_date, w.plan, w.created_at, u.email,
            (SELECT COUNT(*) FROM guests g WHERE g.wedding_id = w.id) AS guests,
            (SELECT COUNT(*) FROM photos p WHERE p.wedding_id = w.id) AS photos,
            (SELECT COALESCE(SUM(size_bytes),0) FROM photos p WHERE p.wedding_id = w.id) AS bytes,
            (SELECT COUNT(*) FROM upgrade_requests r WHERE r.wedding_id = w.id AND r.handled = 0) AS upgrade_requests
     FROM weddings w JOIN users u ON u.id = w.owner_id ORDER BY w.created_at DESC`,
  ));
});

pub.post('/betreiber/weddings/:id/plan', (req, res) => {
  if (!isOperator(req)) return bad(res, 'Nicht angemeldet.', 401);
  const plan = req.body?.plan === 'premium' ? 'premium' : 'free';
  q.run('UPDATE weddings SET plan = ? WHERE id = ?', plan, req.params.id);
  q.run('UPDATE upgrade_requests SET handled = 1 WHERE wedding_id = ?', req.params.id);
  res.json({ ok: true });
});

// ---------- Media ----------

/**
 * Serves uploaded files. Access: owning couple, guests of the wedding, or a valid upload/wall key.
 */
export function serveMedia(req, res) {
  const w = q.get('SELECT * FROM weddings WHERE id = ?', req.params.wid);
  if (!w) return res.sendStatus(404);
  const k = String(req.query.k || '');
  const allowed = (req.user && req.user.id === w.owner_id)
    || (req.guest && req.guest.wedding_id === w.id)
    || (k && safeEq(k, w.wall_key))
    // The table QR key only unlocks the cover image and logo shown on the upload page.
    || (k && safeEq(k, w.upload_key) && (req.params.file === w.cover_path || req.params.file === w.logo_path));
  if (!allowed) return res.sendStatus(403);
  res.sendFile(filePath(w.id, req.params.file), { maxAge: '7d', immutable: true }, (err) => { if (err && !res.headersSent) res.sendStatus(404); });
}
