// API tests against an isolated temporary data directory: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-test-'));
process.env.DATA_DIR = dataDir;
process.env.DEFAULT_PLAN = 'premium';
process.env.OPERATOR_PASSWORD = 'op-secret';
delete process.env.ANTHROPIC_API_KEY;

const { default: app } = await import('../server/index.js');
const { q, db } = await import('../server/db.js');
const { epcPayload } = await import('../server/mail.js');
const { autoSeat } = await import('../server/seating.js');

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

/** Minimal cookie-keeping client. */
function client() {
  const jar = new Map();
  const call = async (method, url, body, { raw, headers = {}, csrf = true } = {}) => {
    const h = { ...headers };
    if (csrf) h['X-Requested-With'] = 'ringo';
    if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload = body;
    if (body !== undefined && !(body instanceof FormData)) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    if (raw) return res;
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  return { call, jar };
}

const tinyPng = () => {
  // 1x1 PNG
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 200, 100, 120]))), chunk('IEND', Buffer.alloc(0))]);
};
const photoForm = (extra = {}) => {
  const f = new FormData();
  f.append('file', new Blob([tinyPng()], { type: 'image/png' }), 'a.png');
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return f;
};

const couple = client();
let W; // wedding row
let guestA, guestB; // guest ids
const annaClient = client();
const benClient = client();

test('signup creates account, wedding and main event', async () => {
  const r = await couple.call('POST', '/api/auth/signup', { email: 'paar@example.com', password: 'geheim123', partner1: 'Lena', partner2: 'Jonas', wedding_date: '2030-06-13' });
  assert.equal(r.status, 200);
  W = q.get('SELECT * FROM weddings WHERE id = ?', r.data.wedding_id);
  assert.equal(W.plan, 'premium');
  assert.match(W.slug, /^lena-und-jonas/);
  const ev = await couple.call('GET', `/api/w/${W.id}/events`);
  assert.equal(ev.data.length, 1);
  assert.equal(ev.data[0].is_main, 1);
});

test('duplicate signup and wrong login are rejected', async () => {
  const dup = await client().call('POST', '/api/auth/signup', { email: 'PAAR@example.com', password: 'geheim123', partner1: 'A', partner2: 'B' });
  assert.equal(dup.status, 400);
  const bad = await client().call('POST', '/api/auth/login', { email: 'paar@example.com', password: 'falsch' });
  assert.equal(bad.status, 401);
});

test('state-changing requests without CSRF header are refused', async () => {
  const r = await couple.call('POST', `/api/w/${W.id}/events`, { title: 'X', starts_at: '2030-06-12T19:00' }, { csrf: false });
  assert.equal(r.status, 403);
});

test('another account cannot access the wedding', async () => {
  const other = client();
  await other.call('POST', '/api/auth/signup', { email: 'fremd@example.com', password: 'geheim123', partner1: 'X', partner2: 'Y' });
  const r = await other.call('GET', `/api/w/${W.id}/guests`);
  assert.equal(r.status, 404);
});

test('events, guests and CSV import', async () => {
  const polter = await couple.call('POST', `/api/w/${W.id}/events`, { title: 'Polterabend', starts_at: '2030-06-12T19:00' });
  assert.equal(polter.status, 200);
  const a = await couple.call('POST', `/api/w/${W.id}/guests`, { first_name: 'Anna', last_name: 'Berger', role: 'witness', plus_one_allowed: true });
  guestA = a.data.id;
  const main = q.get('SELECT id FROM events WHERE wedding_id = ? AND is_main = 1', W.id);
  const b = await couple.call('POST', `/api/w/${W.id}/guests`, { first_name: 'Ben', event_ids: [main.id] });
  guestB = b.data.id;
  const csv = 'Vorname;Nachname;E-Mail;Gruppe;Seite;Begleitung\nJürgen;Müller;j@example.com;Kollegen;Bräutigam;ja\n"Maria, die Zweite";Schulz;;Familie;Braut;nein\n';
  const imp = await couple.call('POST', `/api/w/${W.id}/guests/import`, { csv });
  assert.equal(imp.data.imported, 2);
  const list = (await couple.call('GET', `/api/w/${W.id}/guests`)).data;
  const j = list.find((g) => g.first_name === 'Jürgen');
  assert.equal(j.side, 'partner2');
  assert.equal(j.plus_one_allowed, 1);
  assert.equal(j.invitations.length, 2);
  assert.ok(list.find((g) => g.first_name === 'Maria, die Zweite'));
  assert.equal(list.find((g) => g.id === guestB).invitations.length, 1);
});

