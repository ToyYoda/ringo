// Creates (or recreates) a complete demo wedding: npm run demo
// Login: demo@ringo.test / demo1234
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { q, tx } from './db.js';
import { hashPassword, randomToken } from './auth.js';
import { mediaDir } from './media.js';
import { guestLink, uploadLink, wallLink } from './logic.js';
import { config } from './config.js';

const EMAIL = 'demo@ringo.test';

// ---------- tiny PNG writer for synthetic demo photos (no image libraries needed) ----------
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const i = y * (w * 3 + 1) + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
/** Warm "bokeh" scene: gradient sky + soft light circles, seeded for variety. */
function demoPhoto(seed, w = 900, h = 600) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const palettes = [[[142, 59, 90], [243, 220, 200]], [[63, 122, 82], [240, 230, 190]], [[94, 33, 57], [232, 201, 154]], [[60, 80, 130], [250, 210, 190]], [[184, 145, 90], [255, 245, 230]]];
  const [a, b] = palettes[seed % palettes.length];
  const circles = Array.from({ length: 14 }, () => ({ x: rnd() * w, y: rnd() * h * 0.8, r: 20 + rnd() * 70, k: 0.25 + rnd() * 0.5 }));
  return png(w, h, (x, y) => {
    const t = y / h;
    let r = a[0] * (1 - t) + b[0] * t, g = a[1] * (1 - t) + b[1] * t, bl = a[2] * (1 - t) + b[2] * t;
    for (const c of circles) {
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < c.r) { const f = c.k * (1 - d / c.r); r += (255 - r) * f; g += (240 - g) * f; bl += (220 - bl) * f; }
    }
    // a couple silhouette in the foreground
    const cx = w * 0.5, base = h * 0.95;
    const person = (px, ph) => Math.abs(x - px) < 22 + (y - (base - ph)) * 0.12 && y > base - ph && y < base;
    const head = (px, ph) => Math.hypot(x - px, y - (base - ph - 18)) < 20;
    if (person(cx - 32, 180) || person(cx + 32, 200) || head(cx - 32, 180) || head(cx + 32, 200)) { r *= 0.25; g *= 0.2; bl *= 0.22; }
    return [Math.min(255, r) | 0, Math.min(255, g) | 0, Math.min(255, bl) | 0];
  });
}

// ---------- seed ----------

// Also removes the demo account from before the rename (demo@hochzeitsbogen.de).
for (const old of q.all('SELECT id FROM users WHERE email IN (?, ?)', EMAIL, 'demo@hochzeitsbogen.de')) {
  for (const w of q.all('SELECT id FROM weddings WHERE owner_id = ?', old.id)) fs.rmSync(path.join(config.dataDir, 'media', String(w.id)), { recursive: true, force: true });
  q.run('DELETE FROM users WHERE id = ?', old.id);
}

