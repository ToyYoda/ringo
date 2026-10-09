// Couple dashboard (/verwaltung).
import {
  api, upload, h, $, mount, icon, toast, errorToast, modal, confirmDialog, formDialog, fmtDate, fmtDateTime, fmtShortDate, fmtAgo,
  money, avatar, daysUntil, copyText, waLink, lightbox, mediaUrl, processImage,
} from './common.js';
import { THEMES } from './themes.js';

const main = $('#main');
const side = $('#side');
let ctx = null; // { wedding, features, stats, links, live, mail, aiConfigured }
let WID = null;

const A = (path) => `/api/w/${WID}${path}`;
const get = (p) => api('GET', A(p));
const post = (p, b) => api('POST', A(p), b ?? {});
const patch = (p, b) => api('PATCH', A(p), b);
const del = (p, b) => api('DELETE', A(p), b);
const W = () => ctx.wedding;

const NAV = [
  ['uebersicht', 'Übersicht', 'home'],
  null,
  ['termine', 'Termine', 'calendar'],
  ['gaeste', 'Gäste & Einladungen', 'users'],
  ['rueckmeldungen', 'Rückmeldungen', 'mail'],
  ['ablauf', 'Ablauf & Live', 'clock'],
  ['nachrichten', 'Nachrichten', 'send'],
  ['fragen', 'Fragen & FAQ', 'chat'],
  null,
  ['fotos', 'Fotos & Videos', 'camera'],
  ['gaestebuch', 'Gästebuch', 'book'],
  ['geschenke', 'Geschenke', 'gift'],
  ['sitzplan', 'Sitzplan', 'seat'],
  null,
  ['drucken', 'Drucken & Teilen', 'printer'],
  ['einstellungen', 'Einstellungen', 'settings'],
];
const GROUPS = ['Vorbereitung', 'Am Tag & danach', 'Mehr'];

const PAGES = {
  uebersicht: pageOverview, termine: pageEvents, gaeste: pageGuests, rueckmeldungen: pageRsvps, ablauf: pageProgram,
  nachrichten: pageAnnouncements, fragen: pageQuestions, fotos: pagePhotos, gaestebuch: pageGuestbook, geschenke: pageGifts,
  sitzplan: pageSeating, drucken: pagePrint, einstellungen: pageSettings,
};

// ---------- Boot ----------

async function boot() {
  const me = await api('GET', '/api/auth/me');
  if (!me.user) { location.href = '/?login#anmelden'; return; }
  if (!me.weddings.length) { mount(main, h('.empty', 'Zu deinem Konto gehört keine Hochzeit.')); return; }
  WID = Number(localStorage.getItem('hb_wid')) || me.weddings[0].id;
  if (!me.weddings.some((w) => w.id === WID)) WID = me.weddings[0].id;
  $('#menuBtn').append(icon('menu', 24));
  $('#menuBtn').onclick = () => side.classList.toggle('open');
  await reload();
  window.addEventListener('hashchange', route);
  route();
}

async function reload() {
  ctx = await get('/');
  document.title = `${W().partner1} & ${W().partner2} · Verwaltung`;
}

function renderNav(current) {
  let g = 0;
  const badge = { fotos: ctx.stats.pendingPhotos, fragen: ctx.stats.openQuestions, ablauf: ctx.stats.programRequests };
  mount(side,
    h('.brand', h('div', h('img', { src: '/img/ringo-atelier.svg', alt: 'Ringo', style: { height: '38px', width: 'auto' } }), h('.small.muted', `${W().partner1} & ${W().partner2}`))),
    h('nav', NAV.map((n) => {
      if (!n) return h('.grp', GROUPS[g++]);
      const [id, label, ic] = n;
      return h('a', { href: `#${id}`, class: id === current ? 'on' : '', onclick: () => side.classList.remove('open') }, icon(ic, 18), label, badge[id] ? h('span.count', badge[id]) : null);
    })),
    h('div', { style: { padding: '18px 12px 0' } },
      h('span.pill', { class: ctx.features.plan === 'premium' ? 'rose' : 'gray' }, ctx.features.plan === 'premium' ? 'Premium' : 'Basis'),
      h('div', { style: { marginTop: '12px' } }, h('a.small', { href: '#', onclick: async (e) => { e.preventDefault(); await api('POST', '/api/auth/logout'); location.href = '/'; } }, 'Abmelden'))));
}

async function route() {
  const [page, ...rest] = (location.hash.slice(1) || 'uebersicht').split('/');
  const fn = PAGES[page] || pageOverview;
  renderNav(PAGES[page] ? page : 'uebersicht');
  $('#topTitle').textContent = (NAV.find((n) => n && n[0] === page) || NAV[0])[1];
  mount(main, h('.empty', h('span.spinner')));
  try { await fn(...rest); } catch (e) { mount(main, h('.banner.rose', e.message)); }
  window.scrollTo(0, 0);
}

const rerender = () => route();
const pageHead = (title, sub, ...actions) => h('.page-head', h('div', h('h1', title), sub ? h('p', sub) : null), actions.length ? h('.row', actions) : null);
const premiumNote = (what) => h('.banner.rose', `${what} ist im Premium-Paket enthalten. `, h('a', { href: '#einstellungen/paket' }, 'Mehr erfahren'));

// ---------- Overview ----------

async function pageOverview() {
  await reload();
  const s = ctx.stats;
  const events = await get('/events');
  const main_ = events.find((e) => e.is_main) || events[0];
  const days = main_ ? daysUntil(main_.starts_at) : null;
  const steps = [
    [events.length > 0, 'Termine anlegen', 'termine'],
    [s.guests > 0, 'Gäste eintragen oder importieren', 'gaeste'],
    [s.invitedSent > 0, 'Einladungen verschicken', 'gaeste'],
    [Boolean(W().cover_path && W().welcome_text), 'Titelfoto & Begrüßung', 'einstellungen'],
    [s.giftItems > 0, 'Geschenkeliste oder Hochzeitskasse', 'geschenke'],
    [s.tables > 0, 'Tische anlegen & Tischkarten mit Foto-QR-Code drucken', 'drucken'],
  ];
  mount(main,
    pageHead(`Hallo ${W().partner1} & ${W().partner2}!`, main_ ? `${fmtDate(main_.starts_at)}${days > 0 ? ` · noch ${days} Tage` : ''}` : 'Legt als Erstes euren Hochzeitstermin an.'),
    h('.grid3',
      stat(s.guests, 'Einladungen', 'gaeste'), stat(s.yes, 'Zusagen', 'rueckmeldungen'), stat(s.open, 'offen', 'rueckmeldungen'),
      stat(s.headcount, 'Personen erwartet', 'rueckmeldungen'), stat(s.photos + s.videos, 'Fotos & Videos', 'fotos'), stat(s.guestbook, 'Gästebuch', 'gaestebuch')),
    h('.grid2', { style: { marginTop: '16px' } },
      h('.card',
        h('h3', icon('check'), 'Erste Schritte'),
        h('ul.list', steps.map(([done, label, to]) => h('li', h('span', { style: { color: done ? 'var(--green)' : 'var(--line-strong)' } }, icon(done ? 'check' : 'plus')), h('a.grow', { href: `#${to}`, style: { color: 'inherit', textDecoration: done ? 'line-through' : 'none' } }, label))))),
      h('.card',
        h('h3', icon('sparkle'), 'Zu erledigen'),
        h('ul.list',
          s.pendingPhotos ? todo(`${s.pendingPhotos} Fotos warten auf Freigabe`, 'fotos') : null,
          s.openQuestions ? todo(`${s.openQuestions} Fragen von Gästen`, 'fragen') : null,
          s.programRequests ? todo(`${s.programRequests} Programmpunkte angefragt`, 'ablauf') : null,
          s.guests - s.invitedSent > 0 ? todo(`${s.guests - s.invitedSent} Gäste noch nicht eingeladen`, 'gaeste') : null,
          !s.pendingPhotos && !s.openQuestions && !s.programRequests && s.guests === s.invitedSent ? h('li.muted', 'Alles erledigt 🎉') : null),
        h('.row', { style: { marginTop: '12px' } },
          h('a.btn.outline.small', { href: ctx.links.upload, target: '_blank' }, icon('camera', 16), 'Foto-Upload testen'),
          ctx.features.wall ? h('a.btn.outline.small', { href: ctx.links.wall, target: '_blank' }, icon('monitor', 16), 'Fotowand öffnen') : null))),
    ctx.live.current || ctx.live.next ? h('.card', { style: { marginTop: '16px' } }, h('h3', icon('clock'), 'Live'),
      ctx.live.current ? h('p', h('b', 'Jetzt: '), ctx.live.current.title) : null, ctx.live.next ? h('p.muted', `Danach: ${ctx.live.next.title}`) : null) : null,
  );
}
const stat = (n, label, to) => h('a.card.stat', { href: `#${to}`, style: { textDecoration: 'none' } }, h('b', n), h('span', label));
const todo = (text, to) => h('li', h('a.grow', { href: `#${to}`, style: { color: 'inherit' } }, text), icon('right'));