test('invitation link sets the guest cookie and opens the guest app', async () => {
  const token = q.get('SELECT token FROM guests WHERE id = ?', guestA).token;
  const res = await annaClient.call('GET', `/e/${token}`, undefined, { raw: true });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/gast');
  const me = await annaClient.call('GET', '/api/g/me');
  assert.equal(me.data.me.first_name, 'Anna');
  assert.equal(me.data.me.team, true);
  assert.equal(me.data.me.token, undefined, 'token must not be echoed');
  assert.equal(me.data.events.length, 2);
  const tokenB = q.get('SELECT token FROM guests WHERE id = ?', guestB).token;
  await benClient.call('GET', `/e/${tokenB}`, undefined, { raw: true });
  const bad = await client().call('GET', '/e/doesnotexist', undefined, { raw: true });
  assert.equal(bad.status, 404);
});

test('RSVP with plus-one, meal and allergies', async () => {
  const me = (await annaClient.call('GET', '/api/g/me')).data;
  const r = await annaClient.call('POST', '/api/g/rsvp', {
    responses: me.events.map((e) => ({ event_id: e.id, rsvp: 'yes', plus_one: true })),
    plus_one_name: 'Tom Berger', meal: 'Vegetarisch', allergies: 'Nüsse', needs_stay: true,
  });
  assert.equal(r.status, 200);
  const g = q.get('SELECT * FROM guests WHERE id = ?', guestA);
  assert.equal(g.plus_one_name, 'Tom Berger');
  assert.equal(g.allergies, 'Nüsse');
  const inv = q.all('SELECT * FROM invitations WHERE guest_id = ?', guestA);
  assert.ok(inv.every((i) => i.rsvp === 'yes' && i.plus_one === 1));
  const ov = (await couple.call('GET', `/api/w/${W.id}`)).data;
  assert.equal(ov.stats.headcount, 2);
});

test('program: guest request, surprise visibility, team approval', async () => {
  const main = q.get('SELECT id FROM events WHERE wedding_id = ? AND is_main = 1', W.id);
  const req = await benClient.call('POST', '/api/g/program', { event_id: main.id, title: 'Gitarrensong', start_time: '21:00' });
  assert.equal(req.status, 200);
  assert.equal(q.get('SELECT status FROM program_items WHERE id = ?', req.data.id).status, 'requested');
  const surprise = await annaClient.call('POST', '/api/g/program', { event_id: main.id, title: 'Geheimer Film', surprise: true, start_time: '22:00' });
  assert.equal(q.get('SELECT status FROM program_items WHERE id = ?', surprise.data.id).status, 'confirmed', 'team items are confirmed directly');
  const coupleView = (await couple.call('GET', `/api/w/${W.id}/program`)).data;
  assert.ok(!coupleView.some((p) => p.surprise), 'couple must not see surprises');
  const benView = (await benClient.call('GET', '/api/g/program')).data;
  assert.ok(!benView.some((p) => p.surprise), 'regular guest must not see surprises');
  assert.ok(benView.some((p) => p.title === 'Gitarrensong'), 'guest sees own request');
  assert.equal((await benClient.call('PATCH', `/api/g/program/${req.data.id}`, { status: 'confirmed' })).status, 403);
  assert.equal((await annaClient.call('PATCH', `/api/g/program/${req.data.id}`, { status: 'confirmed' })).status, 200);
  assert.equal((await couple.call('DELETE', `/api/w/${W.id}/program/${surprise.data.id}`)).status, 200);
  assert.ok(q.get('SELECT id FROM program_items WHERE id = ?', surprise.data.id), 'couple cannot delete hidden surprise');
});

test('live state only shows events the guest is invited to', async () => {
  const polter = q.get("SELECT id FROM events WHERE wedding_id = ? AND title = 'Polterabend'", W.id);
  await couple.call('POST', `/api/w/${W.id}/program`, { event_id: polter.id, title: 'Porzellan', start_time: '19:30' });
  const ben = (await benClient.call('GET', '/api/g/live')).data;
  assert.notEqual(ben.next?.title, 'Porzellan');
  const anna = (await annaClient.call('GET', '/api/g/live')).data;
  assert.equal(anna.next?.title, 'Porzellan');
});

