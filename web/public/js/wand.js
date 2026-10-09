// Live photo wall for a projector/TV: new photos appear instantly, otherwise a slideshow of all photos.
import { api, h, $, mount, icon, coupleLogo } from './common.js';
import { applyTheme } from './themes.js';

const app = $('#app');
const slug = location.pathname.split('/').pop();
const key = new URLSearchParams(location.search).get('k') || '';
const base = `/api/wand/${encodeURIComponent(slug)}`;
const qs = `?k=${encodeURIComponent(key)}`;

let W, photos = [], queue = [], idx = 0, timer = null;
const media = (file) => `/media/${W.id}/${file}${qs}`;
const SLIDE_MS = 7000;

async function boot() {
  try {
    W = await api('GET', base + qs);
    applyTheme(W.theme);
  } catch (e) {
    mount(app, h('.wall-empty', e.message));
    return;
  }
  photos = W.photos;
  document.title = `Fotowand · ${W.partner1} & ${W.partner2}`;
  const { uploadUrl } = W;
  const qrSrc = `/api/qr.svg?d=${encodeURIComponent(uploadUrl)}`;
  mount(app, h('.wall-stage',
    h('.wall-main#main'),
    // Compact overlay used in "photos only" mode instead of the sidebar.
    h('.wall-overlay', h('#live-mini'), h('.qr-mini', h('img', { src: qrSrc, alt: '' }), h('span', 'Dein Foto auf der Wand!'))),
    h('aside.wall-side',
      W.logo_path ? h('.names.logo', coupleLogo(media(W.logo_path), `${W.partner1} & ${W.partner2}`)) : h('.names', W.partner1, h('span', '&'), W.partner2),
      W.motto ? h('.wall-motto', W.motto) : null,
      h('#live'),
      h('.count#count'),
      h('.qr', h('img', { src: qrSrc, alt: 'QR-Code zum Foto-Upload' }), h('b', 'Dein Foto auf der Wand!'), h('.small', 'Scannen, knipsen, fertig.')))),
  h('.wall-tools',
    h('button.wall-btn', { onclick: togglePhotosOnly, title: 'Taste F' }, 'Nur Fotos'),
    h('button.wall-btn', { onclick: () => document.documentElement.requestFullscreen?.(), 'aria-label': 'Vollbild' }, icon('monitor', 20))));
  try { if (localStorage.getItem('hb_wall_photos_only') === '1') document.body.classList.add('photos-only'); } catch { /* storage blocked */ }
  document.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') togglePhotosOnly(); });
  renderLive(W.live);
  updateCount();
  next();
  const es = new EventSource(`${base}/stream${qs}`);
  es.addEventListener('photo', async (e) => {
    const { id } = JSON.parse(e.data);
    if (!id) return;
    try {
      const p = await api('GET', `${base}/photo/${id}${qs}`);
      if (!photos.some((x) => x.id === p.id)) { photos.unshift(p); queue.push(p); updateCount(); }
    } catch { /* not approved / removed */ }
  });
  es.addEventListener('photo-removed', (e) => { const { id } = JSON.parse(e.data); photos = photos.filter((p) => p.id !== id); updateCount(); });
  es.addEventListener('live', (e) => renderLive(JSON.parse(e.data)));
  // Design or logo changed: reload the wall (it picks up everything in one go).
  es.addEventListener('theme', () => location.reload());
  // Wake lock keeps a laptop/TV stick from sleeping during the party.
  try { await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
}

function togglePhotosOnly() {
  const on = document.body.classList.toggle('photos-only');
  try { localStorage.setItem('hb_wall_photos_only', on ? '1' : '0'); } catch { /* storage blocked */ }
}

function updateCount() {
  $('#count').textContent = photos.length ? `${photos.length} Fotos & Videos bisher` : '';
}

/** "19:30" today, otherwise "Sa., 12. Juni, 19:30". */
const when = (item) => (new Date(item.starts).toDateString() === new Date().toDateString()
  ? item.time
  : new Date(item.starts).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));

function renderLive(l) {
  const mini = $('#live-mini');
  if (mini) mount(mini, l?.current ? [h('b', 'Jetzt: '), l.current.title] : l?.next ? [h('b', `Danach (${when(l.next)}): `), l.next.title] : null);
  const box = $('#live');
  if (!box) return;
  mount(box, l?.current ? h('.live', h('.k', 'Jetzt'), h('.t', l.current.title), l.current.host ? h('.small', { style: { opacity: .7 } }, l.current.host) : null) : null,
    l?.next ? h('.live', { style: { marginTop: '10px' } }, h('.k', `Danach · ${when(l.next)}`), h('.t', { style: { fontSize: '19px' } }, l.next.title)) : null);
}

function next() {
  clearTimeout(timer);
  const main = $('#main');
  if (!photos.length) {
    mount(main, h('.wall-empty', 'Noch keine Fotos – scannt den QR-Code und macht das erste!'));
    timer = setTimeout(next, 3000);
    return;
  }
  const fresh = queue.shift();
  const p = fresh || photos[idx++ % photos.length];
  const old = main.querySelector('.slide.on');
  const thumb = media(p.thumb || p.file);
  const content = p.kind === 'video'
    ? h('video', { src: media(p.file), autoplay: true, muted: true, playsInline: true, poster: p.thumb ? thumb : undefined })
    : h('img', { src: media(p.file), alt: '' });
  const slide = h('.slide', h('.bg', { style: { backgroundImage: `url("${thumb}")` } }), content,
    p.uploader_name ? h('.credit', `📷 ${p.uploader_name}`) : null,
    fresh ? h('.new', 'Neu!') : null);
  main.append(slide);
  const show = () => {
    requestAnimationFrame(() => slide.classList.add('on'));
    if (old) { old.classList.remove('on'); setTimeout(() => old.remove(), 1300); }
  };
  if (p.kind === 'video') {
    content.onloadeddata = show;
    content.onended = () => next();
    content.onerror = () => next();
    timer = setTimeout(next, 20000);
  } else {
    content.onload = show;
    content.onerror = () => { slide.remove(); timer = setTimeout(next, 200); };
    timer = setTimeout(next, SLIDE_MS);
  }
}

boot();
