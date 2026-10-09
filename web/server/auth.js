import crypto from 'node:crypto';
import { q } from './db.js';
import { config } from './config.js';

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, maxAgeDays = 60) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.round(maxAgeDays * 86400)}`];
  if (config.secureCookies) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export const clearCookie = (res, name) => setCookie(res, name, '', 0);

// ---------- Couple accounts ----------

export function createSession(res, userId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + 30 * 86400e3).toISOString();
  q.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, expires);
  setCookie(res, 'hb_session', token, 30);
}

export function destroySession(req, res) {
  const t = parseCookies(req).hb_session;
  if (t) q.run('DELETE FROM sessions WHERE token = ?', t);
  clearCookie(res, 'hb_session');
}

/** Attaches req.user and req.guest when the respective cookies are valid. */
export function loadIdentity(req, _res, next) {
  const c = parseCookies(req);
  req.cookies = c;
  if (c.hb_session) {
    const s = q.get(
      `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
      c.hb_session, new Date().toISOString(),
    );
    if (s) req.user = s;
  }
  if (c.hb_guest) {
    const g = q.get('SELECT * FROM guests WHERE token = ?', c.hb_guest);
    if (g) req.guest = g;
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Bitte melde dich an.' });
  next();
}

/** Loads the wedding identified by :wid and verifies the logged-in user owns it. */
export function requireOwnWedding(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Bitte melde dich an.' });
  const w = q.get('SELECT * FROM weddings WHERE id = ? AND owner_id = ?', req.params.wid, req.user.id);
  if (!w) return res.status(404).json({ error: 'Hochzeit nicht gefunden.' });
  req.wedding = w;
  next();
}

export function requireGuest(req, res, next) {
  if (!req.guest) return res.status(401).json({ error: 'Bitte öffne deinen persönlichen Einladungslink.' });
  req.wedding = q.get('SELECT * FROM weddings WHERE id = ?', req.guest.wedding_id);
  if (!req.wedding) return res.status(404).json({ error: 'Hochzeit nicht gefunden.' });
  q.run("UPDATE guests SET last_seen_at = datetime('now') WHERE id = ?", req.guest.id);
  next();
}

export const isTeam = (guest) => guest && (guest.role === 'witness' || guest.role === 'organizer');

export function requireTeam(req, res, next) {
  if (!isTeam(req.guest)) return res.status(403).json({ error: 'Nur für Trauzeugen und Organisatoren.' });
  next();
}

/**
 * CSRF protection for cookie-authenticated APIs: state-changing requests must carry a
 * custom header, which cross-site forms cannot set without a CORS preflight.
 */
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'ringo') return res.status(403).json({ error: 'Ungültige Anfrage.' });
  next();
}

// ---------- Simple in-memory rate limiting ----------

const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, reset: now + windowMs };
  if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
  b.n++;
  buckets.set(key, b);
  if (buckets.size > 10000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return b.n <= max;
}

export function limit(name, max, windowMs) {
  return (req, res, next) => {
    if (!rateLimit(`${name}:${req.ip}`, max, windowMs)) {
      return res.status(429).json({ error: 'Zu viele Versuche. Bitte warte einen Moment.' });
    }
    next();
  };
}