test('QR upload, moderation and media access control', async () => {
  const anon = client();
  const noKey = await anon.call('POST', `/api/foto/${W.slug}/upload?k=wrong`, photoForm({ name: 'Oma' }));
  assert.equal(noKey.status, 404);
  const up = await anon.call('POST', `/api/foto/${W.slug}/upload?k=${W.upload_key}`, photoForm({ name: 'Oma Gisela', quality: '120', ahash: '1'.repeat(64) }));
  assert.equal(up.status, 200);
  const p = q.get('SELECT * FROM photos WHERE id = ?', up.data.id);
  assert.equal(p.uploader_name, 'Oma Gisela');
  assert.equal(p.approved, 1);
  assert.equal((await anon.call('GET', `/media/${W.id}/${p.file}`, undefined, { raw: true })).status, 403, 'anonymous without key');
  assert.equal((await anon.call('GET', `/media/${W.id}/${p.file}?k=${W.upload_key}`, undefined, { raw: true })).status, 403, 'upload key only unlocks the cover');
  assert.equal((await anon.call('GET', `/media/${W.id}/${p.file}?k=${W.wall_key}`, undefined, { raw: true })).status, 200, 'wall key');
  assert.equal((await annaClient.call('GET', `/media/${W.id}/${p.file}`, undefined, { raw: true })).status, 200, 'guest cookie');
  assert.equal((await couple.call('GET', `/media/${W.id}/..%2F..%2Fringo.db`, undefined, { raw: true })).status, 404, 'no path traversal');

  await couple.call('PATCH', `/api/w/${W.id}`, { moderate_photos: 1 });
  const up2 = await annaClient.call('POST', '/api/g/photos', photoForm());
  assert.equal(up2.data.approved, false);
  const benSees = (await benClient.call('GET', '/api/g/photos')).data;
  assert.ok(!benSees.some((x) => x.id === up2.data.id), 'unapproved photo hidden from others');
  const annaSees = (await annaClient.call('GET', '/api/g/photos')).data;
  assert.ok(annaSees.some((x) => x.id === up2.data.id), 'uploader sees own pending photo');
  assert.equal((await benClient.call('DELETE', `/api/g/photos/${up2.data.id}`)).status, 403);
  await couple.call('PATCH', `/api/w/${W.id}/photos/${up2.data.id}`, { approved: 1 });
  assert.ok((await benClient.call('GET', '/api/g/photos')).data.some((x) => x.id === up2.data.id));
});

test('wall endpoint requires the wall key', async () => {
  assert.equal((await client().call('GET', `/api/wand/${W.slug}?k=${W.upload_key}`)).status, 403);
  const ok = await client().call('GET', `/api/wand/${W.slug}?k=${W.wall_key}`);
  assert.equal(ok.status, 200);
  assert.ok(ok.data.photos.length >= 2);
  assert.ok(ok.data.uploadUrl.includes(W.upload_key));
});

test('face search: validates descriptors and matches', async () => {
  const desc = Array.from({ length: 128 }, (_, i) => Math.sin(i) / 10);
  await couple.call('PATCH', `/api/w/${W.id}`, { face_search: 1 });
  const up = await annaClient.call('POST', '/api/g/photos', photoForm({ faces: JSON.stringify([desc]) }));
  await couple.call('PATCH', `/api/w/${W.id}/photos/${up.data.id}`, { approved: 1 });
  assert.equal((await benClient.call('POST', '/api/g/face-search', { descriptor: [1, 2, 3] })).status, 400);
  const near = desc.map((x) => x + 0.01);
  const r = await benClient.call('POST', '/api/g/face-search', { descriptor: near, remember: true });
  assert.ok(r.data.matches.some((m) => m.id === up.data.id));
  assert.ok(q.get('SELECT face_descriptor FROM guests WHERE id = ?', guestB).face_descriptor);
  await benClient.call('DELETE', '/api/g/face');
  assert.equal(q.get('SELECT face_descriptor FROM guests WHERE id = ?', guestB).face_descriptor, null);
});

test('gifts: fund pledges with GiroCode, item quantity is enforced', async () => {
  await couple.call('PATCH', `/api/w/${W.id}`, { gift_iban: 'DE02 1203 0000 0000 2020 51', gift_account_holder: 'Lena Berger' });
  const fund = await couple.call('POST', `/api/w/${W.id}/gifts`, { kind: 'fund', title: 'Reise', price_cents: 100000 });
  const item = await couple.call('POST', `/api/w/${W.id}/gifts`, { kind: 'item', title: 'Gläser', price_cents: 3000, quantity: 2 });
  const p = await benClient.call('POST', `/api/g/gifts/${fund.data.id}/pledge`, { amount_eur: 50 });
  assert.equal(p.status, 200);
  assert.ok(p.data.epc_svg.startsWith('<svg'));
  assert.equal((await benClient.call('POST', `/api/g/gifts/${fund.data.id}/pledge`, { amount_eur: 0 })).status, 400);
  assert.equal((await benClient.call('POST', `/api/g/gifts/${item.data.id}/pledge`, { units: 2 })).status, 200);
  assert.equal((await annaClient.call('POST', `/api/g/gifts/${item.data.id}/pledge`, { units: 1 })).status, 400, 'already taken');
  const anon = await annaClient.call('POST', `/api/g/gifts/${fund.data.id}/pledge`, { amount_eur: 20, anonymous: true });
  assert.equal(q.get('SELECT name FROM pledges WHERE id = ?', anon.data.id).name, 'Anonym');
});

