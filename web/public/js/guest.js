// Guest app: opened via the personal invitation link (/e/<token> → cookie → /gast).
import {
  api, upload, h, $, mount, icon, arcHeader, toast, errorToast, modal, confirmDialog, fmtDate, fmtDateTime, fmtTime,
  fmtAgo, money, avatar, daysUntil, processImage, faceDescriptors, loadFaceApi, lightbox, mediaUrl, shareLink, uploadOne,
} from './common.js';
import { themedHeader, applyTheme, applyStoredTheme, currentTheme } from './themes.js';

const app = $('#app');
const nav = $('#nav');
let S = null; // { wedding, me, events, features, announcements, faqs, live, uploadUrl }

const W = () => S.wedding;
const cover = () => (W().cover_path ? mediaUrl(W().id, W().cover_path) : null);
const headerData = () => {
  const main = S.events.find((e) => e.is_main) || S.events[0];
  return { partner1: W().partner1, partner2: W().partner2, motto: W().motto, cover: cover(), logo: W().logo_path ? mediaUrl(W().id, W().logo_path) : null, date: W().wedding_date || main?.starts_at, place: main?.location };
};
const head = (title, subtitle) => themedHeader({ ...headerData(), title, subtitle });

// ---------- Boot & routing ----------

const ROUTES = {
  start: renderStart, zusage: renderRsvp, ablauf: renderProgram, fotos: renderPhotos, gaestebuch: renderGuestbook,
  mehr: renderMore, infos: renderInfo, geschenke: renderGifts, platz: renderSeat, meine: renderMyPhotos,
  geschichte: renderAnecdote, team: renderTeam,
};

const TABS = [
  ['start', 'Start', 'home'], ['ablauf', 'Ablauf', 'clock'], ['fotos', 'Fotos', 'camera'], ['gaestebuch', 'Gästebuch', 'book'], ['mehr', 'Mehr', 'menu'],
];

async function boot() {
  try {
    S = await api('GET', '/api/g/me');
    applyTheme(S.wedding.theme);
  } catch (e) {
    mount(app, h('.wrap', { style: { paddingTop: '60px' } }, h('.card.center',
      h('h2', 'Willkommen!'),
      h('p', 'Bitte öffne die Hochzeitsseite über deinen persönlichen Einladungslink. Du findest ihn in der Nachricht des Brautpaars.'),
      h('p.small.muted', e.message))));
    return;
  }
  document.title = `${W().partner1} & ${W().partner2}`;
  nav.classList.remove('hidden');
  connectStream();
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const [name, ...rest] = (location.hash.slice(1) || 'start').split('/');
  const fn = ROUTES[name] || renderStart;
  const tab = TABS.find((t) => t[0] === name) ? name : ['infos', 'geschenke', 'platz', 'meine', 'geschichte', 'team', 'zusage'].includes(name) ? (name === 'zusage' ? 'start' : 'mehr') : 'start';
  mount(nav, TABS.map(([id, label, ic]) => h('a', { href: `#${id}`, class: id === tab ? 'on' : '' }, icon(ic, 24), label)));
  window.scrollTo(0, 0);
  Promise.resolve(fn(...rest)).catch(errorToast);
}

const go = (hash) => { location.hash = hash; };

async function refresh() { S = await api('GET', '/api/g/me'); }

function connectStream() {
  const es = new EventSource('/api/g/stream');
  es.addEventListener('live', async () => {
    S.live = await api('GET', '/api/g/live'); // broadcast is wedding-wide; fetch the view for this guest
    document.querySelectorAll('[data-live]').forEach((el) => el.replaceWith(liveStrip()));
  });
  es.addEventListener('announcement', (e) => {
    const a = JSON.parse(e.data);
    S.announcements.unshift({ ...a, created_at: new Date().toISOString() });
    toast(`Neuigkeit: ${a.text}`);
  });
  // Design or logo changed by the couple: reload wedding data and re-render the current page.
  es.addEventListener('theme', async () => { await refresh(); applyTheme(S.wedding.theme); route(); });
  es.addEventListener('photo', () => {
    if (location.hash.startsWith('#fotos')) renderPhotos();
  });
}

// ---------- Start ----------

/** "um 19:30" today, otherwise "am Sa., 12. Juni um 19:30". */
function whenLabel(item) {
  if (!item.starts) return item.time ? `um ${item.time}` : '';
  const d = new Date(item.starts);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `um ${item.time}` : `am ${d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })} um ${item.time}`;
}

function liveStrip() {
  const l = S.live;
  if (!l?.current && !l?.next) return h('div', { 'data-live': '' });
  return h('.live-strip', { 'data-live': '', onclick: () => go('ablauf'), style: { cursor: 'pointer' } },
    l.current ? h('span.dot') : icon('clock'),
    h('.grow',
      l.current ? h('div', h('b', 'Jetzt: '), l.current.title, l.current.host ? h('span', { style: { opacity: .8 } }, ` · ${l.current.host}`) : null) : null,
      l.next ? h('.small', { style: { opacity: .85 } }, `Als Nächstes ${whenLabel(l.next)}: ${l.next.title}`) : null),
    icon('right'));
}