// ---------- Events ----------

async function pageEvents() {
  const events = await get('/events');
  const edit = async (e = {}) => {
    const v = await formDialog(e.id ? 'Termin bearbeiten' : 'Neuer Termin', [
      { name: 'title', label: 'Titel', value: e.title, required: true, placeholder: 'z. B. Standesamt, Kirche, Feier, Polterabend' },
      { name: 'starts_at', label: 'Beginn', type: 'datetime-local', value: e.starts_at, required: true },
      { name: 'ends_at', label: 'Ende (optional)', type: 'datetime-local', value: e.ends_at },
      { name: 'location', label: 'Ort', value: e.location, placeholder: 'z. B. Gut Neuhof' },
      { name: 'address', label: 'Adresse', value: e.address },
      { name: 'notes', label: 'Hinweise für Gäste', type: 'textarea', value: e.notes, rows: 3 },
      { name: 'is_main', label: 'Haupttermin (für Zusagen, Sitzplan & Countdown)', type: 'checkbox', value: e.id ? e.is_main : !events.length },
      ...(e.id ? [] : [{ name: 'invite_all', label: 'Alle bisherigen Gäste zu diesem Termin einladen', type: 'checkbox', value: true }]),
    ]);
    if (!v) return;
    try {
      if (e.id) await patch(`/events/${e.id}`, v); else await post('/events', v);
      rerender();
    } catch (err) { errorToast(err); }
  };
  mount(main,
    pageHead('Termine', 'Standesamt, Trauung, Feier, Polterabend – Gäste sehen nur die Termine, zu denen sie eingeladen sind.', h('button.btn', { onclick: () => edit() }, icon('plus'), 'Termin')),
    events.length ? events.map((e) => h('.card.row',
      h('.grow', h('h3', { style: { margin: 0 } }, e.title, e.is_main ? h('span.pill.rose', { style: { marginLeft: '8px', fontFamily: 'var(--sans)' } }, 'Haupttermin') : null),
        h('.muted', fmtDateTime(e.starts_at), e.location ? ` · ${e.location}` : ''), e.notes ? h('.small', e.notes) : null),
      h('button.btn.ghost.small', { onclick: () => edit(e) }, icon('edit', 16), 'Bearbeiten'),
      h('button.icon-btn', { 'aria-label': 'Löschen', onclick: async () => { if (await confirmDialog('Termin löschen?', `„${e.title}“ mit allen Zusagen und Programmpunkten löschen?`)) { await del(`/events/${e.id}`); rerender(); } } }, icon('trash'))))
      : h('.card.empty', h('.ico', '📅'), h('p', 'Noch keine Termine.'), h('button.btn', { onclick: () => edit() }, 'Ersten Termin anlegen')));
}

// ---------- Guests ----------

const ROLE = { guest: 'Gast', witness: 'Trauzeuge/in', organizer: 'Organisator/in' };
const SIDE = () => ({ both: 'Beide', partner1: `Seite ${W().partner1}`, partner2: `Seite ${W().partner2}` });
const RSVP_PILL = { yes: ['green', 'Zusage'], no: ['red', 'Absage'], open: ['gray', 'offen'] };

async function pageGuests() {
  const [guests, events] = await Promise.all([get('/guests'), get('/events')]);
  const search = h('input', { type: 'search', placeholder: 'Suchen …', style: { maxWidth: '260px' } });
  const filter = h('select', { style: { maxWidth: '200px' } }, [['', 'Alle'], ['open', 'Antwort offen'], ['yes', 'Zugesagt'], ['no', 'Abgesagt'], ['uninvited', 'Noch nicht eingeladen']].map(([v, l]) => h('option', { value: v }, l)));
  const body = h('tbody');
  const draw = () => {
    const s = search.value.toLowerCase();
    const f = filter.value;
    const rows = guests.filter((g) => {
      if (s && !`${g.first_name} ${g.last_name} ${g.group_label} ${g.email}`.toLowerCase().includes(s)) return false;
      if (f === 'uninvited') return !g.invited_at;
      if (f) return g.invitations.some((i) => i.rsvp === f);
      return true;
    });
    mount(body, rows.map((g) => h('tr',
      h('td', h('.row', { style: { flexWrap: 'nowrap' } }, avatar(`${g.first_name} ${g.last_name}`), h('div', h('b', `${g.first_name} ${g.last_name}`), h('.small.muted', [g.group_label, g.role !== 'guest' ? ROLE[g.role] : '', g.plus_one_name ? `+ ${g.plus_one_name}` : ''].filter(Boolean).join(' · '))))),
      h('td', events.map((e) => {
        const i = g.invitations.find((x) => x.event_id === e.id);
        return i ? h('span.pill', { class: RSVP_PILL[i.rsvp][0], title: e.title, style: { marginRight: '4px' } }, `${e.title.slice(0, 10)}: ${RSVP_PILL[i.rsvp][1]}`) : null;
      })),
      h('td', g.invited_at ? h('span.small.muted', `eingeladen ${fmtShortDate(g.invited_at.replace(' ', 'T') + 'Z')}`) : h('span.pill', 'nicht eingeladen'), g.last_seen_at ? h('.small.muted', `zuletzt aktiv ${fmtAgo(g.last_seen_at)}`) : null),
      h('td.nowrap',
        h('button.btn.small', { onclick: () => inviteDialog(g) }, icon('send', 15), 'Einladen'),
        h('button.icon-btn', { 'aria-label': 'Bearbeiten', onclick: () => guestDialog(g, events) }, icon('edit', 18)),
        h('button.icon-btn', { 'aria-label': 'Löschen', onclick: async () => { if (await confirmDialog('Gast löschen?', `${g.first_name} ${g.last_name} mit allen Rückmeldungen löschen?`)) { await del(`/guests/${g.id}`); rerender(); } } }, icon('trash', 18))))));
  };
  search.oninput = draw; filter.onchange = draw;
  const uninvited = guests.filter((g) => !g.invited_at && g.email).length;
  mount(main,
    pageHead('Gäste & Einladungen', `${guests.length} Einladungen · jede/r bekommt einen persönlichen Link – ohne App, ohne Konto.`,
      h('button.btn.outline', { onclick: () => importDialog() }, 'CSV-Import'),
      h('a.btn.outline', { href: A('/guests/export.csv') }, icon('download', 16), 'Export'),
      h('button.btn', { onclick: () => guestDialog({}, events) }, icon('plus'), 'Gast')),
    ctx.features.maxGuests ? h('.banner.small', { style: { marginBottom: '12px' } }, `Basis-Paket: bis zu ${ctx.features.maxGuests} Einladungen.`) : null,
    ctx.mail && uninvited ? h('.card.row', { style: { marginBottom: '12px' } }, h('.grow', `${uninvited} Gäste mit E-Mail-Adresse sind noch nicht eingeladen.`),
      h('button.btn.secondary', { onclick: async () => { try { const r = await post('/guests/send-invites'); toast(`${r.sent} Einladungen verschickt${r.failed.length ? `, ${r.failed.length} fehlgeschlagen` : ''}`); rerender(); } catch (e) { errorToast(e); } } }, icon('mail', 16), 'Alle per E-Mail einladen')) : null,
    h('.card',
      h('.row', { style: { marginBottom: '10px' } }, search, filter),
      guests.length ? h('.table-scroll', h('table.data', h('thead', h('tr', h('th', 'Name'), h('th', 'Rückmeldung'), h('th', 'Status'), h('th', ''))), body))
        : h('.empty', h('.ico', '👥'), 'Noch keine Gäste. Fügt sie einzeln hinzu oder importiert eine Liste (Excel → CSV).')));
  draw();
}