test('EPC payload follows the GiroCode format', () => {
  const p = epcPayload({ name: 'Lena Berger', iban: 'de02 1203 0000 0000 2020 51', amountCents: 5000, text: 'Hochzeit' }).split('\n');
  assert.deepEqual(p.slice(0, 4), ['BCD', '002', '1', 'SCT']);
  assert.equal(p[6], 'DE02120300000000202051');
  assert.equal(p[7], 'EUR50.00');
});

test('seating assistant respects together/apart rules and capacity', () => {
  const guests = [1, 2, 3, 4, 5, 6].map((id) => ({ id, group_label: id <= 3 ? 'A' : 'B', seats: 1 }));
  const rules = [{ guest_a: 1, guest_b: 4, kind: 'together' }, { guest_a: 2, guest_b: 5, kind: 'apart' }];
  const { assignment, unplaced } = autoSeat(guests, [{ id: 10, capacity: 3 }, { id: 11, capacity: 3 }], rules);
  assert.equal(unplaced.length, 0);
  assert.equal(assignment.get(1), assignment.get(4));
  assert.notEqual(assignment.get(2), assignment.get(5));
  const counts = [...assignment.values()].reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
  assert.ok([...counts.values()].every((n) => n <= 3));
});

test('seating endpoint assigns attending guests', async () => {
  await couple.call('POST', `/api/w/${W.id}/tables`, { count: 2, capacity: 6 });
  const r = await couple.call('POST', `/api/w/${W.id}/seating/auto`, {});
  assert.equal(r.status, 200);
  assert.ok(r.data.placed >= 2);
  const seat = (await annaClient.call('GET', '/api/g/seat')).data;
  assert.ok(seat.table?.name);
});

test('questions: FAQ fallback answers, unknown questions are forwarded', async () => {
  await couple.call('POST', `/api/w/${W.id}/faqs`, { question: 'Wo kann ich parken?', answer: 'Im Parkhaus Kornmarkt.' });
  const a = await benClient.call('POST', '/api/g/ask', { question: 'Gibt es Parkplätze?' });
  assert.equal(a.data.source, 'faq');
  const b = await benClient.call('POST', '/api/g/ask', { question: 'Darf mein Hund mitkommen?' });
  assert.equal(b.data.forwarded, true);
  const qs = (await couple.call('GET', `/api/w/${W.id}/questions`)).data;
  assert.ok(qs.some((x) => x.question.includes('Hund')));
});

test('team area and speech outline are restricted to the team', async () => {
  await benClient.call('POST', '/api/g/anecdotes', { text: 'Die beiden haben sich im Zug kennengelernt.' });
  assert.equal((await benClient.call('GET', '/api/g/team')).status, 403);
  const t = await annaClient.call('GET', '/api/g/team');
  assert.equal(t.data.anecdotes.length, 1);
  const s = await annaClient.call('POST', '/api/g/team/speech', {});
  assert.equal(s.data.source, 'template');
  assert.match(s.data.text, /Zug/);
});

test('guestbook: text works, media needs premium', async () => {
  const f = new FormData(); f.append('text', 'Alles Gute!');
  assert.equal((await benClient.call('POST', '/api/g/guestbook', f)).status, 200);
  q.run("UPDATE weddings SET plan = 'free' WHERE id = ?", W.id);
  const m = new FormData(); m.append('file', new Blob([Buffer.alloc(100)], { type: 'audio/webm' }), 'a.webm');
  assert.equal((await benClient.call('POST', '/api/g/guestbook', m)).status, 402);
  const v = new FormData(); v.append('file', new Blob([Buffer.alloc(100)], { type: 'video/mp4' }), 'v.mp4');
  assert.equal((await benClient.call('POST', '/api/g/photos', v)).status, 402, 'videos need premium');
  q.run("UPDATE weddings SET plan = 'premium' WHERE id = ?", W.id);
});