function renderStart() {
  const me = S.me;
  const main = S.events.find((e) => e.is_main) || S.events[0];
  const open = S.events.filter((e) => e.rsvp === 'open');
  const days = main ? daysUntil(main.starts_at) : null;
  const tiles = [
    ['fotos', 'camera', 'Fotos teilen'], ['gaestebuch', 'mic', 'Gästebuch'], ['infos', 'info', 'Infos & Fragen'],
    ['geschenke', 'gift', 'Geschenke'], ['platz', 'seat', 'Mein Platz'], ['geschichte', 'heart', 'Geschichte teilen'],
  ];
  mount(app,
    themedHeader({ ...headerData(), big: true }),
    // The classic arc header has built-in whitespace; the other templates need a gap.
    h('.wrap.stack', { style: { marginTop: currentTheme() === 'klassisch' ? '-6px' : '18px' } },
      h('div',
        h('h1', `Hallo ${me.first_name}!`),
        main ? h('p.muted', `${fmtDate(main.starts_at)}${main.location ? ` · ${main.location}` : ''}`) : null),
      liveStrip(),
      open.length
        ? h('.card', { style: { borderLeft: '4px solid var(--burgundy)' } },
          h('h3', icon('mail'), 'Bist du dabei?'),
          h('p', `Bitte gib uns Bescheid${W().rsvp_deadline ? ` bis ${new Date(W().rsvp_deadline).toLocaleDateString('de-DE')}` : ''}.`),
          h('a.btn.block', { href: '#zusage' }, 'Jetzt zu- oder absagen'))
        : h('.card.flat.row.between',
          h('div', h('b', S.events.some((e) => e.rsvp === 'yes') ? 'Schön, dass du dabei bist!' : 'Danke für deine Rückmeldung.'),
            h('.small.muted', S.events.map((e) => `${e.title}: ${e.rsvp === 'yes' ? 'zugesagt' : e.rsvp === 'no' ? 'abgesagt' : 'offen'}`).join(' · '))),
          h('a.btn.ghost.small', { href: '#zusage' }, 'Ändern')),
      days > 0 ? h('.card.row', h('.script', { style: { fontSize: '44px', color: 'var(--burgundy)', lineHeight: 1 } }, days), h('div', h('b', days === 1 ? 'Tag' : 'Tage'), h('.small.muted', 'bis zum großen Tag'))) : null,
      S.announcements.length ? h('.card',
        h('h3', icon('sparkle'), 'Neuigkeiten'),
        S.announcements.slice(0, 3).map((a) => h('div', { style: { padding: '8px 0', borderTop: '1px solid var(--line)' } }, h('div', a.text), h('.small.muted', fmtAgo(a.created_at))))) : null,
      h('.grid3', tiles.map(([to, ic, label]) => h('a.card.center', { href: `#${to}`, style: { textDecoration: 'none', color: 'inherit', padding: '16px 8px' } },
        h('div', { style: { color: 'var(--burgundy)' } }, icon(ic, 28)), h('.small', { style: { fontWeight: 600, marginTop: '6px' } }, label)))),
      W().welcome_text ? h('.card', h('p.serif', { style: { fontSize: '19px', margin: 0 } }, W().welcome_text)) : null,
      W().story_text ? h('.card', h('h3', 'Unsere Geschichte'), W().story_text.split('\n').map((p) => h('p', p))) : null,
      me.team ? h('a.card.row', { href: '#team', style: { textDecoration: 'none', color: 'inherit' } }, icon('lock'), h('.grow', h('b', 'Team-Bereich'), h('.small.muted', 'Überraschungen, Reden, Absprachen – das Brautpaar sieht das nicht.')), icon('right')) : null,
    ));
}

// ---------- RSVP ----------

function renderRsvp() {
  const me = S.me;
  const answers = new Map(S.events.map((e) => [e.id, { rsvp: e.rsvp, plus_one: Boolean(e.plus_one) }]));
  const seg = (e) => {
    const box = h('.seg');
    const draw = () => mount(box, ['yes', 'no'].map((v) => h('button', {
      type: 'button', class: `${answers.get(e.id).rsvp === v ? `on ${v}` : ''}`,
      onclick: () => { answers.get(e.id).rsvp = v; draw(); updatePlus(); },
    }, v === 'yes' ? 'Ich komme' : 'Leider nicht')));
    draw();
    return box;
  };
  const meals = W().meal_options || [];
  const f = {
    plus: h('input', { type: 'text', value: me.plus_one_name || '', placeholder: 'Vor- und Nachname' }),
    children: h('input', { type: 'number', min: 0, max: 10, value: me.children || 0 }),
    meal: h('select', h('option', { value: '' }, '– bitte wählen –'), meals.map((m) => h('option', { value: m, selected: me.meal === m }, m))),
    allergies: h('input', { type: 'text', value: me.allergies || '', placeholder: 'z. B. Nüsse, Laktose' }),
    stay: h('input', { type: 'checkbox', checked: Boolean(me.needs_stay) }),
    song: h('input', { type: 'text', value: me.song_wish || '', placeholder: 'Der bringt mich auf die Tanzfläche …' }),
    note: h('textarea', { rows: 3, placeholder: 'Eine Nachricht an das Brautpaar (optional)' }, me.note_to_couple || ''),
  };
  const plusBox = h('.card',
    h('h3', 'Ein paar Details'),
    me.plus_one_allowed ? h('label.field', h('span', 'Deine Begleitung (falls du jemanden mitbringst)'), f.plus) : null,
    h('label.field', h('span', 'Kinder, die mitkommen'), f.children),
    meals.length ? h('label.field', h('span', 'Essenswunsch'), f.meal) : null,
    h('label.field', h('span', 'Allergien / Unverträglichkeiten'), f.allergies),
    h('label.check', f.stay, h('span', 'Ich brauche eine Übernachtung')),
    h('label.field', h('span', 'Dein Musikwunsch'), f.song));
  const updatePlus = () => {
    const any = [...answers.values()].some((a) => a.rsvp === 'yes');
    plusBox.classList.toggle('hidden', !any);
  };
  const save = async () => {
    try {
      await api('POST', '/api/g/rsvp', {
        responses: S.events.map((e) => ({ event_id: e.id, rsvp: answers.get(e.id).rsvp, plus_one: Boolean(f.plus.value.trim()) })),
        plus_one_name: f.plus.value.trim(), children: Number(f.children.value) || 0, meal: f.meal.value, allergies: f.allergies.value,
        needs_stay: f.stay.checked, song_wish: f.song.value, note_to_couple: f.note.value,
      });
      await refresh();
      toast('Danke! Deine Antwort ist gespeichert.');
      go('start');
    } catch (e) { errorToast(e); }
  };
  mount(app, head('Zu- oder Absage', W().rsvp_deadline ? `Bitte bis ${new Date(W().rsvp_deadline).toLocaleDateString('de-DE')}` : 'Wir freuen uns auf deine Antwort'),
    h('.wrap.stack',
      S.events.map((e) => h('.card', h('h3', e.title), h('p.muted.small', `${fmtDateTime(e.starts_at)}${e.location ? ` · ${e.location}` : ''}`), seg(e))),
      plusBox,
      h('.card', h('label.field', h('span', 'Nachricht an das Brautpaar'), f.note)),
      h('button.btn.block', { onclick: save }, 'Antwort senden'),
    ));
  updatePlus();
}

// ---------- Program / live ----------