async function guestDialog(g, events) {
  const v = await formDialog(g.id ? 'Gast bearbeiten' : 'Gast hinzufügen', [
    { name: 'first_name', label: 'Vorname', value: g.first_name, required: true },
    { name: 'last_name', label: 'Nachname', value: g.last_name },
    { name: 'email', label: 'E-Mail', type: 'email', value: g.email },
    { name: 'phone', label: 'Handynummer (für WhatsApp)', type: 'tel', value: g.phone },
    { name: 'group_label', label: 'Gruppe', value: g.group_label, placeholder: 'z. B. Familie Braut, Uni-Freunde, Kollegen', hint: 'Hilft beim Sitzplan: Gruppen sitzen bevorzugt zusammen.' },
    { name: 'side', label: 'Gehört zu', type: 'select', value: g.side || 'both', options: Object.entries(SIDE()).map(([value, label]) => ({ value, label })) },
    { name: 'role', label: 'Rolle', type: 'select', value: g.role || 'guest', options: Object.entries(ROLE).map(([value, label]) => ({ value, label })), hint: 'Trauzeugen & Organisatoren bekommen den Team-Bereich (Überraschungen, Reden, Live-Steuerung).' },
    { name: 'plus_one_allowed', label: 'Darf eine Begleitung mitbringen', type: 'checkbox', value: g.plus_one_allowed },
    { name: 'internal_note', label: 'Interne Notiz (nur für euch)', type: 'textarea', value: g.internal_note, rows: 2 },
    ...(g.id ? [] : events.length ? [{ name: 'events', label: 'Einladen zu: alle Termine', type: 'checkbox', value: true, hint: 'Einzelne Termine könnt ihr danach unter „Bearbeiten“ ändern.' }] : []),
  ], {
    extra: g.id && events.length ? h('div', h('.small.muted', { style: { margin: '6px 0' } }, 'Eingeladen zu:'), events.map((e) => {
      const inv = g.invitations.find((i) => i.event_id === e.id);
      const cb = h('input', { type: 'checkbox', checked: Boolean(inv), onchange: async () => { await api('PUT', A(`/guests/${g.id}/invitations/${e.id}`), { invited: cb.checked }); } });
      return h('label.check', cb, h('span', e.title));
    })) : null,
  });
  if (!v) { if (g.id) rerender(); return; }
  try {
    const body = { ...v, plus_one_allowed: v.plus_one_allowed };
    if (g.id) await patch(`/guests/${g.id}`, body);
    else await post('/guests', { ...body, event_ids: v.events ? undefined : [] });
    rerender();
  } catch (e) { errorToast(e); }
}