test('recordings with codec lists in the MIME type are accepted (Chrome MediaRecorder)', async () => {
  const f = new FormData();
  f.append('file', new Blob([Buffer.alloc(500)], { type: 'video/mp4;codecs=vp9,opus' }), 'nachricht.mp4');
  const r = await benClient.call('POST', '/api/g/guestbook', f);
  assert.equal(r.status, 200);
  const row = q.get('SELECT * FROM guestbook WHERE id = ?', r.data.id);
  assert.equal(row.kind, 'video');
  assert.match(row.file, /\.mp4$/);
});

test('design template: couple chooses, guests and wall receive it, unknown ids are rejected', async () => {
  assert.equal((await couple.call('PATCH', `/api/w/${W.id}`, { theme: 'gibtsnicht' })).status, 400);
  assert.equal((await couple.call('PATCH', `/api/w/${W.id}`, { theme: 'wunderkerzen' })).status, 200);
  assert.equal((await benClient.call('GET', '/api/g/me')).data.wedding.theme, 'wunderkerzen');
  assert.equal((await client().call('GET', `/api/foto/${W.slug}?k=${W.upload_key}`)).data.theme, 'wunderkerzen');
  assert.equal((await client().call('GET', `/api/wand/${W.slug}?k=${W.wall_key}`)).data.theme, 'wunderkerzen');
  await couple.call('PATCH', `/api/w/${W.id}`, { theme: 'klassisch' });
});

test('couple logo: upload replaces the lettering data, upload key may show it, removal works', async () => {
  const r = await couple.call('POST', `/api/w/${W.id}/logo`, photoForm());
  assert.equal(r.status, 200);
  const logo = r.data.logo_path;
  assert.equal((await benClient.call('GET', '/api/g/me')).data.wedding.logo_path, logo);
  assert.equal((await client().call('GET', `/api/foto/${W.slug}?k=${W.upload_key}`)).data.logo_path, logo);
  assert.equal((await client().call('GET', `/media/${W.id}/${logo}?k=${W.upload_key}`, undefined, { raw: true })).status, 200, 'upload page may show the logo');
  const svg = new FormData(); svg.append('file', new Blob(['<svg onload="alert(1)"/>'], { type: 'image/svg+xml' }), 'x.svg');
  assert.equal((await couple.call('POST', `/api/w/${W.id}/logo`, svg)).status, 400, 'SVG (script risk) is rejected');
  assert.equal((await couple.call('GET', `/api/w/${W.id}/tischkarten.pdf`, undefined, { raw: true })).status, 200);
  assert.equal((await couple.call('DELETE', `/api/w/${W.id}/logo`)).status, 200);
  assert.equal((await benClient.call('GET', '/api/g/me')).data.wedding.logo_path, null);
});

test('uploads reject unsupported file types', async () => {
  const f = new FormData(); f.append('file', new Blob(['<script>'], { type: 'text/html' }), 'x.html');
  assert.equal((await benClient.call('POST', '/api/g/photos', f)).status, 400);
});

test('exports render', async () => {
  for (const f of ['tischkarten.pdf', 'gaesteliste.pdf', 'dankeskarten.pdf', 'aushang.pdf', 'guests/export.csv', 'archiv.zip']) {
    const r = await couple.call('GET', `/api/w/${W.id}/${f}`, undefined, { raw: true });
    assert.equal(r.status, 200, f);
    assert.ok((await r.arrayBuffer()).byteLength > 100, f);
  }
});

test('operator console: password protected plan switch', async () => {
  const op = client();
  assert.equal((await op.call('GET', '/api/betreiber/weddings')).status, 401);
  assert.equal((await op.call('POST', '/api/betreiber/login', { password: 'nein' })).status, 401);
  assert.equal((await op.call('POST', '/api/betreiber/login', { password: 'op-secret' })).status, 200);
  const list = (await op.call('GET', '/api/betreiber/weddings')).data;
  assert.ok(list.some((w) => w.id === W.id));
  await op.call('POST', `/api/betreiber/weddings/${W.id}/plan`, { plan: 'free' });
  assert.equal(q.get('SELECT plan FROM weddings WHERE id = ?', W.id).plan, 'free');
});

test('deleting the wedding removes all data and media', async () => {
  assert.equal((await couple.call('DELETE', `/api/w/${W.id}`, { confirm: 'falsch' })).status, 400);
  assert.equal((await couple.call('DELETE', `/api/w/${W.id}`, { confirm: W.slug })).status, 200);
  assert.equal(q.get('SELECT COUNT(*) n FROM guests WHERE wedding_id = ?', W.id).n, 0);
  assert.equal(fs.existsSync(path.join(dataDir, 'media', String(W.id))), false);
  assert.equal((await annaClient.call('GET', '/api/g/me')).status, 401);
});