async function renderProgram(eventId) {
  const items = await api('GET', '/api/g/program');
  const events = S.events.filter((e) => e.rsvp !== 'no');
  const withItems = events.filter((e) => items.some((i) => i.event_id === e.id));
  const selected = Number(eventId) || withItems.at(-1)?.id || events[0]?.id;
  const ev = S.events.find((e) => e.id === selected);
  const list = items.filter((i) => i.event_id === selected).sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99'));
  const now = new Date();
  const status = (it) => {
    if (!ev || !it.start_time) return '';
    const [hh, mm] = it.start_time.split(':').map(Number);
    const d = new Date(ev.starts_at); const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
    if (start < d && hh < 6) start.setDate(start.getDate() + 1);
    if (S.live?.current?.id === it.id) return 'now';
    return now > new Date(start.getTime() + it.duration_min * 60e3) ? 'past' : '';
  };
  mount(app, head('Ablauf', 'Was passiert wann – und dein eigener Beitrag'),
    h('.wrap.stack',
      liveStrip(),
      events.length > 1 ? h('.chips', events.map((e) => h('button.chip', { class: e.id === selected ? 'on' : '', onclick: () => go(`ablauf/${e.id}`) }, e.title))) : null,
      list.length ? h('ul.timeline', list.map((it) => h('li', { class: status(it) },
        h('.t', it.start_time || '–', h('small', `${it.duration_min} Min.`)),
        h('.c',
          h('.row.between', h('b', it.title), h('.row', { style: { gap: '4px' } },
            it.surprise ? h('span.pill.rose', 'Überraschung') : null,
            it.status === 'requested' ? h('span.pill', 'angefragt') : null,
            it.status === 'declined' ? h('span.pill.red', 'abgelehnt') : null)),
          it.host_name ? h('.small.muted', it.host_name) : null,
          it.description ? h('.small', it.description) : null,
          it.requirements ? h('.small', { style: { color: 'var(--gold)' } }, `Technik: ${it.requirements}`) : null,
          // Witnesses/organizers decide on requests right here (incl. surprises the couple never sees).
          S.me.team && it.status !== 'confirmed' ? h('.row', { style: { marginTop: '6px' } },
            h('button.btn.small', { onclick: () => decide(it, 'confirmed', selected) }, 'Bestätigen'),
            it.status === 'requested' ? h('button.btn.ghost.small', { onclick: () => decide(it, 'declined', selected) }, 'Ablehnen') : null) : null,
          it.mine ? h('button.btn.ghost.small', { onclick: async () => { if (await confirmDialog('Beitrag zurückziehen?', `„${it.title}“ wird entfernt.`, 'Zurückziehen')) { await api('DELETE', `/api/g/program/${it.id}`); renderProgram(selected); } } }, 'Zurückziehen') : null,
        ))))
        : h('.empty', h('.ico', '🕰️'), 'Der Ablauf wird noch geplant.'),
      h('.card',
        h('h3', icon('star'), 'Etwas beitragen?'),
        h('p.small', 'Rede, Spiel, Lied, Diashow? Melde deinen Programmpunkt an. Nach der Bestätigung steht er im Ablauf – so weiß jeder Bescheid und nichts überschneidet sich.'),
        h('button.btn.secondary', { onclick: () => programForm(selected) }, 'Programmpunkt anmelden')),
    ));
}

async function decide(item, status, eventId) {
  try {
    await api('PATCH', `/api/g/program/${item.id}`, { status });
    toast(status === 'confirmed' ? `„${item.title}“ bestätigt` : `„${item.title}“ abgelehnt`);
    renderProgram(eventId);
  } catch (e) { errorToast(e); }
}

function programForm(eventId) {
  const f = {
    event: h('select', S.events.filter((e) => e.rsvp !== 'no').map((e) => h('option', { value: e.id, selected: e.id === eventId }, e.title))),
    title: h('input', { type: 'text', required: true, placeholder: 'z. B. Rede der Trauzeugin' }),
    time: h('input', { type: 'time' }),
    duration: h('input', { type: 'number', min: 1, max: 240, value: 10 }),
    desc: h('textarea', { rows: 3, placeholder: 'Worum geht es? (optional)' }),
    req: h('input', { type: 'text', placeholder: 'Beamer, Mikrofon, Musik … (optional)' }),
    surprise: h('input', { type: 'checkbox' }),
  };
  modal('Programmpunkt anmelden', h('div',
    h('label.field', h('span', 'Bei welchem Termin?'), f.event),
    h('label.field', h('span', 'Was? *'), f.title),
    h('.row', h('label.field.grow', h('span', 'Wunschzeit'), f.time), h('label.field.grow', h('span', 'Dauer (Min.)'), f.duration)),
    h('label.field', h('span', 'Beschreibung'), f.desc),
    h('label.field', h('span', 'Was brauchst du?'), f.req),
    h('label.check', f.surprise, h('span', 'Überraschung für das Brautpaar', h('.small.muted', 'Dann sehen nur Trauzeugen und Organisatoren den Beitrag.'))),
    S.me.team ? null : h('.banner.small', 'Dein Beitrag wird nach Bestätigung durch Brautpaar oder Trauzeugen im Ablauf sichtbar.'),
  ), {
    footer: (close) => [h('button.btn.ghost', { onclick: close }, 'Abbrechen'), h('button.btn', {
      onclick: async () => {
        if (!f.title.value.trim()) { f.title.focus(); return; }
        try {
          await api('POST', '/api/g/program', {
            event_id: Number(f.event.value), title: f.title.value, start_time: f.time.value, duration_min: Number(f.duration.value),
            description: f.desc.value, requirements: f.req.value, surprise: f.surprise.checked,
          });
          close(); toast('Danke! Dein Beitrag ist angemeldet.'); renderProgram(Number(f.event.value));
        } catch (e) { errorToast(e); }
      },
    }, 'Anmelden')],
  });
}

// ---------- Photos ----------

let photoCache = [];