async function inviteDialog(g) {
  const { text, subject } = await get(`/guests/${g.id}/invite-text`);
  const ta = h('textarea', { rows: 12 }, text);
  const mark = async () => { await post(`/guests/${g.id}/mark-invited`); };
  modal(`${g.first_name} einladen`, h('div.stack',
    h('p.small.muted', 'Der Text enthält den persönlichen Link. Ihr könnt ihn vor dem Senden anpassen.'),
    ta,
    h('.row',
      g.phone ? h('a.btn', { href: '#', onclick: async (e) => { e.preventDefault(); window.open(waLink(g.phone, ta.value), '_blank'); await mark(); } }, icon('whatsapp', 18), 'WhatsApp') : null,
      g.email ? h('a.btn.outline', { href: `mailto:${encodeURIComponent(g.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, onclick: mark }, icon('mail', 18), 'E-Mail-Programm') : null,
      ctx.mail && g.email ? h('button.btn.outline', { onclick: async () => { try { await post('/guests/send-invites', { ids: [g.id] }); toast('E-Mail verschickt'); } catch (e) { errorToast(e); } } }, 'Direkt senden') : null,
      h('button.btn.ghost', { onclick: async () => { await copyText(ta.value, 'Einladung kopiert'); await mark(); } }, 'Text kopieren'),
      h('button.btn.ghost', { onclick: () => copyText(g.link, 'Link kopiert') }, 'Nur Link')),
    h('details', h('summary.small.muted', 'Link vergessen/weitergeleitet?'), h('p.small', 'Ein neuer Link macht den alten ungültig.'),
      h('button.btn.danger.small', { onclick: async () => { await post(`/guests/${g.id}/new-link`); toast('Neuer Link erstellt'); rerender(); } }, 'Neuen Link erzeugen'))),
  { onClose: rerender });
}

function importDialog() {
  const file = h('input', { type: 'file', accept: '.csv,text/csv,text/plain' });
  modal('Gästeliste importieren', h('div.stack',
    h('p', 'Exportiert eure Liste aus Excel/Numbers/Google Sheets als CSV. Erste Zeile = Spaltennamen.'),
    h('p.small.muted', 'Erkannte Spalten: Vorname (Pflicht), Nachname, E-Mail, Telefon/Handy, Gruppe, Seite (Braut/Bräutigam), Begleitung (ja/nein).'),
    file,
  ), {
    footer: (close) => [h('button.btn.ghost', { onclick: close }, 'Abbrechen'), h('button.btn', {
      onclick: async () => {
        const f = file.files[0];
        if (!f) return;
        let text = await f.text();
        if (text.includes('�')) text = new TextDecoder('windows-1252').decode(await f.arrayBuffer()); // Excel's default on Windows
        try { const r = await post('/guests/import', { csv: text }); toast(`${r.imported} Gäste importiert`); close(); rerender(); } catch (e) { errorToast(e); }
      },
    }, 'Importieren')],
  });
}

// ---------- RSVP overview ----------

async function pageRsvps() {
  const [guests, events] = await Promise.all([get('/guests'), get('/events')]);
  const yesGuests = (eid) => guests.filter((g) => g.invitations.some((i) => i.event_id === eid && i.rsvp === 'yes'));
  const mainEv = events.find((e) => e.is_main) || events[0];
  const attending = mainEv ? yesGuests(mainEv.id) : [];
  const meals = {};
  for (const g of attending) if (g.meal) meals[g.meal] = (meals[g.meal] || 0) + 1;
  const list = (title, items) => (items.length ? h('.card', h('h3', title), h('ul.list', items)) : null);
  mount(main,
    pageHead('Rückmeldungen', 'Wer kommt, was wird gegessen, wer braucht ein Bett?', h('a.btn.outline', { href: A('/gaesteliste.pdf') }, icon('download', 16), 'Gästeliste (PDF)')),
    h('.grid2', events.map((e) => {
      const inv = guests.flatMap((g) => g.invitations.filter((i) => i.event_id === e.id).map((i) => ({ ...i, g })));
      const yes = inv.filter((i) => i.rsvp === 'yes');
      const persons = yes.reduce((s, i) => s + 1 + i.plus_one + (i.g.children || 0), 0);
      const pct = inv.length ? Math.round(((inv.length - inv.filter((i) => i.rsvp === 'open').length) / inv.length) * 100) : 0;
      return h('.card', h('h3', e.title), h('.muted.small', fmtDateTime(e.starts_at)),
        h('.row', { style: { margin: '12px 0' } }, h('.stat.grow', h('b', persons), h('span', 'Personen')), h('.stat.grow', h('b', yes.length), h('span', 'Zusagen')), h('.stat.grow', h('b', inv.filter((i) => i.rsvp === 'no').length), h('span', 'Absagen'))),
        h('.progress', h('div', { style: { width: `${pct}%` } })), h('.small.muted', { style: { marginTop: '4px' } }, `${pct} % haben geantwortet`));
    })),
    h('.grid2', { style: { marginTop: '14px' } },
      Object.keys(meals).length ? h('.card', h('h3', 'Essen'), h('ul.list', Object.entries(meals).map(([m, n]) => h('li', h('.grow', m), h('b', n))))) : null,
      list('Allergien & Unverträglichkeiten', attending.filter((g) => g.allergies).map((g) => h('li', h('.grow', `${g.first_name} ${g.last_name}`), h('span', g.allergies)))),
      list('Übernachtung gewünscht', attending.filter((g) => g.needs_stay).map((g) => h('li', `${g.first_name} ${g.last_name}${g.plus_one_name ? ` + ${g.plus_one_name}` : ''}`))),
      list('Musikwünsche (für DJ/Band)', guests.filter((g) => g.song_wish).map((g) => h('li', h('.grow', g.song_wish), h('span.small.muted', g.first_name)))),
      list('Nachrichten an euch', guests.filter((g) => g.note_to_couple).map((g) => h('li', { style: { display: 'block' } }, h('p', { style: { margin: 0 } }, g.note_to_couple), h('.small.muted', `${g.first_name} ${g.last_name}`))))),
  );
}

// ---------- Program & live ----------

async function pageProgram() {
  const [items, events] = await Promise.all([get('/program'), get('/events')]);
  await reload();
  const edit = async (p = {}) => {
    const v = await formDialog(p.id ? 'Programmpunkt bearbeiten' : 'Neuer Programmpunkt', [
      { name: 'event_id', label: 'Termin', type: 'select', value: p.event_id || (events.find((e) => e.is_main) || events[0])?.id, options: events.map((e) => ({ value: e.id, label: e.title })) },
      { name: 'title', label: 'Was', value: p.title, required: true },
      { name: 'start_time', label: 'Uhrzeit', type: 'time', value: p.start_time },
      { name: 'duration_min', label: 'Dauer (Minuten)', type: 'number', value: p.duration_min || 15, min: 1 },
      { name: 'host_name', label: 'Wer', value: p.host_name },
      { name: 'description', label: 'Beschreibung (sehen die Gäste)', type: 'textarea', value: p.description, rows: 2 },
      { name: 'requirements', label: 'Technik / Hinweise für Location & DJ', value: p.requirements },
    ]);
    if (!v) return;
    try { if (p.id) await patch(`/program/${p.id}`, v); else await post('/program', v); rerender(); } catch (e) { errorToast(e); }
  };
  const setLive = async (id) => { ctx.live = await post('/live', { item_id: id }); toast(id ? 'Live-Anzeige aktualisiert' : 'Automatik nach Zeitplan'); rerender(); };
  mount(main,
    pageHead('Ablauf & Live', 'Gäste sehen den Ablauf live in ihrer App und auf der Fotowand. Überraschungen der Trauzeugen bleiben für euch unsichtbar.', h('button.btn', { onclick: () => edit() }, icon('plus'), 'Programmpunkt')),
    ctx.live.current || ctx.live.next ? h('.live-strip', { style: { marginBottom: '16px' } }, h('span.dot'), h('.grow', ctx.live.current ? h('div', h('b', 'Jetzt: '), ctx.live.current.title) : 'Gerade nichts', ctx.live.next ? h('.small', `Danach: ${ctx.live.next.title} (${new Date(ctx.live.next.starts).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})`) : null),
      ctx.live.manual ? h('button.btn.secondary.small', { onclick: () => setLive(null) }, 'Automatik') : null) : null,
    events.length ? events.map((e) => {
      const list = items.filter((i) => i.event_id === e.id).sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99'));
      return h('.card', h('h3', e.title, h('span.small.muted', { style: { fontFamily: 'var(--sans)', fontWeight: 400 } }, fmtDateTime(e.starts_at))),
        list.length ? h('ul.list', list.map((p) => h('li',
          h('b', { style: { width: '52px' } }, p.start_time || '–'),
          h('.grow', h('div', p.title, ' ', p.status === 'requested' ? h('span.pill', 'Anfrage') : p.status === 'declined' ? h('span.pill.red', 'abgelehnt') : null),
            h('.small.muted', [p.host_name, `${p.duration_min} Min.`, p.requirements && `Technik: ${p.requirements}`].filter(Boolean).join(' · '))),
          p.status === 'requested' ? h('button.btn.small', { onclick: async () => { await patch(`/program/${p.id}`, { status: 'confirmed' }); rerender(); } }, 'Annehmen') : null,
          p.status === 'requested' ? h('button.btn.ghost.small', { onclick: async () => { await patch(`/program/${p.id}`, { status: 'declined' }); rerender(); } }, 'Ablehnen') : null,
          p.status === 'confirmed' ? h('button.btn.small', { class: ctx.live.current?.id === p.id ? '' : 'outline', onclick: () => setLive(p.id), title: 'Als „läuft gerade“ markieren' }, ctx.live.current?.id === p.id ? 'Läuft' : 'Jetzt') : null,
          h('button.icon-btn', { 'aria-label': 'Bearbeiten', onclick: () => edit(p) }, icon('edit', 18)),
          h('button.icon-btn', { 'aria-label': 'Löschen', onclick: async () => { if (await confirmDialog('Programmpunkt löschen?', p.title)) { await del(`/program/${p.id}`); rerender(); } } }, icon('trash', 18)))))
          : h('p.muted', 'Noch nichts geplant.'));
    }) : h('.card.empty', 'Legt zuerst Termine an.', h('div', h('a.btn', { href: '#termine', style: { marginTop: '10px' } }, 'Zu den Terminen'))));
}

// ---------- Announcements ----------

async function pageAnnouncements() {
  const list = await get('/announcements');
  const text = h('textarea', { rows: 4, placeholder: 'z. B. „Der Shuttlebus fährt um 17:15 an der Kirche ab.“' });
  const email = h('input', { type: 'checkbox' });
  mount(main,
    pageHead('Nachrichten an alle', 'Erscheint sofort in der Gäste-App. Für Erinnerungen per WhatsApp: Text kopieren und in eure Gruppe posten.'),
    h('.card',
      text,
      ctx.mail ? h('label.check', email, h('span', 'Zusätzlich per E-Mail an alle Gäste mit Adresse senden')) : null,
      h('.row', { style: { marginTop: '10px' } },
        h('button.btn', { onclick: async () => { if (!text.value.trim()) return; try { const r = await post('/announcements', { text: text.value, email: email.checked }); toast(`Veröffentlicht${r.mailed ? ` · ${r.mailed} E-Mails` : ''}`); rerender(); } catch (e) { errorToast(e); } } }, icon('send', 16), 'Veröffentlichen'),
        h('button.btn.outline', { onclick: () => copyText(text.value, 'Für WhatsApp kopiert') }, icon('whatsapp', 16), 'Für WhatsApp kopieren'))),
    list.map((a) => h('.card.flat.row', h('.grow', h('p', { style: { margin: 0 } }, a.text), h('.small.muted', fmtAgo(a.created_at))),
      h('button.icon-btn', { 'aria-label': 'Löschen', onclick: async () => { await del(`/announcements/${a.id}`); rerender(); } }, icon('trash', 18)))));
}

// ---------- Questions & FAQ ----------

async function pageQuestions() {
  const [qs, faqs] = await Promise.all([get('/questions'), get('/faqs')]);
  const editFaq = async (f = {}) => {
    const v = await formDialog(f.id ? 'FAQ bearbeiten' : 'Neue Frage & Antwort', [
      { name: 'question', label: 'Frage', value: f.question, required: true },
      { name: 'answer', label: 'Antwort', type: 'textarea', value: f.answer, required: true },
    ]);
    if (!v) return;
    if (f.id) await patch(`/faqs/${f.id}`, v); else await post('/faqs', v);
    rerender();
  };
  mount(main,
    pageHead('Fragen & FAQ', ctx.features.ai
      ? 'Gäste stellen Fragen in ihrer App. Der KI-Assistent antwortet aus euren Infos – was er nicht weiß, landet hier.'
      : 'Gäste stellen Fragen in ihrer App. Passende FAQ-Antworten erscheinen sofort – alles andere landet hier.',
    h('button.btn', { onclick: () => editFaq() }, icon('plus'), 'FAQ')),
    h('.section-title', 'Fragen von Gästen'),
    qs.length ? qs.map((x) => {
      const ans = h('textarea', { rows: 2, placeholder: 'Antwort …' }, x.answer || '');
      const toFaq = h('input', { type: 'checkbox', checked: !x.answer });
      return h('.card', h('.row.between', h('b', x.question), h('span.small.muted', `${x.first_name || 'Gast'} · ${fmtAgo(x.created_at)}`)),
        h('div', { style: { marginTop: '8px' } }, ans),
        h('.row', { style: { marginTop: '8px' } }, h('label.check', { style: { margin: 0 } }, toFaq, h('span.small', 'Auch als FAQ für alle speichern')), h('.grow'),
          h('button.btn.ghost.small', { onclick: async () => { await del(`/questions/${x.id}`); rerender(); } }, 'Löschen'),
          h('button.btn.small', { onclick: async () => { await patch(`/questions/${x.id}`, { answer: ans.value, add_to_faq: toFaq.checked }); toast('Antwort gespeichert'); rerender(); } }, 'Antworten')));
    }) : h('p.muted', 'Keine offenen Fragen.'),
    h('.section-title', 'Häufige Fragen (für alle sichtbar)'),
    faqs.length ? faqs.map((f) => h('.card.flat.row', h('.grow', h('b', f.question), h('div', f.answer)),
      h('button.icon-btn', { 'aria-label': 'Bearbeiten', onclick: () => editFaq(f) }, icon('edit', 18)),
      h('button.icon-btn', { 'aria-label': 'Löschen', onclick: async () => { await del(`/faqs/${f.id}`); rerender(); } }, icon('trash', 18))))
      : h('p.muted', 'Tipp: Parken, Kinder, Dresscode, Übernachtung, Geschenke – die Klassiker vorab beantworten spart euch viele Nachrichten.'));
}

// ---------- Photos ----------

async function pagePhotos(filter = 'alle') {
  const photos = await get('/photos');
  const views = { alle: (p) => p.approved, freigabe: (p) => !p.approved, favoriten: (p) => p.favorite, videos: (p) => p.kind === 'video' };
  const list = photos.filter(views[filter] || views.alle);
  const pending = photos.filter((p) => !p.approved).length;
  const open = (i) => lightbox(list, i, {
    src: (p) => mediaUrl(WID, p.file),
    caption: (p) => `${p.uploader_name || 'Gast'} · ${fmtAgo(p.created_at)}${p.likes ? ` · ♥ ${p.likes}` : ''}`,
    actions: (p, close) => [
      !p.approved ? h('button.btn.small', { onclick: async () => { await patch(`/photos/${p.id}`, { approved: 1 }); p.approved = 1; toast('Freigegeben'); } }, 'Freigeben') : null,
      h('button.icon-btn', { 'aria-label': 'Favorit', style: { color: p.favorite ? '#f3c76a' : '#fff' }, onclick: async (e) => { p.favorite = p.favorite ? 0 : 1; await patch(`/photos/${p.id}`, { favorite: p.favorite }); e.currentTarget.style.color = p.favorite ? '#f3c76a' : '#fff'; } }, icon('star', 24)),
      h('a.icon-btn', { href: mediaUrl(WID, p.file), download: '', style: { color: '#fff' }, 'aria-label': 'Herunterladen' }, icon('download', 24)),
      h('button.icon-btn', { 'aria-label': 'Löschen', style: { color: '#fff' }, onclick: async () => { if (await confirmDialog('Endgültig löschen?', 'Das Foto wird für alle entfernt.')) { await del(`/photos/${p.id}`); close(); rerender(); } } }, icon('trash', 24)),
    ],
  });
  mount(main,
    pageHead('Fotos & Videos', `${photos.length} Dateien von euren Gästen · ${ctx.stats.storageMb} MB`,
      h('a.btn.outline', { href: A('/archiv.zip') }, icon('download', 16), 'Alles herunterladen (ZIP)'),
      ctx.features.photobook ? h('button.btn', { onclick: () => photoBookDialog() }, icon('book', 16), 'Fotobuch') : null),
    W().moderate_photos ? null : h('.banner.small', { style: { marginBottom: '12px' } }, 'Fotos erscheinen sofort für alle. In den Einstellungen könnt ihr eine Freigabe vor Veröffentlichung einschalten.'),
    h('.row', { style: { marginBottom: '12px' } },
      h('.chips', [['alle', 'Alle'], ['freigabe', `Zur Freigabe (${pending})`], ['favoriten', '★ Favoriten'], ['videos', 'Videos']].map(([id, l]) => h('a.chip', { href: `#fotos/${id}`, class: id === filter ? 'on' : '', style: { textDecoration: 'none' } }, l))),
      filter === 'freigabe' && pending ? h('button.btn.small', { onclick: async () => { await post('/photos/approve-all'); rerender(); } }, 'Alle freigeben') : null),
    list.length ? h('.photo-grid', list.map((p, i) => h('.ph', { onclick: () => open(i) },
      h('img', { src: mediaUrl(WID, p.thumb || p.file), loading: 'lazy', alt: '' }),
      p.kind === 'video' ? h('.play', '▶') : null,
      p.favorite ? h('span.pill.badge', '★') : null,
      h('.meta', h('span', p.uploader_name || 'Gast'), p.likes ? h('span', `♥ ${p.likes}`) : null))))
      : h('.card.empty', h('.ico', '📷'), filter === 'freigabe' ? 'Nichts zu prüfen.' : 'Noch keine Fotos. Druckt die Tischkarten mit QR-Code aus!'),
    h('p.small.muted', { style: { marginTop: '14px' } }, '★ Favoriten kommen bevorzugt ins Fotobuch und auf die Dankeskarten.'));
}

function photoBookDialog() {
  const max = h('input', { type: 'number', min: 5, max: 200, value: 40 });
  modal('Fotobuch erstellen', h('div.stack',
    h('p', 'Wir wählen automatisch die besten Fotos aus: eure ★ Favoriten zuerst, dann die schärfsten Bilder – Fast-Duplikate werden übersprungen.'),
    h('label.field', h('span', 'Anzahl Fotos'), max),
    h('p.small.muted', 'Ergebnis: druckfertiges PDF (A4). Das könnt ihr bei jedem Fotobuch-Dienst oder Copyshop drucken lassen.')),
  { footer: (close) => [h('button.btn.ghost', { onclick: close }, 'Abbrechen'), h('a.btn', { href: A(`/fotobuch.pdf?max=${max.value}`), onclick: (e) => { e.currentTarget.href = A(`/fotobuch.pdf?max=${max.value}`); setTimeout(close, 300); } }, 'PDF erstellen')] });
}

// ---------- Guestbook ----------

async function pageGuestbook() {
  const entries = await get('/guestbook');
  mount(main,
    pageHead('Gästebuch', 'Texte, Sprach- und Videobotschaften eurer Gäste.', h('a.btn.outline', { href: A('/archiv.zip') }, icon('download', 16), 'Alles herunterladen')),
    !ctx.features.guestbookMedia ? premiumNote('Das Video- und Sprach-Gästebuch') : null,
    entries.length ? h('.grid2', entries.map((e) => h('.card',
      h('.row.between', h('b', e.author_name), h('.row', h('span.small.muted', fmtAgo(e.created_at)), h('button.icon-btn', { 'aria-label': 'Löschen', onclick: async () => { if (await confirmDialog('Eintrag löschen?', 'Der Eintrag wird endgültig gelöscht.')) { await del(`/guestbook/${e.id}`); rerender(); } } }, icon('trash', 16)))),
      e.kind === 'video' ? h('video', { src: mediaUrl(WID, e.file), controls: true, playsInline: true, preload: 'metadata', style: { borderRadius: '10px', marginTop: '8px', maxHeight: '360px', width: '100%' } }) : null,
      e.kind === 'audio' ? h('audio', { src: mediaUrl(WID, e.file), controls: true, preload: 'metadata', style: { width: '100%', marginTop: '8px' } }) : null,
      e.text ? h('p.serif', { style: { fontSize: '18px', marginTop: '8px' } }, e.text) : null)))
      : h('.card.empty', h('.ico', '💌'), 'Noch keine Einträge.'));
}

// ---------- Gifts ----------

async function pageGifts() {
  const { items, pledges } = await get('/gifts');
  const edit = async (it = {}) => {
    const v = await formDialog(it.id ? 'Wunsch bearbeiten' : 'Neuer Wunsch', [
      { name: 'kind', label: 'Art', type: 'select', value: it.kind || 'fund', options: [{ value: 'fund', label: 'Hochzeitskasse / Erlebnis (Gäste geben einen Betrag)' }, { value: 'item', label: 'Konkretes Geschenk (wird reserviert)' }] },
      { name: 'title', label: 'Titel', value: it.title, required: true, placeholder: 'z. B. Abendessen in Lissabon' },
      { name: 'description', label: 'Beschreibung', type: 'textarea', value: it.description, rows: 2 },
      { name: 'price', label: 'Betrag in € (Zielbetrag bzw. Preis pro Stück)', type: 'number', value: it.price_cents ? it.price_cents / 100 : '', min: 0, step: '0.01' },
      { name: 'quantity', label: 'Anzahl (nur bei konkreten Geschenken, z. B. 8 Weingläser)', type: 'number', value: it.quantity || 1, min: 1 },
      { name: 'link', label: 'Link zum Shop (optional)', type: 'url', value: it.link },
    ]);
    if (!v) return;
    const body = { kind: v.kind, title: v.title, description: v.description, price_cents: Math.round(Number(v.price || 0) * 100), quantity: Number(v.quantity) || 1, link: v.link };
    try { if (it.id) await patch(`/gifts/${it.id}`, body); else await post('/gifts', body); rerender(); } catch (e) { errorToast(e); }
  };
  const sum = pledges.reduce((s, p) => s + p.amount_cents, 0);
  mount(main,
    pageHead('Geschenke', 'Wunschliste und Hochzeitskasse. Bezahlt wird direkt an euch (Überweisung mit GiroCode oder PayPal) – ohne Gebühren.', h('button.btn', { onclick: () => edit() }, icon('plus'), 'Wunsch')),
    !W().gift_iban && !W().gift_paypal ? h('.banner', { style: { marginBottom: '12px' } }, 'Tipp: Hinterlegt in den Einstellungen eure IBAN oder PayPal.me – dann bekommen Gäste einen GiroCode zum Scannen.') : null,
    items.length ? items.map((it) => {
      const ps = pledges.filter((p) => p.item_id === it.id);
      const got = ps.reduce((s, p) => s + p.amount_cents, 0);
      const units = ps.reduce((s, p) => s + p.units, 0);
      return h('.card',
        h('.row.between', h('div', h('h3', { style: { margin: 0 } }, it.title), h('.small.muted', it.kind === 'fund' ? `Kasse · Ziel ${money(it.price_cents)}` : `Geschenk · ${money(it.price_cents)} · ${units}/${it.quantity} vergeben`)),
          h('.row', h('button.icon-btn', { 'aria-label': 'Bearbeiten', onclick: () => edit(it) }, icon('edit', 18)), h('button.icon-btn', { 'aria-label': 'Löschen', onclick: async () => { if (await confirmDialog('Wunsch löschen?', 'Auch alle Zusagen dazu werden gelöscht.')) { await del(`/gifts/${it.id}`); rerender(); } } }, icon('trash', 18)))),
        it.kind === 'fund' && it.price_cents ? h('div', { style: { marginTop: '8px' } }, h('.progress', h('div', { style: { width: `${Math.min(100, (got / it.price_cents) * 100)}%` } })), h('.small.muted', `${money(got)} zugesagt`)) : null,
        ps.length ? h('ul.list', { style: { marginTop: '8px' } }, ps.map((p) => h('li',
          h('.grow', h('b', p.name), p.message ? h('.small', `„${p.message}“`) : null),
          h('span', it.kind === 'item' ? `${p.units}×` : money(p.amount_cents)),
          h('label.check', { style: { margin: 0 } }, h('input', { type: 'checkbox', checked: Boolean(p.paid), onchange: (e) => patch(`/pledges/${p.id}`, { paid: e.target.checked ? 1 : 0 }) }), h('span.small', 'erhalten'))))) : null);
    }) : h('.card.empty', h('.ico', '🎁'), 'Noch keine Wünsche. Beliebt: Hochzeitsreise in Etappen („Abendessen am Strand – 80 €“).'),
    pledges.length ? h('p.muted', { style: { marginTop: '12px' } }, `Insgesamt zugesagt: ${money(sum)}`) : null);
}

// ---------- Seating ----------

async function pageSeating() {
  if (!ctx.features.seating) { mount(main, pageHead('Sitzplan'), premiumNote('Der Sitzplan-Assistent')); return; }
  const { tables, rules, guests } = await get('/seating');
  const attending = guests.filter((g) => g.rsvp !== 'no');
  const seats = (g) => 1 + (g.plus_one_name ? 1 : 0) + (g.children || 0);
  const name = (g) => `${g.first_name} ${g.last_name}`.trim();
  const byId = new Map(guests.map((g) => [g.id, g]));
  const move = async (gid, tid) => { await patch(`/guests/${gid}`, { table_id: tid ?? '' }); rerender(); };
  const guestChip = (g) => h('.seat-guest', { draggable: 'true', class: g.rsvp === 'no' ? 'no' : '', ondragstart: (e) => e.dataTransfer.setData('text/plain', g.id), title: g.group_label || '' },
    h('span', name(g), g.plus_one_name ? h('span.muted', ` +${seats(g) - 1}`) : g.children ? h('span.muted', ` +${g.children}`) : null, g.rsvp === 'open' ? h('span.muted', ' ?') : null),
    h('select', { style: { width: 'auto', minHeight: '28px', padding: '2px 4px', fontSize: '12px' }, onchange: (e) => move(g.id, e.target.value ? Number(e.target.value) : null) },
      h('option', { value: '' }, '–'), tables.map((t) => h('option', { value: t.id, selected: g.table_id === t.id }, t.name))));
  const dropZone = (tid, ...children) => h('.seat-table', {
    ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('drop'); },
    ondragleave: (e) => e.currentTarget.classList.remove('drop'),
    ondrop: (e) => { e.preventDefault(); move(Number(e.dataTransfer.getData('text/plain')), tid); },
  }, ...children);
  const unplaced = attending.filter((g) => !g.table_id);
  mount(main,
    pageHead('Sitzplan', 'Gäste per Drag & Drop oder Auswahlfeld zuordnen – oder den Assistenten verteilen lassen. Gäste finden ihren Platz in der App.',
      h('button.btn.outline', { onclick: async () => { const v = await formDialog('Tische hinzufügen', [{ name: 'count', label: 'Anzahl', type: 'number', value: 1, min: 1 }, { name: 'capacity', label: 'Plätze pro Tisch', type: 'number', value: 8, min: 1 }]); if (v) { await post('/tables', v); rerender(); } } }, icon('plus'), 'Tische'),
      h('button.btn', { onclick: async () => {
        const v = await formDialog('Sitzplan-Assistent', [{ name: 'keep', label: 'Bestehende Zuordnungen behalten', type: 'checkbox', value: true }], { submit: 'Verteilen', extra: h('p.small.muted', 'Berücksichtigt Gruppen, Begleitungen, Kinder und eure Regeln („zusammen“/„getrennt“). Absagen werden nicht platziert.') });
        if (!v) return;
        try { const r = await post('/seating/auto', { keep_existing: v.keep }); toast(`${r.placed} platziert${r.unplaced ? `, ${r.unplaced} ohne Platz (zu wenig Plätze?)` : ''}`); rerender(); } catch (e) { errorToast(e); }
      } }, icon('sparkle', 16), 'Automatisch verteilen')),
    h('.seat-grid',
      dropZone(null, h('header', h('b', 'Ohne Platz'), h('span.pill.gray', unplaced.length)), unplaced.map(guestChip)),
      tables.map((t) => {
        const at = guests.filter((g) => g.table_id === t.id);
        const used = at.reduce((s, g) => s + seats(g), 0);
        return dropZone(t.id,
          h('header', h('b', { style: { cursor: 'pointer' }, title: 'Umbenennen', onclick: async () => { const v = await formDialog('Tisch', [{ name: 'name', label: 'Name', value: t.name, required: true }, { name: 'capacity', label: 'Plätze', type: 'number', value: t.capacity }]); if (v) { await patch(`/tables/${t.id}`, v); rerender(); } } }, t.name),
            h('.row', { style: { gap: '4px' } }, h('span.pill', { class: used > t.capacity ? 'red' : used === t.capacity ? 'green' : '' }, `${used}/${t.capacity}`),
              h('button.icon-btn', { 'aria-label': 'Tisch löschen', onclick: async () => { if (await confirmDialog('Tisch löschen?', `${t.name} löschen? Die Gäste werden wieder „ohne Platz“.`)) { await del(`/tables/${t.id}`); rerender(); } } }, icon('trash', 15)))),
          at.map(guestChip));
      })),
    h('.card', { style: { marginTop: '16px' } },
      h('.row.between', h('h3', { style: { margin: 0 } }, 'Regeln'), h('button.btn.outline.small', { onclick: async () => {
        const opts = guests.map((g) => ({ value: g.id, label: name(g) }));
        const v = await formDialog('Neue Regel', [
          { name: 'a', label: 'Gast', type: 'select', options: opts },
          { name: 'kind', label: 'soll', type: 'select', options: [{ value: 'together', label: 'zusammen sitzen mit' }, { value: 'apart', label: 'NICHT am selben Tisch sitzen wie' }] },
          { name: 'b', label: 'Gast', type: 'select', options: opts },
        ]);
        if (!v) return;
        try { await post('/seat-rules', { guest_a: Number(v.a), guest_b: Number(v.b), kind: v.kind }); rerender(); } catch (e) { errorToast(e); }
      } }, icon('plus', 16), 'Regel')),
      rules.length ? h('ul.list', rules.map((r) => h('li', h('.grow', `${name(byId.get(r.guest_a) || { first_name: '?', last_name: '' })} ${r.kind === 'together' ? 'sitzt mit' : 'sitzt nicht bei'} ${name(byId.get(r.guest_b) || { first_name: '?', last_name: '' })}`),
        h('button.icon-btn', { 'aria-label': 'Regel löschen', onclick: async () => { await del(`/seat-rules/${r.id}`); rerender(); } }, icon('trash', 16)))))
        : h('p.small.muted', 'z. B. „Onkel Klaus nicht neben Tante Maria“ oder „die Kinder zu ihren Eltern“.')));
}

// ---------- Print & share ----------

function pagePrint() {
  const qr = (url) => h('img', { src: `/api/qr.svg?d=${encodeURIComponent(url)}`, alt: 'QR-Code', style: { width: '120px', borderRadius: '8px' } });
  const card = (title, text, ...actions) => h('.card', h('h3', title), h('p.small', text), h('.row', actions));
  mount(main,
    pageHead('Drucken & Teilen', 'Alles, was ihr für den Tag selbst braucht.'),
    h('.grid2',
      h('.card.row', { style: { alignItems: 'flex-start' } }, qr(ctx.links.upload), h('.grow',
        h('h3', 'Foto-Upload-Link'), h('p.small', 'Für Tischkarten und Aushänge. Wer den QR-Code scannt, kann sofort Fotos hochladen – ohne App, ohne Konto.'),
        h('.row', h('button.btn.small.outline', { onclick: () => copyText(ctx.links.upload) }, 'Link kopieren'), h('a.btn.small.ghost', { href: ctx.links.upload, target: '_blank' }, 'Testen')))),
      ctx.features.wall
        ? h('.card.row', { style: { alignItems: 'flex-start' } }, qr(ctx.links.wall), h('.grow',
          h('h3', 'Live-Fotowand'), h('p.small', 'Auf Beamer oder Fernseher öffnen (Laptop, Fire-TV-Stick, Smart-TV-Browser). Neue Fotos erscheinen sofort, dazu der aktuelle Programmpunkt.'),
          h('.row', h('button.btn.small.outline', { onclick: () => copyText(ctx.links.wall) }, 'Link kopieren'), h('a.btn.small.ghost', { href: ctx.links.wall, target: '_blank' }, 'Öffnen'))))
        : h('.card', h('h3', 'Live-Fotowand'), premiumNote('Die Live-Fotowand')),
      card('Tischkarten mit QR-Code', 'Vier Karten pro A4-Seite, je Tisch eine – mit Tischname. Ohne Tische: leere Karten.',
        h('a.btn.small', { href: A('/tischkarten.pdf') }, icon('printer', 16), 'Tischkarten (PDF)'),
        h('a.btn.small.outline', { href: A('/tischkarten.pdf?leer=8') }, '+ 8 leere Karten')),
      card('Aushang', 'A4-Plakat für Eingang, Bar oder Fotobox.',
        h('a.btn.small', { href: A('/aushang.pdf') }, icon('printer', 16), 'Foto-Aushang'),
        ctx.features.wall ? h('a.btn.small.outline', { href: A('/aushang.pdf?typ=wand') }, 'Fotowand-Aushang') : null),
      card('Gästeliste', 'Mit Zusagen, Essen, Allergien und Tisch – für Location und Catering.',
        h('a.btn.small', { href: A('/gaesteliste.pdf') }, icon('download', 16), 'PDF'), h('a.btn.small.outline', { href: A('/guests/export.csv') }, 'Excel (CSV)')),
      card('Dankeskarten', 'Eine Karte (A6) pro Gast mit Zusage – mit einem Foto, auf dem der Gast zu sehen ist (sofern bekannt). Text in den Einstellungen.',
        h('a.btn.small', { href: A('/dankeskarten.pdf') }, icon('printer', 16), 'Dankeskarten (PDF)')),
    ));
}

// ---------- Settings ----------

async function pageSettings(section) {
  await reload();
  const w = W();
  const f = {
    partner1: h('input', { type: 'text', value: w.partner1 }), partner2: h('input', { type: 'text', value: w.partner2 }),
    wedding_date: h('input', { type: 'date', value: w.wedding_date || '' }), motto: h('input', { type: 'text', value: w.motto || '' }),
    welcome_text: h('textarea', { rows: 3 }, w.welcome_text || ''), story_text: h('textarea', { rows: 5 }, w.story_text || ''),
    dresscode: h('input', { type: 'text', value: w.dresscode || '' }), rsvp_deadline: h('input', { type: 'date', value: w.rsvp_deadline || '' }),
    meal_options: h('input', { type: 'text', value: (w.meal_options || '').split('|').join(', ') }),
    moderate_photos: h('input', { type: 'checkbox', checked: Boolean(w.moderate_photos) }),
    unplugged_ceremony: h('input', { type: 'checkbox', checked: Boolean(w.unplugged_ceremony) }),
    face_search: h('input', { type: 'checkbox', checked: Boolean(w.face_search), disabled: ctx.features.plan !== 'premium' }),
    gift_account_holder: h('input', { type: 'text', value: w.gift_account_holder || '' }), gift_iban: h('input', { type: 'text', value: w.gift_iban || '' }),
    gift_paypal: h('input', { type: 'text', value: w.gift_paypal || '', placeholder: 'paypal.me/euername' }), gift_note: h('textarea', { rows: 3 }, w.gift_note || ''),
    thanks_text: h('textarea', { rows: 4, placeholder: 'Liebe/r {vorname}, …' }, w.thanks_text || ''),
  };
  const save = async () => {
    const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value]));
    body.meal_options = f.meal_options.value.split(',').map((s) => s.trim()).filter(Boolean).join('|');
    body.rsvp_deadline = body.rsvp_deadline || null;
    body.wedding_date = body.wedding_date || null;
    try { await patch('/', body); toast('Gespeichert'); await reload(); renderNav('einstellungen'); } catch (e) { errorToast(e); }
  };
  const coverInput = h('input', { type: 'file', accept: 'image/*', class: 'hidden', onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = await processImage(file);
    const form = new FormData(); form.append('file', img.file, 'cover.jpg');
    try { await upload(A('/cover'), form); toast('Titelfoto gespeichert'); rerender(); } catch (err) { errorToast(err); }
  } });
  const field = (label, el, hint) => h('label.field', h('span', label), el, hint ? h('.small.muted', { style: { marginTop: '4px' } }, hint) : null);
  const check = (el, label, hint) => h('label.check', el, h('span', label, hint ? h('.small.muted', hint) : null));
  mount(main,
    pageHead('Einstellungen', null, h('button.btn', { onclick: save }, 'Speichern')),
    designPicker(w),
    h('.grid2',
      h('.card', h('h3', 'Eure Hochzeit'),
        h('.row', h('.grow', field('Name 1', f.partner1)), h('.grow', field('Name 2', f.partner2))),
        field('Datum', f.wedding_date), field('Motto', f.motto),
        field('Begrüßung (Startseite der Gäste)', f.welcome_text), field('Eure Geschichte (optional)', f.story_text)),
      h('div',
        h('.card', h('h3', 'Titelfoto'),
          w.cover_path ? h('img', { src: mediaUrl(WID, w.cover_path), style: { borderRadius: '10px', maxHeight: '200px', objectFit: 'cover', width: '100%' } }) : h('p.muted.small', 'Erscheint im Bogen oben auf jeder Seite.'),
          coverInput, h('button.btn.outline.small', { style: { marginTop: '10px' }, onclick: () => coverInput.click() }, w.cover_path ? 'Ändern' : 'Foto wählen')),
        logoCard(w),
        h('.card', h('h3', 'Für die Gäste'),
          field('Dresscode', f.dresscode), field('Rückmeldung bis', f.rsvp_deadline),
          field('Essensoptionen', f.meal_options, 'Mit Komma getrennt. Leer lassen, wenn ihr nicht fragen wollt.'))),
      h('.card', h('h3', 'Fotos'),
        check(f.moderate_photos, 'Fotos erst nach unserer Freigabe zeigen'),
        check(f.unplugged_ceremony, 'Unplugged Ceremony', 'Gäste werden gebeten, während der Trauung keine Fotos zu machen.'),
        check(f.face_search, '„Finde meine Fotos“ (Gesichtserkennung)', ctx.features.plan === 'premium'
          ? 'Läuft vollständig auf den Geräten der Gäste; nur abstrakte Merkmale werden gespeichert. Gäste nutzen es freiwillig. Bitte in eurer Einladung darauf hinweisen.'
          : 'Im Premium-Paket enthalten.')),
      h('.card', h('h3', 'Geschenke & Bezahlung'),
        field('Kontoinhaber', f.gift_account_holder), field('IBAN', f.gift_iban, 'Für den GiroCode, den Gäste mit ihrer Banking-App scannen.'),
        field('PayPal.me', f.gift_paypal), field('Text zu Geschenken', f.gift_note)),
      h('.card', h('h3', 'Dankeskarten'), field('Text', f.thanks_text, 'Platzhalter: {vorname}, {name}'))),
    h('.row', { style: { margin: '16px 0' } }, h('button.btn', { onclick: save }, 'Speichern')),
    h('.grid2', { id: 'paket' },
      h('.card', h('h3', 'Paket'),
        ctx.features.plan === 'premium'
          ? h('p', 'Ihr nutzt ', h('b', 'Premium'), ': Fotowand, Videos, Video-Gästebuch, „Finde meine Fotos“, Fotobuch, Sitzplan-Assistent', ctx.aiConfigured ? ' und KI-Assistent.' : '.')
          : [h('p', 'Ihr nutzt das kostenlose ', h('b', 'Basis-Paket'), ` (bis ${ctx.features.maxGuests} Einladungen, ${ctx.features.maxPhotos} Fotos).`),
            h('button.btn', { onclick: async () => { await post('/upgrade', { note: 'Upgrade-Anfrage aus der Verwaltung' }); toast('Anfrage gesendet – wir melden uns!'); } }, 'Premium anfragen')]),
      h('.card', h('h3', 'Konto'),
        h('button.btn.outline.small', { onclick: async () => {
          const v = await formDialog('Passwort ändern', [{ name: 'old', label: 'Bisheriges Passwort', type: 'password', required: true }, { name: 'new', label: 'Neues Passwort (mind. 8 Zeichen)', type: 'password', required: true }]);
          if (v) try { await api('POST', '/api/auth/password', v); toast('Passwort geändert'); } catch (e) { errorToast(e); }
        } }, 'Passwort ändern'),
        h('details', { style: { marginTop: '14px' } }, h('summary.small', { style: { color: 'var(--red)', cursor: 'pointer' } }, 'Hochzeit endgültig löschen'),
          h('p.small', 'Löscht alle Gäste, Fotos, Videos und Einträge unwiderruflich. Ladet vorher das ZIP-Archiv herunter!'),
          h('button.btn.danger.small', { onclick: async () => {
            const v = await formDialog('Wirklich löschen?', [{ name: 'confirm', label: `Zur Bestätigung „${w.slug}“ eingeben`, required: true }], { submit: 'Endgültig löschen' });
            if (!v) return;
            try { await del('/', { confirm: v.confirm }); localStorage.removeItem('hb_wid'); location.href = '/'; } catch (e) { errorToast(e); }
          } }, 'Alles löschen')))));
  if (section === 'paket') $('#paket').scrollIntoView();
}

