// Renders the screenshots used in docs/ and the customer brochure (demo data must be loaded).
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { q } from '../server/db.js';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('docs', 'img');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const user = q.get("SELECT id FROM users WHERE email = 'demo@ringo.test'");
const w = q.get('SELECT * FROM weddings WHERE owner_id = ?', user.id);
const anna = q.get("SELECT token FROM guests WHERE wedding_id = ? AND first_name = 'Anna'", w.id).token;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function shoot(page, url, file, ms = 1200) {
  await page.goto(url, { waitUntil: 'networkidle2' });
  await wait(ms);
  await page.screenshot({ path: path.join(OUT, `${file}.png`) });
  console.log('✓', file);
}

const phone = await browser.newPage();
await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await phone.goto(`${BASE}/e/${anna}`, { waitUntil: 'networkidle2' });
for (const [hash, file] of [['start', 'gast-start'], ['zusage', 'gast-zusage'], ['ablauf', 'gast-ablauf'], ['fotos', 'gast-fotos'], ['gaestebuch', 'gast-gaestebuch'], ['geschenke', 'gast-geschenke'], ['platz', 'gast-platz'], ['infos', 'gast-infos'], ['team/programm', 'gast-team']]) {
  await shoot(phone, `${BASE}/gast#${hash}`, file);
}
const qr = await browser.newPage();
await qr.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
await shoot(qr, `${BASE}/foto/${w.slug}?k=${w.upload_key}`, 'qr-upload');

const desk = await browser.newPage();
await desk.setViewport({ width: 1366, height: 860, deviceScaleFactor: 1.5 });
await desk.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
await desk.evaluate(() => fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ringo' }, body: JSON.stringify({ email: 'demo@ringo.test', password: 'demo1234' }) }));
for (const [hash, file] of [['uebersicht', 'admin-uebersicht'], ['gaeste', 'admin-gaeste'], ['rueckmeldungen', 'admin-rueckmeldungen'], ['ablauf', 'admin-ablauf'], ['fotos', 'admin-fotos'], ['sitzplan', 'admin-sitzplan'], ['drucken', 'admin-drucken'], ['geschenke', 'admin-geschenke']]) {
  await shoot(desk, `${BASE}/verwaltung#${hash}`, file);
}
const wall = await browser.newPage();
await wall.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
await shoot(wall, `${BASE}/wand/${w.slug}?k=${w.wall_key}`, 'fotowand', 3000);
await browser.close();