async function renderPhotos() {
  photoCache = await api('GET', '/api/g/photos');
  const input = h('input', { type: 'file', accept: S.features.video ? 'image/*,video/*' : 'image/*', multiple: true, class: 'hidden', onchange: (e) => uploadFiles([...e.target.files]) });
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden', onchange: (e) => uploadFiles([...e.target.files]) });
  mount(app, head('Fotos', 'Euer gemeinsames Album – privat, nur für die Gäste'),
    h('.wrap.stack',
      W().unplugged_ceremony ? h('.banner.rose.small', '💐 Während der Trauung bitte keine Handyfotos – dafür ist unser Fotograf da. Danach: knipst, was das Zeug hält!') : null,
      h('.row', input, cam,
        h('button.btn.grow', { onclick: () => cam.click() }, icon('camera'), 'Foto aufnehmen'),
        h('button.btn.outline.grow', { onclick: () => input.click() }, icon('plus'), S.features.video ? 'Fotos & Videos' : 'Aus Galerie')),
      h('#upload-status'),
      S.features.faceSearch ? h('a.card.row', { href: '#meine', style: { textDecoration: 'none', color: 'inherit' } }, icon('face', 26), h('.grow', h('b', 'Fotos finden, auf denen du bist'), h('.small.muted', 'Per Selfie – das Bild verlässt dein Handy nicht.')), icon('right')) : null,
      photoCache.length
        ? h('.photo-grid', photoCache.map((p, i) => h('.ph', { onclick: () => openPhoto(i) },
          h('img', { src: mediaUrl(W().id, p.thumb || p.file), alt: p.caption || '', loading: 'lazy' }),
          p.kind === 'video' ? h('.play', '▶') : null,
          !p.approved ? h('span.pill.badge', 'wartet auf Freigabe') : null,
          h('.meta', h('span', p.uploader_name), p.likes ? h('span', `♥ ${p.likes}`) : null))))
        : h('.empty', h('.ico', '📷'), 'Noch keine Fotos. Mach das erste!'),
    ));
}

function openPhoto(i) {
  lightbox(photoCache, i, {
    src: (p) => mediaUrl(W().id, p.file),
    caption: (p) => [h('b', p.uploader_name), ' · ', fmtAgo(p.created_at)],
    actions: (p, close) => [
      h('button.icon-btn', {
        'aria-label': 'Gefällt mir', style: { color: p.liked ? '#ff7a8a' : '#fff' },
        onclick: async (e) => { const r = await api('POST', `/api/g/photos/${p.id}/like`); p.liked = !p.liked; p.likes = r.likes; e.currentTarget.style.color = p.liked ? '#ff7a8a' : '#fff'; },
      }, icon('heart', 24)),
      h('a.icon-btn', { href: mediaUrl(W().id, p.file), download: '', 'aria-label': 'Herunterladen', style: { color: '#fff' } }, icon('download', 24)),
      p.mine ? h('button.icon-btn', {
        'aria-label': 'Löschen', style: { color: '#fff' },
        onclick: async () => { if (await confirmDialog('Foto löschen?', 'Dein Foto wird aus dem Album entfernt.')) { await api('DELETE', `/api/g/photos/${p.id}`); close(); renderPhotos(); } },
      }, icon('trash', 24)) : null,
    ],
  });
}

/** Resize in the browser, compute quality/faces, upload one by one with progress. */
async function uploadFiles(files) {
  if (!files.length) return;
  const status = $('#upload-status');
  let done = 0, failed = 0;
  const bar = h('.progress', h('div', { style: { width: '0%' } }));
  const label = h('.small');
  mount(status, h('.card', label, bar));
  for (const [i, file] of files.entries()) {
    label.textContent = `Lade ${i + 1} von ${files.length} hoch …`;
    try {
      await uploadOne(file, (p) => { bar.firstChild.style.width = `${((i + p) / files.length) * 100}%`; }, '/api/g/photos', S.features);
      done++;
    } catch (e) { failed++; errorToast(e); }
  }
  mount(status, done ? h('.banner.green', `${done} ${done === 1 ? 'Datei' : 'Dateien'} hochgeladen${W().moderate_photos ? ' – sichtbar nach Freigabe durch das Brautpaar' : ''}. Danke!`) : null);
  if (done) renderPhotos();
}

// ---------- My photos (face search) ----------

async function renderMyPhotos() {
  if (!S.features.faceSearch) { go('fotos'); return; }
  const result = h('div');
  const run = async (file, remember) => {
    mount(result, h('.empty', h('span.spinner'), h('p', 'Gesicht wird auf deinem Gerät erkannt …')));
    try {
      const img = await processImage(file);
      const faces = await faceDescriptors(img.canvas);
      if (!faces.length) { mount(result, h('.banner', 'Kein Gesicht erkannt. Versuch es mit einem gut beleuchteten Selfie von vorne.')); return; }
      const { matches } = await api('POST', '/api/g/face-search', { descriptor: faces[0], remember });
      const photos = await api('GET', '/api/g/photos');
      const found = matches.map((m) => photos.find((p) => p.id === m.id)).filter(Boolean);
      photoCache = found;
      mount(result, found.length
        ? [h('p', h('b', `${found.length} Fotos gefunden`)), h('.photo-grid', found.map((p, i) => h('.ph', { onclick: () => openPhoto(i) }, h('img', { src: mediaUrl(W().id, p.thumb || p.file), loading: 'lazy' }))))]
        : h('.empty', h('.ico', '🔎'), 'Noch keine Fotos mit dir gefunden. Schau später noch einmal vorbei!'));
    } catch (e) { mount(result, h('.banner', e.message)); }
  };
  const selfie = h('input', { type: 'file', accept: 'image/*', capture: 'user', class: 'hidden', onchange: (e) => e.target.files[0] && run(e.target.files[0], remember.checked) });
  const remember = h('input', { type: 'checkbox', checked: S.me.has_face });
  loadFaceApi().catch(() => {}); // warm up while the user reads
  mount(app, head('Meine Fotos', 'Finde die Fotos, auf denen du zu sehen bist'),
    h('.wrap.stack',
      h('.card',
        h('p', 'Mach ein Selfie. Dein Handy erkennt darin dein Gesicht und vergleicht es mit den Gesichtern in den Hochzeitsfotos.'),
        h('p.small.muted', 'Das Selfie selbst wird nicht hochgeladen – nur ein abstrakter Zahlenwert wird zum Vergleich an den Server geschickt.'),
        h('label.check', remember, h('span', 'Merken, damit das Brautpaar mir passende Fotos schicken kann', h('.small.muted', 'Jederzeit widerrufbar.'))),
        selfie,
        h('button.btn.block', { onclick: () => selfie.click() }, icon('face'), 'Selfie aufnehmen'),
        S.me.has_face ? h('button.btn.ghost.small', { onclick: async () => { await api('DELETE', '/api/g/face'); S.me.has_face = false; toast('Gespeicherte Gesichtsdaten gelöscht.'); renderMyPhotos(); } }, 'Gespeicherte Gesichtsdaten löschen') : null),
      result));
}

