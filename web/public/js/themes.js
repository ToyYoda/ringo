// Templates the couple can choose for the guest-facing pages (guest app, QR upload, live wall).
import { h, arcHeader, coupleLogo } from './common.js';

export const THEMES = [
  { id: 'klassisch', name: 'Klassisch', desc: 'Bordeaux und Gold mit geschwungenem Bogen – der Standard.' },
  { id: 'zeitung', name: 'Hochzeitszeitung', desc: 'Zeitungspapier, Schlagzeilen und ein Live-Laufband. Humorvoll und unverwechselbar.' },
  { id: 'sofortbild', name: 'Sofortbild', desc: 'Polaroids mit Klebeband und Edding-Schrift. Locker und persönlich.' },
  { id: 'konfetti', name: 'Konfetti-Pop', desc: 'Kräftige Farben, große Schrift, Konfetti. Laut und fröhlich.' },
  { id: 'standesamt', name: 'Standesamt', desc: 'Aufgebot mit Stempel, Ablauf als Abfahrtstafel. Trocken-ironisch.' },
  { id: 'ballnacht', name: 'Ballnacht', desc: 'Smaragdgrün und Champagner im Art-déco-Stil. Elegant und abendlich.' },
  { id: 'wunderkerzen', name: 'Wunderkerzen', desc: 'Nachtblau mit goldenen Funken. Festlich und edel.' },
  { id: 'atelier', name: 'Atelier', desc: 'Viel Weißraum, Versalien und feine Linien in Oliv und Champagner. Ruhig und edel.' },
  { id: 'bluetenmeer', name: 'Blütenmeer', desc: 'Blumenranke in Rosé, Moosgrün und Himbeere. Warm und sommerlich.' },
];

const KNOWN = new Set(THEMES.map((t) => t.id));

/** Applies a template to the page; remembers it so the next visit renders in the right look at once. */
export function applyTheme(id) {
  const theme = KNOWN.has(id) ? id : 'klassisch';
  if (theme === 'klassisch') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('ringo_theme', theme); } catch { /* storage blocked */ }
  return theme;
}

export function applyStoredTheme() {
  try { applyTheme(localStorage.getItem('ringo_theme')); } catch { /* storage blocked */ }
}

export const currentTheme = () => document.documentElement.dataset.theme || 'klassisch';

const svg = (markup) => h('span', { style: { display: 'contents' }, html: markup });
const longDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const dotDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
/** Name lettering of a template – or the couple's uploaded logo in its place. */
const lettering = (opts, fallback) => (opts.logo ? h('.th-logo', coupleLogo(opts.logo, `${opts.partner1} & ${opts.partner2}`)) : fallback);
const titleBlock = (title, subtitle) => (title ? h('.th-title', h('h1', title), subtitle ? h('p', subtitle) : null) : null);

/**
 * Header for the current template.
 * opts: { partner1, partner2, motto, cover, date, place, title, subtitle, big }
 */
export function themedHeader(opts) {
  const theme = currentTheme();
  const build = BUILDERS[theme];
  if (!build) return arcHeader(opts);
  return h('div', build(opts), titleBlock(opts.title, opts.subtitle));
}