// ---------- Couple logo (replaces the name lettering) ----------

/** Pads any image to a transparent square PNG (max. 1024 px) – logos are never cropped. */
async function squareLogo(file) {
  let src;
  try { src = await createImageBitmap(file); } catch {
    src = new Image();
    src.src = URL.createObjectURL(file);
    await src.decode();
  }
  const side = Math.min(1024, Math.max(src.width, src.height));
  const scale = side / Math.max(src.width, src.height);
  const c = document.createElement('canvas');
  c.width = side; c.height = side;
  const w = Math.round(src.width * scale), hgt = Math.round(src.height * scale);
  c.getContext('2d').drawImage(src, (side - w) / 2, (side - hgt) / 2, w, hgt);
  return { blob: await new Promise((r) => c.toBlob(r, 'image/png')), wasSquare: Math.abs(src.width - src.height) <= 2 };
}

function logoCard(w) {
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'hidden', onchange: async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { blob, wasSquare } = await squareLogo(file);
      const form = new FormData();
      form.append('file', blob, 'logo.png');
      await upload(A('/logo'), form);
      toast(wasSquare ? 'Logo gespeichert' : 'Logo gespeichert – es war nicht quadratisch und wurde mit transparentem Rand ergänzt.');
      rerender();
    } catch (err) { errorToast(err); }
  } });
  return h('.card', h('h3', 'Logo'),
    w.logo_path
      ? h('.logo-preview', h('img', { src: mediaUrl(WID, w.logo_path), alt: 'Euer Logo' }))
      : h('p.muted.small', 'Statt eurer Namen als Schriftzug könnt ihr ein eigenes Logo zeigen – in der Gäste-App, auf der Foto-Upload-Seite, der Fotowand, den Tischkarten, dem Aushang und dem Fotobuch.'),
    h('p.small.muted', 'Quadratisch, mindestens 500 × 500 Pixel. Am schönsten als PNG mit transparentem Hintergrund. Nicht quadratische Bilder werden nicht beschnitten, sondern mit transparentem Rand ergänzt. Bei dunklen Designs (Klassisch, Ballnacht, Wunderkerzen) wirkt ein helles Logo am besten.'),
    input,
    h('.row', { style: { marginTop: '10px' } },
      h('button.btn.outline.small', { onclick: () => input.click() }, w.logo_path ? 'Logo ändern' : 'Logo hochladen'),
      w.logo_path ? h('button.btn.ghost.small', { onclick: async () => {
        if (!(await confirmDialog('Logo entfernen?', 'Die Gästeseiten zeigen dann wieder eure Namen als Schriftzug.', 'Entfernen'))) return;
        try { await del('/logo'); toast('Logo entfernt'); rerender(); } catch (err) { errorToast(err); }
      } }, 'Entfernen') : null));
}

