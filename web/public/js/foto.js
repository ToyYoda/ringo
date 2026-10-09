// QR-code upload page from the table cards: no app, no account – take a photo, done.
import { api, h, $, mount, icon, toast, errorToast, uploadOne, mediaUrl } from './common.js';
import { themedHeader, applyTheme } from './themes.js';

const app = $('#app');
const slug = location.pathname.split('/').pop();
const key = new URLSearchParams(location.search).get('k') || '';

async function boot() {
  let w;
  try {
    w = await api('GET', `/api/foto/${encodeURIComponent(slug)}?k=${encodeURIComponent(key)}`);
  } catch (e) {
    mount(app, h('.wrap', { style: { paddingTop: '60px' } }, h('.card.center', h('h2', 'Link ungültig'), h('p', e.message))));
    return;
  }
  applyTheme(w.theme);
  document.title = `Fotos für ${w.partner1} & ${w.partner2}`;
  const stored = localStorage.getItem('hb_name') || '';
  const name = h('input', { type: 'text', value: w.guestName || stored, placeholder: 'Dein Name', autocomplete: 'name' });
  const status = h('div.stack');
  let count = Number(sessionStorage.getItem(`hb_count_${slug}`) || 0);
  const counter = h('p.center.muted.small');
  const showCount = () => { counter.textContent = count ? `Du hast schon ${count} ${count === 1 ? 'Datei' : 'Dateien'} geteilt – danke! 💛` : ''; };

  const send = async (files) => {
    if (!files.length) return;
    if (!name.value.trim()) { name.focus(); toast('Bitte zuerst deinen Namen eintragen.', 'error'); return; }
    localStorage.setItem('hb_name', name.value.trim());
    for (const file of files) {
      const bar = h('div', { style: { width: '0%' } });
      const row = h('.card.flat', h('.row.between', h('.small', file.name || 'Foto'), h('.small.muted', 'wird vorbereitet …')), h('.progress', { style: { marginTop: '6px' } }, bar));
      status.prepend(row);
      try {
        await uploadOne(file, (p) => { bar.style.width = `${p * 100}%`; }, `/api/foto/${encodeURIComponent(slug)}/upload?k=${encodeURIComponent(key)}`, w.features, { name: name.value.trim() });
        bar.style.width = '100%';
        row.querySelector('.muted').textContent = w.moderate ? '✓ hochgeladen (nach Freigabe sichtbar)' : '✓ hochgeladen';
        count++; sessionStorage.setItem(`hb_count_${slug}`, count); showCount();
      } catch (e) {
        row.querySelector('.muted').textContent = 'Fehler';
        errorToast(e);
      }
    }
  };
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden', onchange: (e) => { send([...e.target.files]); e.target.value = ''; } });
  const pick = h('input', { type: 'file', accept: w.features.video ? 'image/*,video/*' : 'image/*', multiple: true, class: 'hidden', onchange: (e) => { send([...e.target.files]); e.target.value = ''; } });

  mount(app,
    themedHeader({ partner1: w.partner1, partner2: w.partner2, motto: w.motto, date: w.wedding_date, logo: w.logo_path ? mediaUrl(w.id, w.logo_path, key) : null, cover: w.cover_path ? mediaUrl(w.id, w.cover_path, key) : null, title: 'Eure Fotos', subtitle: 'Direkt in unser gemeinsames Album' }),
    h('.wrap.stack', { style: { paddingBottom: '40px' } },
      w.unplugged ? h('.banner.rose.small', '📵 Während der Trauung bitte keine Fotos – danach umso mehr!') : null,
      h('label.field', h('span', 'Dein Name'), name),
      cam, pick,
      h('button.btn.block', { style: { minHeight: '64px', fontSize: '18px' }, onclick: () => cam.click() }, icon('camera', 26), 'Foto aufnehmen'),
      h('button.btn.outline.block', { onclick: () => pick.click() }, icon('plus'), w.features.video ? 'Fotos & Videos aus der Galerie' : 'Fotos aus der Galerie'),
      counter, status,
      h('p.small.muted.center', 'Keine App, kein Konto. Die Fotos sehen nur die Gäste dieser Hochzeit. ', h('a', { href: '/datenschutz' }, 'Datenschutz')),
    ));
  showCount();
}

boot();
