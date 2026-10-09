import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { q } from './db.js';
import { loadIdentity, csrfGuard, setCookie, requireUser } from './auth.js';
import { pub, serveMedia } from './routes/public.js';
import { couple } from './routes/couple.js';
import { guest } from './routes/guest.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'false' ? false : 1);

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' blob: data:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  });
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(loadIdentity);

// ---------- APIs ----------
app.use('/api', csrfGuard);
app.use('/api', pub);
app.use('/api/w/:wid', couple);
app.use('/api/g', guest);
app.get('/media/:wid/:file', serveMedia);

// ---------- Pages ----------
const pub_dir = path.join(config.root, 'public');
const page = (file) => (_req, res) => res.sendFile(path.join(pub_dir, file));

/** Personal invitation link: remembers the guest in a cookie, then opens the guest app. */
app.get('/e/:token', (req, res) => {
  const g = q.get('SELECT id FROM guests WHERE token = ?', req.params.token);
  if (!g) return res.status(404).sendFile(path.join(pub_dir, 'link-ungueltig.html'));
  setCookie(res, 'hb_guest', req.params.token, 400);
  res.redirect('/gast');
});

app.get('/', page('index.html'));
app.get('/gast', page('gast.html'));
app.get('/foto/:slug', page('foto.html'));
app.get('/wand/:slug', page('wand.html'));
app.get('/betreiber', page('betreiber.html'));
app.get('/datenschutz', page('datenschutz.html'));
app.get(['/verwaltung', '/verwaltung/*'], page('verwaltung.html'));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/require-login', requireUser, (_req, res) => res.json({ ok: true }));

// Face recognition runs entirely in the browser; library and models are served locally (no CDN).
const faceApi = path.join(config.root, 'node_modules', '@vladmandic', 'face-api');
app.use('/vendor/face-api', express.static(path.join(faceApi, 'dist'), { maxAge: '30d' }));
app.use('/vendor/face-models', express.static(path.join(faceApi, 'model'), { maxAge: '30d' }));

// Code and styles are revalidated on every load (cheap 304 via ETag), so updates reach guests immediately;
// fonts and images may be cached for a day.
app.use(express.static(pub_dir, {
  index: false,
  setHeaders: (res, file) => {
    res.setHeader('Cache-Control', /\.(js|css|html|webmanifest)$/.test(file) ? 'no-cache' : 'public, max-age=86400');
  },
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unbekannte Anfrage.' }));

// Errors (incl. multer upload errors) as JSON for API calls.
app.use((err, req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status === 500) console.error(err);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'Die Datei ist zu groß.' : status === 500 ? 'Da ist etwas schiefgelaufen.' : err.message;
  if (req.path.startsWith('/api')) return res.status(status).json({ error: message });
  res.status(status).send(message);
});

export default app;

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(config.root, 'server', 'index.js')) {
  app.listen(config.port, () => {
    console.log(`Ringo läuft auf ${config.baseUrl}  (Daten: ${config.dataDir})`);
    if (!config.ai.enabled) console.log('Hinweis: KI-Funktionen sind aus (ANTHROPIC_API_KEY nicht gesetzt).');
  });
}
