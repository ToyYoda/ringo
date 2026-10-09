// Browser checks for features that only work client-side: image processing + upload,
// on-device face detection under the CSP, and audio/video recording for the guestbook.
//   node tests/e2e-interactive.mjs    (server + demo data must be running)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import puppeteer from 'puppeteer-core';
import { q } from '../server/db.js';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const user = q.get("SELECT id FROM users WHERE email = 'demo@ringo.test'");
const w = q.get('SELECT * FROM weddings WHERE owner_id = ?', user.id);
const anna = q.get("SELECT token FROM guests WHERE wedding_id = ? AND first_name = 'Anna'", w.id);
const problems = [];
const ok = (m) => console.log('✓', m);

// A real PNG photo on disk for the file inputs (gradient, 1600x1000).
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(wd, ht) {
  const raw = Buffer.alloc((wd * 3 + 1) * ht);
  for (let y = 0; y < ht; y++) for (let x = 0; x < wd; x++) { const i = y * (wd * 3 + 1) + 1 + x * 3; raw[i] = (x * 255) / wd; raw[i + 1] = (y * 255) / ht; raw[i + 2] = 140; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(wd, 0); ihdr.writeUInt32BE(ht, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const imgPath = path.join(os.tmpdir(), 'hb-test-foto.png');
fs.writeFileSync(imgPath, png(1600, 1000));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => problems.push(`JS: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`Konsole: ${m.text()}`); });

// 1. QR upload page: pick a file → browser resizes → upload succeeds
const before = q.get('SELECT COUNT(*) n FROM photos WHERE wedding_id = ?', w.id).n;
await page.goto(`${BASE}/foto/${w.slug}?k=${w.upload_key}`, { waitUntil: 'networkidle2' });
await page.type('input[type=text]', 'Testgast');
const inputs = await page.$$('input[type=file]');
await inputs[1].uploadFile(imgPath);
await page.waitForFunction(() => document.body.innerText.includes('hochgeladen'), { timeout: 60000 }).catch(() => problems.push('QR-Upload: keine Erfolgsmeldung'));
const p = q.get('SELECT * FROM photos WHERE wedding_id = ? ORDER BY id DESC LIMIT 1', w.id);
if (q.get('SELECT COUNT(*) n FROM photos WHERE wedding_id = ?', w.id).n !== before + 1) problems.push('QR-Upload: Foto nicht gespeichert');
else {
  ok(`QR-Upload: ${p.width}x${p.height}, Schärfe ${p.quality}, Hash ${p.ahash ? 'ja' : 'nein'}, Gesichter-Feld ${p.faces === null ? 'leer' : p.faces.length + ' Zeichen'}, Name „${p.uploader_name}“`);
  if (p.width !== 1600 || !p.thumb || !p.ahash || p.quality == null) problems.push('QR-Upload: Metadaten unvollständig');
}

// 2. On-device face detection: models load and run under the CSP
await page.goto(`${BASE}/e/${anna.token}`, { waitUntil: 'networkidle2' });
const face = await page.evaluate(async () => {
  const { faceDescriptors } = await import('/js/common.js');
  const c = document.createElement('canvas'); c.width = 400; c.height = 300;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#c99'; ctx.fillRect(0, 0, 400, 300);
  const t0 = performance.now();
  try { const d = await faceDescriptors(c); return { ok: true, faces: d.length, ms: Math.round(performance.now() - t0) }; } catch (e) { return { ok: false, err: String(e) }; }
});
if (!face.ok) problems.push(`Gesichtserkennung: ${face.err}`);
else ok(`Gesichtserkennung lädt und läuft lokal (${face.faces} Gesichter in Testbild, ${face.ms} ms inkl. Modell-Laden)`);

// 3. Guestbook: video and audio recording with fake camera/microphone
for (const kind of ['video', 'audio']) {
  const count = q.get('SELECT COUNT(*) n FROM guestbook WHERE wedding_id = ?', w.id).n;
  await page.goto(`${BASE}/gast#gaestebuch`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('button.card', { timeout: 10000 });
  await page.evaluate((k) => [...document.querySelectorAll('button.card')].find((b) => b.textContent.includes(k === 'video' ? 'Video' : 'Sprach')).click(), kind);
  await page.waitForFunction(() => [...document.querySelectorAll('.modal button')].some((b) => b.textContent === 'Aufnahme starten'), { timeout: 10000 });
  const click = (label) => page.evaluate((l) => [...document.querySelectorAll('.modal button')].find((b) => b.textContent.startsWith(l)).click(), label);
  await click('Aufnahme starten');
  await new Promise((r) => setTimeout(r, 2500));
  await click('Stopp');
  await page.waitForFunction(() => [...document.querySelectorAll('.modal button')].some((b) => b.textContent === 'Absenden' && !b.classList.contains('hidden')), { timeout: 10000 });
  await click('Absenden');
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 30000 }).catch(() => problems.push(`Gästebuch ${kind}: Dialog blieb offen`));
  const row = q.get('SELECT * FROM guestbook WHERE wedding_id = ? ORDER BY id DESC LIMIT 1', w.id);
  if (q.get('SELECT COUNT(*) n FROM guestbook WHERE wedding_id = ?', w.id).n !== count + 1 || row.kind !== kind) problems.push(`Gästebuch ${kind}: nicht gespeichert`);
  else ok(`Gästebuch-${kind === 'video' ? 'Video' : 'Sprachnachricht'} aufgenommen und gespeichert (${Math.round(row.size_bytes / 1024)} KB, ${row.file})`);
}

await browser.close();
if (problems.length) { console.log(`\n${problems.length} Problem(e):\n${problems.join('\n')}`); process.exit(1); }
console.log('\nAlle interaktiven Prüfungen bestanden.');