const y = new Date().getFullYear() + 1;
const D = (m, d, t) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${t}`;

const result = tx(() => {
  const user = q.run('INSERT INTO users (email, pw_hash) VALUES (?, ?)', EMAIL, hashPassword('demo1234')).lastInsertRowid;
  const wid = q.run(
    `INSERT INTO weddings (slug, owner_id, partner1, partner2, wedding_date, motto, welcome_text, story_text, dresscode, rsvp_deadline, plan,
      upload_key, wall_key, moderate_photos, face_search, unplugged_ceremony, gift_iban, gift_account_holder, gift_paypal, gift_note, thanks_text)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'premium', ?,?, 0, 1, 1, ?,?,?,?,?)`,
    `lena-und-jonas-demo-${randomToken(3).toLowerCase()}`, user, 'Lena', 'Jonas', `${y}-06-13`, 'Zwei Herzen, ein Weg',
    'Wir freuen uns riesig, diesen Tag mit euch zu feiern! Hier findet ihr alles, was ihr wissen müsst – und später all die Fotos von euch.',
    'Kennengelernt haben wir uns im Regionalzug nach Heidelberg – Jonas hatte Lenas Platz, Lena hatte seinen Kaffee. Acht Jahre, zwei Umzüge und einen sehr eigenwilligen Kater später sagen wir Ja.',
    'Festlich, gerne in Sommerfarben. Bequeme Schuhe für die Tanzfläche!', `${y}-04-30`,
    randomToken(9), randomToken(9), 'DE02 1203 0000 0000 2020 51', 'Lena Berger', 'paypal.me/lenaundjonas',
    'Das größte Geschenk ist, dass ihr da seid. Wer uns trotzdem etwas schenken möchte: Wir sparen auf unsere Hochzeitsreise nach Portugal.',
    'Liebe/r {vorname},\n\ndanke, dass du unseren Tag so besonders gemacht hast! Wir denken noch lange an diesen Abend.\n\nAlles Liebe',
  ).lastInsertRowid;

  const ev = (title, start, loc, addr, notes, main = 0) => q.run('INSERT INTO events (wedding_id, title, starts_at, location, address, notes, is_main) VALUES (?,?,?,?,?,?,?)', wid, title, start, loc, addr, notes, main).lastInsertRowid;
  const polter = ev('Polterabend', D(6, 12, '19:00'), 'Garten der Familie Berger', 'Lindenweg 4, 69117 Heidelberg', 'Bringt altes Porzellan mit – kein Glas, kein Spiegel!');
  const standesamt = ev('Standesamt', D(6, 13, '11:00'), 'Rathaus Heidelberg', 'Marktplatz 10, 69117 Heidelberg', 'Im engsten Kreis.');
  const kirche = ev('Trauung', D(6, 13, '14:30'), 'Peterskirche', 'Plöck 70, 69117 Heidelberg', 'Parken am besten im Parkhaus Kornmarkt.');
  const feier = ev('Feier', D(6, 13, '17:30'), 'Gut Neuhof', 'Neuhofer Str. 1, 69118 Heidelberg', 'Shuttlebus ab Kirche um 17:00.', 1);

  const guests = [
    ['Anna', 'Berger', 'Familie Lena', 'partner1', 'witness', 1, '+4915112345601', 'Tom Berger'],
    ['Felix', 'Hartmann', 'Freunde Jonas', 'partner2', 'witness', 0, '+4915112345602', ''],
    ['Maria', 'Schulz', 'Familie Jonas', 'partner2', 'guest', 0, '', ''],
    ['Klaus', 'Schulz', 'Familie Jonas', 'partner2', 'guest', 0, '', ''],
    ['Sophie', 'Neumann', 'Nachbarn', 'both', 'organizer', 1, '+4915112345605', ''],
    ['Lukas', 'Wolf', 'Uni-Freunde', 'partner1', 'guest', 1, '', ''],
    ['Mia', 'Klein', 'Uni-Freunde', 'partner1', 'guest', 0, '', ''],
    ['Jan', 'Fischer', 'Kollegen Jonas', 'partner2', 'guest', 1, '', ''],
    ['Emma', 'Becker', 'Kollegen Jonas', 'partner2', 'guest', 0, '', ''],
    ['Paul', 'Richter', 'Familie Lena', 'partner1', 'guest', 0, '', ''],
    ['Hanna', 'Koch', 'Freunde Lena', 'partner1', 'guest', 1, '', ''],
    ['Ben', 'Wagner', 'Freunde Jonas', 'partner2', 'guest', 0, '', ''],
  ];
  const meals = ['Fleisch', 'Fisch', 'Vegetarisch', 'Vegan'];
  const ids = guests.map(([first, last, group, side, role, plus, phone, plusName], i) => {
    const id = q.run(
      `INSERT INTO guests (wedding_id, token, first_name, last_name, email, phone, group_label, side, role, plus_one_allowed, plus_one_name, meal, allergies, needs_stay, song_wish, note_to_couple, invited_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','-20 days'))`,
      wid, randomToken(12), first, last, `${first.toLowerCase()}@example.com`, phone, group, side, role, plus, plusName,
      i < 9 ? meals[i % 4] : '', i === 2 ? 'Nüsse' : i === 6 ? 'Laktose' : '', i === 2 || i === 3 ? 1 : 0,
      ['September – Earth, Wind & Fire', 'Mr. Brightside – The Killers', '', 'Atemlos – Helene Fischer', '', 'Dancing Queen – ABBA'][i] || '',
      i === 0 ? 'Ich bin so stolz auf euch zwei!' : '',
    ).lastInsertRowid;
    const invited = i === 2 || i === 3 ? [kirche, feier] : i >= 7 ? [feier] : [polter, standesamt, kirche, feier];
    for (const e of invited) {
      const rsvp = i >= 10 ? 'open' : i === 9 && e === feier ? 'no' : 'yes';
      q.run("INSERT INTO invitations (guest_id, event_id, rsvp, plus_one, updated_at) VALUES (?,?,?,?, datetime('now','-5 days'))", id, e, rsvp, plusName && rsvp === 'yes' ? 1 : 0);
    }
    return id;
  });

  const prog = (event, title, time, dur, host, status = 'confirmed', extra = {}) => q.run(
    'INSERT INTO program_items (wedding_id, event_id, title, start_time, duration_min, host_name, guest_id, description, requirements, surprise, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    wid, event, title, time, dur, host, extra.guest ?? null, extra.desc || '', extra.req || '', extra.surprise ? 1 : 0, status,
  );
  prog(feier, 'Sektempfang im Garten', '17:30', 60, 'Brautpaar');
  prog(feier, 'Begrüßung durch die Brauteltern', '18:30', 15, 'Familie Berger');
  prog(feier, 'Abendessen', '18:45', 90, 'Gut Neuhof');
  prog(feier, 'Diashow „Wie alles begann“', '20:15', 20, 'Anna Berger', 'confirmed', { guest: ids[0], req: 'Beamer + Leinwand' });
  prog(feier, 'Überraschungsfilm der Freunde', '20:40', 10, 'Felix Hartmann', 'confirmed', { guest: ids[1], req: 'Beamer, Ton', surprise: true, desc: 'Videogrüße aller Gäste – geheim!' });
  prog(feier, 'Spiel: Wer kennt das Brautpaar besser?', '21:00', 25, 'Lukas Wolf', 'requested', { guest: ids[5] });
  prog(feier, 'Hochzeitstorte', '21:30', 20, 'Brautpaar');
  prog(feier, 'Eröffnungstanz', '22:00', 10, 'Lena & Jonas');
  prog(feier, 'Party mit DJ Eike', '22:10', 240, 'DJ Eike');
  prog(polter, 'Porzellan zerdeppern', '19:30', 30, 'alle');
  prog(kirche, 'Auszug & Reiswerfen', '15:30', 20, 'alle');

  const gift = (kind, title, desc, cents, qty = 1, link = '') => q.run('INSERT INTO gift_items (wedding_id, kind, title, description, price_cents, quantity, link) VALUES (?,?,?,?,?,?,?)', wid, kind, title, desc, cents, qty, link).lastInsertRowid;
  const g1 = gift('fund', 'Hochzeitsreise nach Portugal', 'Zwei Wochen Algarve – jeder Beitrag zählt.', 250000);
  const g2 = gift('fund', 'Abendessen am Strand von Lagos', 'Fisch, Wein, Sonnenuntergang.', 12000);
  gift('item', 'Weingläser (Paar)', 'Für alle Gäste, die uns besuchen', 3200, 4, 'https://www.example.com/weinglaeser');
  gift('fund', 'Surfkurs für zwei', 'Jonas will es unbedingt lernen.', 18000);
  q.run('INSERT INTO pledges (wedding_id, item_id, guest_id, name, amount_cents, message, paid) VALUES (?,?,?,?,?,?,1)', wid, g1, ids[2], 'Maria Schulz', 20000, 'Genießt die Sonne!');
  q.run('INSERT INTO pledges (wedding_id, item_id, guest_id, name, amount_cents, message) VALUES (?,?,?,?,?,?)', wid, g1, ids[5], 'Anonym', 10000, '');
  q.run('INSERT INTO pledges (wedding_id, item_id, guest_id, name, amount_cents, message) VALUES (?,?,?,?,?,?)', wid, g2, ids[0], 'Anna Berger', 12000, 'Das Abendessen geht auf uns!');

  const faq = (qq, a) => q.run('INSERT INTO faqs (wedding_id, question, answer) VALUES (?,?,?)', wid, qq, a);
  faq('Wo kann ich parken?', 'An der Peterskirche ist es eng – bitte das Parkhaus Kornmarkt nutzen. Am Gut Neuhof gibt es ausreichend Parkplätze.');
  faq('Sind Kinder willkommen?', 'Ja, sehr! Für die Kleinen gibt es ab 19 Uhr eine Kinderbetreuung im Nebenraum.');
  faq('Gibt es Übernachtungsmöglichkeiten?', 'Im Hotel Neuhof haben wir ein Kontingent unter dem Stichwort „Lena & Jonas“ (bis 1. Mai).');
  faq('Wie komme ich von der Kirche zur Feier?', 'Ein Shuttlebus fährt um 17:00 Uhr an der Kirche ab und bringt euch zum Gut Neuhof. Zurück fährt er um 1 und 3 Uhr.');

  q.run('INSERT INTO announcements (wedding_id, text, created_at) VALUES (?,?, datetime(\'now\',\'-2 days\'))', wid, 'Die Sitzordnung steht! Unter „Mehr → Mein Platz“ seht ihr euren Tisch.');
  q.run('INSERT INTO questions (wedding_id, guest_id, question) VALUES (?,?,?)', wid, ids[7], 'Darf ich meinen Hund mitbringen?');
  q.run('INSERT INTO anecdotes (wedding_id, guest_id, author_name, text) VALUES (?,?,?,?)', wid, ids[5], 'Lukas Wolf', 'Beim ersten gemeinsamen Campingurlaub hat Jonas das Zelt ohne Stangen eingepackt. Lena hat es mit zwei Ästen und Klebeband aufgebaut.');
  q.run('INSERT INTO anecdotes (wedding_id, guest_id, author_name, text) VALUES (?,?,?,?)', wid, ids[2], 'Maria Schulz', 'Jonas hat als Kind verkündet, er heirate nie – „Mädchen sind zu laut“. Lena ist die lauteste Lacherin, die ich kenne.');
  q.run('INSERT INTO team_posts (wedding_id, guest_id, author_name, text) VALUES (?,?,?,?)', wid, ids[1], 'Felix Hartmann', 'Dreh für den Überraschungsfilm: Samstag 15 Uhr bei mir. Bitte Grußbotschaften bis Ende Mai schicken!');

  const tables = ['Brauteltern', 'Uni-Freunde', 'Familie Jonas', 'Kollegen'].map((n, i) => q.run('INSERT INTO tables (wedding_id, name, capacity, sort) VALUES (?,?,?,?)', wid, n, 8, i).lastInsertRowid);
  const seat = (gi, t) => q.run('UPDATE guests SET table_id = ? WHERE id = ?', tables[t], ids[gi]);
  [[0, 0], [9, 0], [5, 1], [6, 1], [10, 1], [2, 2], [3, 2], [1, 2], [7, 3], [8, 3], [11, 3], [4, 0]].forEach(([gi, t]) => seat(gi, t));
  q.run("INSERT INTO seat_rules (wedding_id, guest_a, guest_b, kind) VALUES (?,?,?,'apart')", wid, ids[3], ids[9]);

  // Synthetic photos
  const dir = mediaDir(wid);
  const uploaders = [[ids[0], 'Anna Berger'], [ids[5], 'Lukas Wolf'], [null, 'Oma Gisela'], [ids[6], 'Mia Klein'], [ids[1], 'Felix Hartmann'], [null, 'Gast']];
  for (let i = 0; i < 14; i++) {
    const file = `demo${i}.png`;
    fs.writeFileSync(path.join(dir, file), demoPhoto(i + 1));
    const [gid, name] = uploaders[i % uploaders.length];
    q.run(
      `INSERT INTO photos (wedding_id, guest_id, uploader_name, kind, file, thumb, width, height, approved, favorite, quality, size_bytes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, datetime('now', ?))`,
      wid, gid, name, 'photo', file, file, 900, 600, i === 13 ? 0 : 1, i % 5 === 0 ? 1 : 0, 100 + i * 7, fs.statSync(path.join(dir, file)).size, `-${(14 - i) * 37} minutes`,
    );
  }
  const cover = 'demo-cover.png';
  fs.writeFileSync(path.join(dir, cover), demoPhoto(3, 1200, 700));
  q.run('UPDATE weddings SET cover_path = ? WHERE id = ?', cover, wid);
  q.run("INSERT INTO guestbook (wedding_id, guest_id, author_name, kind, text) VALUES (?,?,?,'text',?)", wid, ids[3], 'Klaus Schulz', 'Liebe Lena, lieber Jonas – auf viele Jahre voller Lachen und guter Gespräche. Und Jonas: Zelte immer mit Stangen einpacken!');
  return { wid, ids };
});

const w = q.get('SELECT * FROM weddings WHERE id = ?', result.wid);
const g = (i) => q.get('SELECT * FROM guests WHERE id = ?', result.ids[i]);
console.log(`
Demo-Hochzeit „Lena & Jonas“ angelegt.

  Verwaltung:   ${config.baseUrl}/verwaltung   (Login: ${EMAIL} / demo1234)
  Gast (Trauzeugin Anna, Team-Bereich):  ${guestLink(g(0))}
  Gast (Kollege Jan, nur Feier):         ${guestLink(g(7))}
  Gast (Hanna, Antwort noch offen):      ${guestLink(g(10))}
  Foto-Upload per QR:  ${uploadLink(w)}
  Live-Fotowand:       ${wallLink(w)}
`);
