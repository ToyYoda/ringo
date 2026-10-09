// End-to-end smoke run in a real browser against a running server with the demo data:
//   npm run demo && npm start   (in another terminal)
//   node tests/e2e-screens.mjs [outDir]
// Visits every page as couple, guest, team member, QR uploader and wall; fails on JS errors.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { q } from '../server/db.js';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = process.argv[2] || path.resolve('tests', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));

const user = q.get("SELECT id FROM users WHERE email = 'demo@ringo.test'");
if (!user) throw new Error('Demo fehlt: npm run demo');
const w = q.get('SELECT * FROM weddings WHERE owner_id = ?', user.id);
const anna = q.get("SELECT token FROM guests WHERE wedding_id = ? AND first_name = 'Anna'", w.id);
const jan = q.get("SELECT token FROM guests WHERE wedding_id = ? AND first_name = 'Jan'", w.id);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const problems = [];

async function session(name, viewport) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (e) => problems.push(`[${name}] JS-Fehler: ${e.message}`));
  // Expected: the permission check below deliberately provokes a 403.
  const expected = (u) => u.includes('favicon') || u.endsWith('/api/g/team');
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|status of 403/.test(m.text())) problems.push(`[${name}] Konsole: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !expected(r.url())) problems.push(`[${name}] HTTP ${r.status()} ${r.url()}`); });
  return { ctx, page };
}

async function shot(page, file, url, wait = 900) {
  if (url) await page.goto(url, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: path.join(OUT, `${file}.png`), fullPage: false });
  console.log('✓', file);
}

const mobile = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const desktop = { width: 1280, height: 860, deviceScaleFactor: 1 };

// Landing
{
  const { ctx, page } = await session('landing', desktop);
  await shot(page, '01-landing', `${BASE}/`);
  await ctx.close();
}

// Couple
{
  const { ctx, page } = await session('brautpaar', desktop);
  await page.goto(`${BASE}/?login#anmelden`, { waitUntil: 'networkidle2' });
  await page.evaluate(async () => {
    await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ringo' }, body: JSON.stringify({ email: 'demo@ringo.test', password: 'demo1234' }) });
  });
  for (const [i, p] of ['uebersicht', 'termine', 'gaeste', 'rueckmeldungen', 'ablauf', 'nachrichten', 'fragen', 'fotos', 'gaestebuch', 'geschenke', 'sitzplan', 'drucken', 'einstellungen'].entries()) {
    await shot(page, `10-admin-${String(i).padStart(2, '0')}-${p}`, `${BASE}/verwaltung#${p}`);
  }
  // PDFs and exports must be generated without errors
  for (const f of ['tischkarten.pdf', 'aushang.pdf', 'aushang.pdf?typ=wand', 'gaesteliste.pdf', 'dankeskarten.pdf', 'fotobuch.pdf?max=10', 'guests/export.csv', 'archiv.zip']) {
    const res = await page.evaluate(async (u) => { const r = await fetch(u); const b = await r.arrayBuffer(); return { s: r.status, n: b.byteLength, t: r.headers.get('content-type') }; }, `/api/w/${w.id}/${f}`);
    if (res.s !== 200 || res.n < 200) problems.push(`[export] ${f}: ${res.s} (${res.n} Bytes)`);
    else console.log('✓ export', f, res.t, `${Math.round(res.n / 1024)} KB`);
  }
  await ctx.close();
}

// Guest: Anna (witness → team area)
{
  const { ctx, page } = await session('gast-anna', mobile);
  await page.goto(`${BASE}/e/${anna.token}`, { waitUntil: 'networkidle2' });
  await shot(page, '20-gast-start', null);
  for (const [i, p] of ['zusage', 'ablauf', 'fotos', 'gaestebuch', 'mehr', 'infos', 'geschenke', 'platz', 'meine', 'geschichte', 'team/programm', 'team/live', 'team/geschichten', 'team/rede'].entries()) {
    await shot(page, `2${String(i + 1).padStart(2, '0')}-gast-${p.replace('/', '-')}`, `${BASE}/gast#${p}`);
  }
  // FAQ assistant (keyword fallback without AI)
  const ans = await page.evaluate(async () => (await fetch('/api/g/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ringo' }, body: JSON.stringify({ question: 'Wo soll ich parken?' }) })).json());
  if (!ans.answer) problems.push(`[faq] keine Antwort auf Park-Frage: ${JSON.stringify(ans)}`);
  else console.log('✓ faq', ans.source);
  // Gift pledge returns a GiroCode
  const pledge = await page.evaluate(async () => {
    const g = await (await fetch('/api/g/gifts')).json();
    const fund = g.items.find((i) => i.kind === 'fund');
    return (await fetch(`/api/g/gifts/${fund.id}/pledge`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ringo' }, body: JSON.stringify({ amount_eur: 50 }) })).json();
  });
  if (!pledge.epc_svg?.startsWith('<svg')) problems.push('[geschenk] kein GiroCode');
  else console.log('✓ girocode');
  await ctx.close();
}

// Guest: Jan (only invited to the party, no team area)
{
  const { ctx, page } = await session('gast-jan', mobile);
  await page.goto(`${BASE}/e/${jan.token}`, { waitUntil: 'networkidle2' });
  await shot(page, '30-gast-jan-start', null);
  const prog = await page.evaluate(async () => (await fetch('/api/g/program')).json());
  if (prog.some((p) => p.surprise && !p.mine)) problems.push('[jan] sieht fremde Überraschungen!');
  const team = await page.evaluate(async () => (await fetch('/api/g/team')).status);
  if (team !== 403) problems.push(`[jan] Team-Bereich nicht geschützt (${team})`);
  else console.log('✓ rechte: Gast sieht keine Überraschungen, kein Team-Bereich');
  await ctx.close();
}

// QR upload page and wall (key-based, anonymous)
{
  const { ctx, page } = await session('qr', mobile);
  await shot(page, '40-qr-upload', `${BASE}/foto/${w.slug}?k=${w.upload_key}`);
  await ctx.close();
  const s2 = await session('wand', { width: 1280, height: 720 });
  await shot(s2.page, '41-fotowand', `${BASE}/wand/${w.slug}?k=${w.wall_key}`, 2500);
  await s2.ctx.close();
}

await browser.close();
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`\nAlles in Ordnung. Screenshots: ${OUT}`);
