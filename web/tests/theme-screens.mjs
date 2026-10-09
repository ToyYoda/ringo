// Screenshots of every design template (guest app, QR upload, live wall), switched through the couple API.
//   node tests/theme-screens.mjs <outDir> [--thumbs]
// --thumbs additionally writes the picker thumbnails to public/img/themes/<id>.jpg
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { q } from '../server/db.js';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = process.argv[2] || 'theme-screens';
const THUMBS = process.argv.includes('--thumbs');
const THEMES = ['klassisch', 'zeitung', 'sofortbild', 'konfetti', 'standesamt', 'ballnacht', 'wunderkerzen', 'atelier', 'bluetenmeer'];
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));

const user = q.get("SELECT id FROM users WHERE email = 'demo@ringo.test'");
const w = q.get('SELECT * FROM weddings WHERE owner_id = ?', user.id);
const anna = q.get("SELECT token FROM guests WHERE wedding_id = ? AND first_name = 'Anna'", w.id).token;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const problems = [];
const watch = (page, name) => {
  page.on('pageerror', (e) => problems.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${name}] ${m.text()}`); });
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const admin = await browser.newPage();
await admin.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
const call = (method, url, body) => admin.evaluate(async (m, u, b) => (await fetch(u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ringo' }, body: b ? JSON.stringify(b) : undefined })).status, method, url, body);
await call('POST', '/api/auth/login', { email: 'demo@ringo.test', password: 'demo1234' });

for (const theme of THEMES) {
  const status = await call('PATCH', `/api/w/${w.id}`, { theme });
  if (status !== 200) problems.push(`[${theme}] PATCH ${status}`);
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  watch(p, theme);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto(`${BASE}/e/${anna}`, { waitUntil: 'networkidle2' });
  await p.evaluate(() => document.fonts.ready);
  await wait(500);
  await p.screenshot({ path: path.join(OUT, `${theme}-1-start.png`) });
  for (const [hash, n] of [['ablauf', 2], ['fotos', 3], ['zusage', 4]]) {
    await p.goto(`${BASE}/gast#${hash}`, { waitUntil: 'networkidle2' });
    await wait(700);
    await p.screenshot({ path: path.join(OUT, `${theme}-${n}-${hash}.png`) });
  }
  await p.goto(`${BASE}/foto/${w.slug}?k=${w.upload_key}`, { waitUntil: 'networkidle2' });
  await wait(500);
  await p.screenshot({ path: path.join(OUT, `${theme}-5-upload.png`) });
  const wall = await ctx.newPage();
  watch(wall, `${theme}/wand`);
  await wall.setViewport({ width: 1280, height: 720 });
  await wall.goto(`${BASE}/wand/${w.slug}?k=${w.wall_key}`, { waitUntil: 'networkidle2' });
  await wait(2500);
  await wall.screenshot({ path: path.join(OUT, `${theme}-6-wand.png`) });
  if (THUMBS) {
    fs.mkdirSync('public/img/themes', { recursive: true });
    await p.goto(`${BASE}/gast#start`, { waitUntil: 'networkidle2' });
    await p.setViewport({ width: 390, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await wait(700);
    await p.screenshot({ path: `public/img/themes/${theme}.jpg`, type: 'jpeg', quality: 78 });
  }
  console.log('✓', theme);
  await ctx.close();
}
await call('PATCH', `/api/w/${w.id}`, { theme: 'klassisch' });
await browser.close();
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
