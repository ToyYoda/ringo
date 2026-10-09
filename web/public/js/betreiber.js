// Operator console: overview of all weddings, switch plans (e.g. after payment).
import { api, h, $, mount, toast, errorToast, fmtShortDate } from './common.js';

const app = $('#app');

async function load() {
  let rows;
  try { rows = await api('GET', '/api/betreiber/weddings'); } catch { return loginForm(); }
  const mb = (b) => `${Math.round(b / 1048576)} MB`;
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  mount(app,
    h('.page-head', h('div', h('h1', 'Betreiber-Konsole'), h('p', `${rows.length} Hochzeiten · ${rows.filter((r) => r.plan === 'premium').length} Premium · ${mb(total)} Medien`))),
    h('.card', h('.table-scroll', h('table.data',
      h('thead', h('tr', ['Paar', 'Datum', 'Konto', 'Gäste', 'Fotos', 'Speicher', 'Paket', ''].map((t) => h('th', t)))),
      h('tbody', rows.map((r) => h('tr',
        h('td', h('b', `${r.partner1} & ${r.partner2}`), h('.small.muted', r.slug)),
        h('td', r.wedding_date ? fmtShortDate(r.wedding_date) : '–'),
        h('td.small', r.email),
        h('td', r.guests), h('td', r.photos), h('td', mb(r.bytes)),
        h('td', h('span.pill', { class: r.plan === 'premium' ? 'rose' : 'gray' }, r.plan), r.upgrade_requests ? h('span.pill', { style: { marginLeft: '4px' } }, 'Upgrade angefragt') : null),
        h('td', h('button.btn.small.outline', {
          onclick: async () => {
            try { await api('POST', `/api/betreiber/weddings/${r.id}/plan`, { plan: r.plan === 'premium' ? 'free' : 'premium' }); toast('Paket geändert'); load(); } catch (e) { errorToast(e); }
          },
        }, r.plan === 'premium' ? 'Auf Basis' : 'Premium freischalten')))))))));
}

function loginForm() {
  const pw = h('input', { type: 'password', placeholder: 'Betreiber-Passwort' });
  mount(app, h('.card', { style: { maxWidth: '400px', margin: '60px auto' } },
    h('h2', 'Betreiber-Konsole'), pw,
    h('button.btn.block', { style: { marginTop: '12px' }, onclick: async () => { try { await api('POST', '/api/betreiber/login', { password: pw.value }); load(); } catch (e) { errorToast(e); } } }, 'Anmelden')));
}

load();