const BUILDERS = {
  atelier: (o) => { const { partner1, partner2, motto, cover, date, place, big } = o; return h('header.th-head.th-atelier', { class: big ? '' : 'small' },
    h('.kick', [longDate(date), place].filter(Boolean).join(' · ') || 'Wir heiraten'),
    lettering(o, h('.mast', partner1, h('span', '✧'), partner2)),
    big ? h('.ornament', { 'aria-hidden': 'true' }, '✧') : null,
    big && motto ? h('.motto', motto) : null,
    big && cover ? h('.photo', h('img', { src: cover, alt: '' })) : null); },

  zeitung: (o) => { const { partner1, partner2, motto, cover, date, place, big } = o; return h('header.th-head.th-zeitung', { class: big ? '' : 'small' },
    h('.meta', h('span', 'Ausgabe Nr. 1'), h('span', place || ''), h('span', longDate(date))),
    lettering(o, h('.mast', partner1, ' ', h('span', '&'), ' ', partner2)),
    h('.tag', motto ? `${motto} · ` : '', 'Die Hochzeitszeitung'),
    big && cover ? h('.photo', h('img', { src: cover, alt: '' })) : null); },

  sofortbild: (o) => { const { partner1, partner2, cover, date, place, big } = o; return h('header.th-head.th-sofortbild', { class: big ? '' : 'small' },
    h('.meta', h('span', dotDate(date), h('br'), place || ''), big ? null : lettering(o, h('span', `${partner1} & ${partner2}`))),
    big ? h('.polas',
      h('.pola.p1', h('.tape'), h('.img', cover ? h('img', { src: cover, alt: '', style: { objectPosition: '30% 50%' } }) : null), o.logo ? null : h('span', partner1)),
      h('.pola.p2', h('.img', o.logo ? coupleLogo(o.logo, `${partner1} & ${partner2}`) : cover ? h('img', { src: cover, alt: '', style: { objectPosition: '70% 50%' } }) : null), o.logo ? null : h('span', partner2))) : null,
    big ? null : h('.polas')); },

  konfetti: (o) => { const { partner1, partner2, date, place, big } = o; return h('header.th-head.th-konfetti', { class: big ? '' : 'small' },
    svg('<svg viewBox="0 0 90 90" aria-hidden="true"><circle cx="20" cy="18" r="9" fill="#FFE27A"/><rect x="52" y="8" width="16" height="16" fill="#2D3FE0" transform="rotate(20 60 16)"/><circle cx="70" cy="58" r="12" fill="#7BE0AD"/><rect x="18" y="52" width="22" height="9" fill="#FFF4E8" transform="rotate(-25 29 56)"/></svg>'),
    h('span.chip-date', [longDate(date), place].filter(Boolean).join(' · ') || 'Wir heiraten'),
    o.logo ? h('div', lettering(o), big ? h('.mast', h('em', 'heiraten!')) : null) : h('.mast', partner1, h('br'), `+ ${partner2}`, big ? h('em', 'heiraten!') : null)); },

  standesamt: (o) => {
    const { partner1, partner2, date, place, big } = o;
    const d = date ? new Date(date) : null;
    const nr = d ? `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}` : '0001';
    return h('header.th-head.th-standesamt', { class: big ? '' : 'small' },
      h('div', h('small', `Aufgebot · Standesamt${place ? ` ${place}` : ''}`), lettering(o, h('.mast', partner1, h('br'), `& ${partner2}`))),
      h('.reg', 'Nr.', h('b', nr), d ? d.getFullYear() : ''),
      big ? h('.stamp', 'Eingeladen') : null);
  },

  ballnacht: (o) => { const { partner1, partner2, date, big } = o; return h('header.th-head.th-ballnacht', { class: big ? '' : 'small' },
    svg('<svg viewBox="0 0 150 70" fill="none" stroke="#C9A86A" stroke-width="1.2" aria-hidden="true"><path d="M75 68 A60 60 0 0 1 15 8"/><path d="M75 68 A60 60 0 0 0 135 8"/><path d="M75 68 L15 8 M75 68 L35 2 M75 68 L55 -2 M75 68 L75 -4 M75 68 L95 -2 M75 68 L115 2 M75 68 L135 8"/><path d="M75 68 A30 30 0 0 1 45 38 M75 68 A30 30 0 0 0 105 38"/><circle cx="75" cy="68" r="3" fill="#C9A86A"/></svg>'),
    lettering(o, h('.mast', partner1, h('span', 'und'), partner2)),
    date ? h('.date', longDate(date).replace(/\./g, ' ·')) : null); },

  wunderkerzen: (o) => { const { partner1, partner2, date, big } = o; return h('header.th-head.th-wunderkerzen', { class: big ? '' : 'small' },
    svg(`<svg viewBox="0 0 390 ${big ? 300 : 180}" preserveAspectRatio="xMidYMin slice" aria-hidden="true"><g stroke="#F5C870" stroke-linecap="round"><g stroke-width="1.4" opacity=".9"><path d="M50 50 l-14 -10 M50 50 l-17 2 M50 50 l-10 14 M50 50 l4 -17 M50 50 l15 -8 M50 50 l16 6 M50 50 l6 16 M50 50 l-6 16"/><path d="M340 40 l-12 -9 M340 40 l-15 2 M340 40 l-9 12 M340 40 l3 -15 M340 40 l13 -7 M340 40 l14 5 M340 40 l5 14"/></g><g stroke-width="1" opacity=".6"><path d="M318 ${big ? 230 : 140} l-9 -7 M318 ${big ? 230 : 140} l-11 1 M318 ${big ? 230 : 140} l3 -11 M318 ${big ? 230 : 140} l10 -5 M318 ${big ? 230 : 140} l10 4"/></g></g><g fill="#F5C870"><circle cx="30" cy="120" r="1.6"/><circle cx="120" cy="30" r="1.2"/><circle cx="210" cy="20" r="1.8"/><circle cx="270" cy="84" r="1.2"/><circle cx="360" cy="140" r="1.6"/><circle cx="70" cy="160" r="1"/><circle cx="250" cy="160" r="1.2"/></g></svg>`),
    lettering(o, h('.mast', partner1, h('em', '&'), partner2)),
    date ? h('.date', new Date(date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) : null); },

  bluetenmeer: (o) => { const { partner1, partner2, date, place, big } = o; return h('header.th-head.th-bluetenmeer', { class: big ? '' : 'small' },
    svg('<svg viewBox="0 0 390 130" preserveAspectRatio="xMidYMin meet" fill="none" aria-hidden="true"><g stroke="#3E6B4E" stroke-width="2" stroke-linecap="round"><path d="M-10 100 C40 80 70 44 120 30"/><path d="M40 84 c-6 -18 4 -30 20 -34 c-2 16 -10 28 -20 34z" fill="#3E6B4E"/><path d="M78 54 c-2 -18 10 -28 26 -28 c-4 16 -14 26 -26 28z" fill="#5E8B6B"/><path d="M400 110 C350 88 320 56 268 40"/><path d="M346 94 c8 -16 -2 -30 -18 -36 c0 16 6 28 18 36z" fill="#3E6B4E"/><path d="M306 60 c4 -18 -6 -30 -22 -32 c2 16 10 26 22 32z" fill="#5E8B6B"/></g><circle cx="130" cy="30" r="16" fill="#B04A5A"/><circle cx="130" cy="30" r="8" fill="#D9808D"/><circle cx="130" cy="30" r="3" fill="#F6E9E7"/><circle cx="258" cy="38" r="20" fill="#D9808D"/><circle cx="258" cy="38" r="10" fill="#B04A5A"/><circle cx="258" cy="38" r="3.5" fill="#F6E9E7"/><circle cx="20" cy="102" r="11" fill="#E9B8BF"/><circle cx="372" cy="108" r="13" fill="#B04A5A"/><circle cx="372" cy="108" r="5" fill="#E9B8BF"/><circle cx="196" cy="16" r="7" fill="#E9B8BF"/></svg>'),
    lettering(o, h('.mast', `${partner1} & ${partner2}`)),
    h('.date', [longDate(date), place].filter(Boolean).join(' · '))); },
};