// ---------- Design template for the guest pages ----------

function designPicker(w) {
  const current = w.theme || 'klassisch';
  const choose = async (t) => {
    if (t.id === current) return;
    try {
      await patch('/', { theme: t.id });
      toast(`Design „${t.name}“ ist aktiv – Gäste sehen es sofort.`);
      rerender();
    } catch (e) { errorToast(e); }
  };
  const preview = (t) => modal(t.name, h('div.stack',
    h('img', { src: `/img/themes/${t.id}.jpg`, alt: `Vorschau ${t.name}`, style: { width: '100%', maxWidth: '390px', margin: '0 auto', border: '1px solid var(--line)' } }),
    h('p.small.muted', t.desc)), {
    footer: (close) => [h('button.btn.ghost', { onclick: close }, 'Schließen'), h('button.btn', { onclick: () => { close(); choose(t); } }, t.id === current ? 'Aktiv' : 'Dieses Design wählen')],
  });
  return h('.card', { style: { marginBottom: '16px' } },
    h('h3', 'Design der Gästeseiten'),
    h('p.small.muted', 'Gilt für die Gäste-App, die Foto-Upload-Seite und die Fotowand. Ihr könnt es jederzeit wechseln.'),
    h('.theme-grid', THEMES.map((t) => h('button.theme-opt', { type: 'button', class: t.id === current ? 'on' : '', onclick: () => choose(t), 'aria-pressed': String(t.id === current) },
      h('img', { src: `/img/themes/${t.id}.jpg`, alt: '', loading: 'lazy' }),
      h('span.theme-name', t.name, t.id === current ? h('span.pill.green', { style: { marginLeft: '6px' } }, 'aktiv') : null),
      h('span.theme-desc', t.desc),
      h('span.theme-preview', { role: 'link', onclick: (e) => { e.stopPropagation(); preview(t); } }, 'Größer ansehen')))));
}

boot().catch((e) => mount(main, h('.banner.rose', e.message)));