// ---------- Guestbook ----------

async function renderGuestbook() {
  const mine = await api('GET', '/api/g/guestbook');
  const text = h('textarea', { rows: 4, placeholder: 'Eure Glückwünsche, eine Erinnerung, ein Rat fürs Eheleben …' });
  mount(app, head('Gästebuch', 'Eine Nachricht, die bleibt'),
    h('.wrap.stack',
      S.features.guestbookMedia ? h('.grid2',
        h('button.card.center', { onclick: () => recorder('video'), style: { border: 0, cursor: 'pointer', font: 'inherit' } }, h('div', { style: { color: 'var(--burgundy)' } }, icon('video', 34)), h('b', 'Videobotschaft'), h('.small.muted', 'bis zu 60 Sekunden')),
        h('button.card.center', { onclick: () => recorder('audio'), style: { border: 0, cursor: 'pointer', font: 'inherit' } }, h('div', { style: { color: 'var(--burgundy)' } }, icon('mic', 34)), h('b', 'Sprachnachricht'), h('.small.muted', 'wie am Telefon – nur schöner'))) : null,
      h('.card',
        h('h3', 'Schriftlich'),
        text,
        h('button.btn', { style: { marginTop: '10px' }, onclick: async () => {
          if (!text.value.trim()) return;
          const form = new FormData(); form.append('text', text.value);
          try { await upload('/api/g/guestbook', form); toast('Danke für deinen Eintrag! 💛'); renderGuestbook(); } catch (e) { errorToast(e); }
        } }, 'Eintragen')),
      mine.length ? h('div', h('.section-title', 'Deine Einträge'), mine.map((m) => h('.card.flat', { style: { marginTop: '8px' } },
        h('.small.muted', `${m.kind === 'video' ? 'Video' : m.kind === 'audio' ? 'Sprachnachricht' : 'Text'} · ${fmtAgo(m.created_at)}`),
        m.text ? h('p', { style: { margin: '4px 0 0' } }, m.text) : null,
        m.file ? (m.kind === 'video' ? h('video', { src: mediaUrl(W().id, m.file), controls: true, playsInline: true, style: { marginTop: '8px', borderRadius: '10px', maxHeight: '300px' } }) : h('audio', { src: mediaUrl(W().id, m.file), controls: true, style: { marginTop: '8px', width: '100%' } })) : null))) : null,
      h('p.small.muted.center', 'Gästebuch-Einträge sieht nur das Brautpaar.'),
    ));
}

function pickMime(kind) {
  const c = kind === 'video'
    ? ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
    : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  return c.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

async function recorder(kind) {
  if (!window.MediaRecorder) { toast('Dein Browser unterstützt keine Aufnahme. Bitte nutze ein aktuelles Handy oder schreib uns.', 'error'); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { audio: true, video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } } } : { audio: true });
  } catch { toast('Kein Zugriff auf Kamera/Mikrofon. Bitte in den Browser-Einstellungen erlauben.', 'error'); return; }
  const mime = pickMime(kind);
  let rec, chunks = [], timer, blob = null, seconds = 0;
  const MAX = kind === 'video' ? 60 : 120;
  const preview = kind === 'video' ? h('video', { autoplay: true, muted: true, playsInline: true }) : h('.center', { style: { fontSize: '60px', padding: '30px' } }, '🎙️');
  if (kind === 'video') preview.srcObject = stream;
  const clock = h('b', '0:00');
  const status = h('.row', { style: { justifyContent: 'center' } }, clock);
  const btn = h('button.btn.block', 'Aufnahme starten');
  const sendBtn = h('button.btn.block.hidden', 'Absenden');
  const again = h('button.btn.ghost.block.hidden', 'Nochmal aufnehmen');
  const stopAll = () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); };
  const start = () => {
    chunks = []; blob = null; seconds = 0;
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      // Only the base type: codec lists like "vp9,opus" contain commas that break multipart headers.
      blob = new Blob(chunks, { type: (rec.mimeType || mime || (kind === 'video' ? 'video/webm' : 'audio/webm')).split(';')[0] });
      const url = URL.createObjectURL(blob);
      mount(previewWrap, kind === 'video' ? h('video', { src: url, controls: true, playsInline: true }) : h('audio', { src: url, controls: true, style: { width: '100%' } }));
      btn.classList.add('hidden'); sendBtn.classList.remove('hidden'); again.classList.remove('hidden');
    };
    rec.start(1000);
    mount(status, h('span.rec-dot'), clock);
    btn.textContent = 'Stopp';
    timer = setInterval(() => {
      seconds++; clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} / ${Math.floor(MAX / 60)}:${String(MAX % 60).padStart(2, '0')}`;
      if (seconds >= MAX) stop();
    }, 1000);
  };
  const stop = () => { clearInterval(timer); if (rec?.state === 'recording') rec.stop(); mount(status, clock); };
  btn.onclick = () => (rec?.state === 'recording' ? stop() : start());
  const previewWrap = h('div', preview);
  const box = h('.recorder.stack', previewWrap, status, btn, sendBtn, again);
  const close = modal(kind === 'video' ? 'Videobotschaft' : 'Sprachnachricht', box, { onClose: stopAll });
  again.onclick = () => { close(); recorder(kind); };
  sendBtn.onclick = async () => {
    const ext = blob.type.includes('mp4') ? (kind === 'video' ? 'mp4' : 'm4a') : 'webm';
    const form = new FormData(); form.append('file', blob, `nachricht.${ext}`);
    sendBtn.disabled = true; sendBtn.textContent = 'Wird gesendet …';
    try {
      await upload('/api/g/guestbook', form, (p) => { sendBtn.textContent = `Wird gesendet … ${Math.round(p * 100)} %`; });
      close(); toast('Danke! Deine Botschaft ist angekommen. 💛'); renderGuestbook();
    } catch (e) { errorToast(e); sendBtn.disabled = false; sendBtn.textContent = 'Absenden'; }
  };
}

// ---------- More ----------

function renderMore() {
  const items = [
    ['zusage', 'mail', 'Zu-/Absage ändern', 'Begleitung, Essen, Übernachtung'],
    ['infos', 'info', 'Infos & Fragen', 'Orte, Zeiten, Dresscode – oder einfach fragen'],
    ['geschenke', 'gift', 'Geschenke', 'Wunschliste & Hochzeitskasse'],
    ['platz', 'seat', 'Mein Platz', 'An welchem Tisch sitze ich?'],
    S.features.faceSearch ? ['meine', 'face', 'Meine Fotos', 'Fotos, auf denen du zu sehen bist'] : null,
    ['geschichte', 'heart', 'Eine Geschichte teilen', 'Für die Reden der Trauzeugen – bleibt geheim'],
    S.me.team ? ['team', 'lock', 'Team-Bereich', 'Nur für Trauzeugen & Organisatoren'] : null,
  ].filter(Boolean);
  mount(app, head('Mehr'), h('.wrap.stack',
    h('.card', h('ul.list', items.map(([to, ic, t, sub]) => h('li', { style: { cursor: 'pointer' }, onclick: () => go(to) },
      h('div', { style: { color: 'var(--burgundy)' } }, icon(ic, 24)), h('.grow', h('b', t), h('.small.muted', sub)), icon('right'))))),
    h('button.btn.outline.block', { onclick: () => shareLink({ title: document.title, url: S.uploadUrl, text: 'Fotos für das Hochzeitsalbum hochladen:' }) }, icon('share'), 'Foto-Upload-Link teilen'),
    h('p.small.muted.center', 'Zum Startbildschirm hinzufügen: im Browser-Menü „Zum Startbildschirm“ wählen.'),
    h('p.small.center', h('a', { href: '/datenschutz' }, 'Datenschutz'))));
}

// ---------- Info & Q&A ----------

function renderInfo() {
  const q = h('input', { type: 'text', placeholder: 'z. B. Wo kann ich parken?' });
  const answer = h('div');
  const ask = async () => {
    if (q.value.trim().length < 3) return;
    mount(answer, h('.row', h('span.spinner'), 'Moment …'));
    try {
      const r = await api('POST', '/api/g/ask', { question: q.value });
      mount(answer, r.answer
        ? h('.banner.green', r.answer, r.source === 'ai' ? h('.small', { style: { opacity: .7, marginTop: '4px' } }, 'Automatische Antwort aus den Infos des Brautpaars') : null)
        : h('.banner', 'Das wissen wir hier noch nicht – deine Frage ist an das Brautpaar weitergeleitet. Die Antwort erscheint unten.'));
      q.value = '';
      loadQuestions();
    } catch (e) { mount(answer, h('.banner', e.message)); }
  };
  const myQuestions = h('div');
  const loadQuestions = async () => {
    const list = await api('GET', '/api/g/questions');
    mount(myQuestions, list.length ? [h('.section-title', 'Deine Fragen'), list.map((x) => h('.card.flat', { style: { marginTop: '8px' } }, h('b', x.question), h('div', x.answer || h('span.muted', 'Noch keine Antwort'))))] : null);
  };
  const mapLink = (e) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(e.address || e.location)}`;
  mount(app, head('Infos', 'Alles Wichtige auf einen Blick'),
    h('.wrap.stack',
      S.events.map((e) => h('.card',
        h('h3', icon('calendar'), e.title),
        h('p', fmtDateTime(e.starts_at), e.ends_at ? ` – ${fmtTime(e.ends_at)} Uhr` : ''),
        e.location ? h('p', h('b', e.location), e.address ? h('div.small.muted', e.address) : null) : null,
        e.notes ? h('p.small', e.notes) : null,
        e.location || e.address ? h('a.btn.outline.small', { href: mapLink(e), target: '_blank', rel: 'noopener' }, icon('map', 16), 'Karte & Route') : null)),
      W().dresscode ? h('.card', h('h3', 'Dresscode'), h('p', W().dresscode)) : null,
      W().unplugged_ceremony ? h('.card', h('h3', '📵 Unplugged Ceremony'), h('p', 'Während der Trauung bitten wir euch, die Handys wegzustecken. Unser Fotograf hält alles fest – genießt den Moment mit uns!')) : null,
      h('.card',
        h('h3', icon('chat'), 'Frag uns'),
        h('.row', h('.grow', q), h('button.btn', { onclick: ask, 'aria-label': 'Frage senden' }, icon('send'))),
        h('div', { style: { marginTop: '10px' } }, answer)),
      S.faqs.length ? h('div', h('.section-title', 'Häufige Fragen'), S.faqs.map((f) => h('details.card.flat', { style: { marginTop: '8px' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, f.question), h('p', { style: { margin: '8px 0 0' } }, f.answer)))) : null,
      myQuestions,
    ));
  q.addEventListener('keydown', (e) => e.key === 'Enter' && ask());
  loadQuestions();
}

// ---------- Gifts ----------

async function renderGifts() {
  const { items, payment } = await api('GET', '/api/g/gifts');
  mount(app, head('Geschenke', 'Wenn ihr uns etwas schenken möchtet'),
    h('.wrap.stack',
      payment.note ? h('.card', h('p.serif', { style: { fontSize: '18px', margin: 0 } }, payment.note)) : null,
      items.length ? items.map((it) => {
        const pct = it.kind === 'fund' && it.price_cents ? Math.min(100, (it.pledged_cents / it.price_cents) * 100) : null;
        const left = it.kind === 'item' ? it.quantity - it.pledged_units : null;
        return h('.card',
          h('.row.between', h('h3', { style: { margin: 0 } }, it.title), it.price_cents ? h('span.pill', it.kind === 'item' ? money(it.price_cents) : `Ziel ${money(it.price_cents)}`) : null),
          it.description ? h('p.small', { style: { marginTop: '6px' } }, it.description) : null,
          pct != null ? h('div', h('.progress', h('div', { style: { width: `${pct}%` } })), h('.small.muted', { style: { marginTop: '4px' } }, `${money(it.pledged_cents)} von ${money(it.price_cents)}`)) : null,
          it.kind === 'item' && it.quantity > 1 ? h('.small.muted', `${Math.max(left, 0)} von ${it.quantity} noch frei`) : null,
          it.mine.length ? h('.banner.green.small', { style: { marginTop: '8px' } }, `Du schenkst: ${it.mine.map((m) => (it.kind === 'item' ? `${m.units}×` : money(m.amount_cents))).join(', ')}`) : null,
          h('.row', { style: { marginTop: '10px' } },
            it.link ? h('a.btn.ghost.small', { href: it.link, target: '_blank', rel: 'noopener' }, 'Ansehen') : null,
            it.kind === 'item' && left <= 0 ? h('span.pill.gray', 'Schon vergeben') : h('button.btn.small', { onclick: () => pledgeDialog(it, payment) }, it.kind === 'item' ? 'Das schenke ich' : 'Beitragen')));
      }) : h('.empty', h('.ico', '🎁'), 'Das Brautpaar hat noch keine Wünsche eingetragen.'),
      payment.iban || payment.paypal ? h('.card.flat', h('h3', 'Direkt überweisen'),
        payment.iban ? h('p.small', h('b', payment.holder), h('br'), h('span.kbd', payment.iban)) : null,
        payment.paypal ? h('p.small', 'PayPal: ', h('a', { href: `https://paypal.me/${payment.paypal.replace(/^.*paypal\.me\//i, '')}`, target: '_blank', rel: 'noopener' }, payment.paypal)) : null) : null,
    ));
}

function pledgeDialog(it, payment) {
  const amount = h('input', { type: 'number', min: 1, step: 1, value: it.kind === 'fund' ? '' : undefined, placeholder: 'Betrag in €' });
  const units = h('input', { type: 'number', min: 1, max: it.quantity - it.pledged_units, value: 1 });
  const msg = h('textarea', { rows: 2, placeholder: 'Ein paar Worte dazu (optional)' });
  const anon = h('input', { type: 'checkbox' });
  modal(it.title, h('div',
    it.kind === 'fund' ? h('label.field', h('span', 'Dein Beitrag (€)'), amount) : it.quantity - it.pledged_units > 1 ? h('label.field', h('span', 'Anzahl'), units) : null,
    h('label.field', h('span', 'Nachricht'), msg),
    h('label.check', anon, h('span', 'Anonym bleiben', h('.small.muted', 'Das Brautpaar sieht dann nicht, von wem es kommt.'))),
    h('p.small.muted', 'Du sagst damit zu, dieses Geschenk zu übernehmen. Bezahlt wird anschließend per Überweisung oder PayPal – nicht über diese Seite.'),
  ), {
    footer: (close) => [h('button.btn.ghost', { onclick: close }, 'Abbrechen'), h('button.btn', {
      onclick: async () => {
        try {
          const r = await api('POST', `/api/g/gifts/${it.id}/pledge`, { amount_eur: amount.value, units: Number(units.value), message: msg.value, anonymous: anon.checked });
          close();
          paymentDialog(r, payment);
          renderGifts();
        } catch (e) { errorToast(e); }
      },
    }, 'Zusagen')],
  });
}

function paymentDialog(r, payment) {
  modal('Danke! 💛', h('div.stack',
    h('p', 'Deine Zusage ist gespeichert.', r.amount_cents ? ` So kannst du die ${money(r.amount_cents)} überweisen:` : ''),
    r.epc_svg ? h('.center', h('div', { style: { width: '200px', margin: '0 auto' }, html: r.epc_svg }), h('.small.muted', 'GiroCode: mit deiner Banking-App scannen – alles ist vorausgefüllt.')) : null,
    r.iban ? h('.card.flat.small', h('div', 'Empfänger: ', h('b', r.holder)), h('div', 'IBAN: ', h('span.kbd', r.iban)), h('div', 'Verwendungszweck: ', r.reference)) : null,
    r.paypal ? h('a.btn.outline.block', { href: r.paypal, target: '_blank', rel: 'noopener' }, 'Mit PayPal senden') : null,
    !r.iban && !r.paypal ? h('p.small.muted', payment.note || 'Das Brautpaar freut sich – gib dein Geschenk einfach am Tag selbst ab.') : null,
  ));
}

// ---------- Seat finder ----------

async function renderSeat() {
  const r = await api('GET', '/api/g/seat');
  const search = h('input', { type: 'search', placeholder: 'Name suchen …' });
  const results = h('div');
  search.addEventListener('input', async () => {
    if (search.value.trim().length < 2) { mount(results); return; }
    const x = await api('GET', `/api/g/seat?q=${encodeURIComponent(search.value.trim())}`);
    mount(results, h('ul.list', x.found.map((f) => h('li', avatar(`${f.first_name} ${f.last_name}`), h('.grow', `${f.first_name} ${f.last_name}`), h('b', f.table_name || '–')))));
  });
  mount(app, head('Mein Platz', 'Wo sitze ich bei der Feier?'),
    h('.wrap.stack',
      r.table
        ? h('.card.center', h('.small.muted', 'Dein Tisch'), h('div.script', { style: { fontSize: '52px', color: 'var(--burgundy)' } }, r.table.name),
          r.mates.length ? h('p', 'Mit dir am Tisch: ', r.mates.map((m) => `${m.first_name}${m.plus_one_name ? ` + ${m.plus_one_name.split(' ')[0]}` : ''}`).join(', ')) : null)
        : h('.empty', h('.ico', '🪑'), r.published ? 'Für dich ist noch kein Platz eingetragen – frag einfach das Brautpaar.' : 'Die Sitzordnung wird kurz vor der Feier veröffentlicht.'),
      r.published ? h('.card', h('h3', 'Wo sitzt …?'), search, results) : null,
    ));
}

// ---------- Anecdotes ----------

function renderAnecdote() {
  const text = h('textarea', { rows: 6, placeholder: 'Wie habt ihr euch kennengelernt? Ein peinlicher Moment, eine typische Eigenart …' });
  mount(app, head('Eine Geschichte teilen', 'Für die Reden am großen Tag'),
    h('.wrap.stack', h('.card',
      h('p', 'Die Trauzeugen sammeln Geschichten über das Brautpaar für ihre Reden. Deine Geschichte sehen nur Trauzeugen und Organisatoren – das Brautpaar erfährt sie erst bei der Feier.'),
      text,
      h('button.btn', { style: { marginTop: '10px' }, onclick: async () => {
        try { await api('POST', '/api/g/anecdotes', { text: text.value }); toast('Danke! Deine Geschichte ist bei den Trauzeugen.'); go('mehr'); } catch (e) { errorToast(e); }
      } }, 'Geschichte senden'))));
}

// ---------- Team area (witnesses & organizers) ----------

async function renderTeam(tab = 'programm') {
  if (!S.me.team) { go('start'); return; }
  const t = await api('GET', '/api/g/team');
  const tabs = [['programm', 'Programm'], ['live', 'Live'], ['geschichten', `Geschichten (${t.anecdotes.length})`], ['rede', 'Rede'], ['pinnwand', 'Absprachen']];
  const body = h('div.stack');
  mount(app, head('Team-Bereich', 'Das Brautpaar sieht hier nichts'),
    h('.wrap.stack', h('.chips', tabs.map(([id, l]) => h('button.chip', { class: id === tab ? 'on' : '', onclick: () => go(`team/${id}`) }, l))), body));

  if (tab === 'programm') {
    mount(body,
      h('.banner.small', 'Hier seht ihr alle Programmpunkte – auch Überraschungen und offene Anfragen.'),
      t.program.length ? t.program.map((p) => h('.card.flat',
        h('.row.between', h('div', h('b', `${p.start_time || '–'}  ${p.title}`), h('.small.muted', `${p.event_title} · ${p.host_name || '–'} · ${p.duration_min} Min.`)),
          h('.row', p.surprise ? h('span.pill.rose', 'Überraschung') : null, h('span.pill', { class: p.status === 'confirmed' ? 'green' : p.status === 'declined' ? 'red' : '' }, { confirmed: 'bestätigt', requested: 'angefragt', declined: 'abgelehnt' }[p.status]))),
        p.description ? h('p.small', p.description) : null,
        p.requirements ? h('p.small', { style: { color: 'var(--gold)' } }, `Technik: ${p.requirements}`) : null,
        p.status !== 'confirmed' ? h('button.btn.small', { onclick: async () => { await api('PATCH', `/api/g/program/${p.id}`, { status: 'confirmed' }); renderTeam('programm'); } }, 'Bestätigen') : null,
        p.status === 'requested' ? h('button.btn.ghost.small', { onclick: async () => { await api('PATCH', `/api/g/program/${p.id}`, { status: 'declined' }); renderTeam('programm'); } }, 'Ablehnen') : null))
        : h('.empty', 'Noch keine Programmpunkte.'),
      h('button.btn.secondary', { onclick: () => programForm(S.events[0]?.id) }, 'Programmpunkt hinzufügen'));
  }

  if (tab === 'live') {
    const confirmed = t.program.filter((p) => p.status === 'confirmed');
    mount(body,
      h('p.small.muted', 'Am Tag selbst: Tippt auf den Punkt, der gerade läuft. Alle Gäste und die Fotowand sehen es sofort.'),
      liveStrip(),
      h('.card', h('ul.list', confirmed.map((p) => h('li',
        h('.grow', h('b', p.title), h('.small.muted', `${p.start_time || '–'} · ${p.event_title}`)),
        h('button.btn.small', { class: S.live?.current?.id === p.id ? '' : 'outline', onclick: async () => { S.live = await api('POST', '/api/g/live', { item_id: p.id }); toast(`Live: ${p.title}`); renderTeam('live'); } }, S.live?.current?.id === p.id ? 'Läuft' : 'Jetzt'))))),
      h('button.btn.ghost', { onclick: async () => { S.live = await api('POST', '/api/g/live', { item_id: null }); toast('Automatik nach Zeitplan aktiv'); renderTeam('live'); } }, 'Zurück zur Automatik nach Zeitplan'));
  }

  if (tab === 'geschichten') {
    mount(body,
      h('.card.row', h('.grow.small', 'Bittet die Gäste um Geschichten – sie können sie unter „Mehr → Eine Geschichte teilen“ einreichen.'), h('button.btn.small.outline', { onclick: () => go('geschichte') }, 'Selbst eine schreiben')),
      t.anecdotes.length ? t.anecdotes.map((a) => h('.card.flat', h('p', { style: { margin: 0 } }, a.text), h('.small.muted', `${a.author_name} · ${fmtAgo(a.created_at)}`))) : h('.empty', 'Noch keine Geschichten.'));
  }

  if (tab === 'rede') {
    const tone = h('select', ['herzlich mit etwas Humor', 'feierlich und berührend', 'locker und witzig'].map((x) => h('option', x)));
    const minutes = h('input', { type: 'number', min: 1, max: 15, value: 4 });
    const out = h('textarea', { rows: 16, placeholder: 'Hier erscheint dein Entwurf …' });
    mount(body,
      h('.card',
        h('h3', icon('sparkle'), 'Rede-Helfer'),
        h('p.small', t.aiAvailable
          ? `Erstellt aus den ${t.anecdotes.length} gesammelten Geschichten einen ersten Entwurf. Stellen in [Klammern] ergänzt du selbst.`
          : 'Erstellt eine Gliederung mit den gesammelten Geschichten, die du selbst ausformulierst.'),
        h('.row', h('label.field.grow', h('span', 'Ton'), tone), h('label.field', { style: { width: '120px' } }, h('span', 'Minuten'), minutes)),
        h('button.btn', { onclick: async (e) => {
          e.currentTarget.disabled = true;
          out.value = 'Entwurf wird erstellt …';
          try { const r = await api('POST', '/api/g/team/speech', { tone: tone.value, minutes: Number(minutes.value) }); out.value = r.text; } catch (err) { out.value = ''; errorToast(err); }
          e.currentTarget.disabled = false;
        } }, 'Entwurf erstellen')),
      h('.card', out, h('button.btn.ghost.small', { onclick: () => navigator.clipboard.writeText(out.value).then(() => toast('Kopiert')) }, 'Text kopieren')));
  }

  if (tab === 'pinnwand') {
    const text = h('textarea', { rows: 3, placeholder: 'Wer bringt was mit? Wann proben wir? …' });
    mount(body,
      h('.card', h('h3', 'Team'), h('ul.list', t.team.map((m) => h('li', avatar(`${m.first_name} ${m.last_name}`), h('.grow', h('b', `${m.first_name} ${m.last_name}`), h('.small.muted', m.role === 'witness' ? 'Trauzeuge/in' : 'Organisator/in')),
        m.phone ? h('a.btn.ghost.small', { href: `tel:${m.phone}` }, 'Anrufen') : null)))),
      h('.card', text, h('button.btn', { style: { marginTop: '8px' }, onclick: async () => { await api('POST', '/api/g/team/posts', { text: text.value }); renderTeam('pinnwand'); } }, 'Posten')),
      t.posts.map((p) => h('.card.flat', h('p', { style: { margin: 0 } }, p.text), h('.small.muted', `${p.author_name} · ${fmtAgo(p.created_at)}`))));
  }
}

applyStoredTheme();
boot();
