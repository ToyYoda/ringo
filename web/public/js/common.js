// Shared front-end helpers (no framework, no build step).

// ---------- HTTP ----------

export async function api(method, url, body) {
  const opts = { method, headers: { 'X-Requested-With': 'ringo' }, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Fehler ${res.status}`), { status: res.status, data });
  return data;
}

/** Multipart upload with progress (fetch has no upload progress). */
export function upload(url, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('X-Requested-With', 'ringo');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(Object.assign(new Error(data?.error || `Upload fehlgeschlagen (${xhr.status})`), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('Keine Verbindung. Bitte später erneut versuchen.'));
    xhr.send(form);
  });
}

// ---------- DOM ----------

/** h('div.card#id', {onclick, class, style, ...attrs}, ...children) */
export function h(sel, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    if (attrs != null) children.unshift(attrs);
    attrs = {};
  }
  const [, tag = 'div', rest = ''] = sel.match(/^([a-z0-9-]*)(.*)$/i);
  const el = document.createElement(tag || 'div');
  for (const m of rest.matchAll(/([.#])([\w-]+)/g)) {
    if (m[1] === '.') el.classList.add(m[2]); else el.id = m[2];
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.classList.add(...String(v).split(/\s+/).filter(Boolean));
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v; // only for trusted static markup (icons)
    else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (s, root = document) => root.querySelector(s);
export const clear = (el) => { el.replaceChildren(); return el; };
export function mount(el, ...children) { clear(el); append(el, children); return el; }

// ---------- Icons (trusted static SVG) ----------

const P = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7S10 3 7.5 4 9 7 12 7zm0 0s2-4 4.5-3S15 7 12 7z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4',
  video: 'M3 7h12v10H3zM15 10l6-3v10l-6-3',
  chat: 'M4 5h16v11H8l-4 4z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2.4.6 4 2.8 4 6',
  seat: 'M6 4v8h12V4M4 12h16M7 12v8M17 12v8',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  play: 'M8 5v14l11-7z',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  send: 'M4 12l16-8-6 16-3-7z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  whatsapp: 'M12 3a9 9 0 0 0-7.8 13.4L3 21l4.7-1.2A9 9 0 1 0 12 3zM9 8.5c.3-.6.6-.6.9-.6h.6c.2 0 .4 0 .6.5l.8 1.9c.1.3 0 .5-.1.6l-.5.6c-.2.2-.2.4 0 .6.6 1 1.4 1.8 2.4 2.4.2.1.4.1.6-.1l.6-.7c.2-.2.4-.2.6-.1l1.9.9c.3.1.4.3.4.5 0 .6-.3 1.6-1.6 1.9-1 .2-2.5-.1-4.5-1.8-2.3-2-2.9-4-2.7-5.2z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 3.6V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z',
  face: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10h.01M15 10h.01M8.5 15a5 5 0 0 0 7 0',
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  printer: 'M7 9V3h10v6M6 18H4v-8h16v8h-2M7 14h10v7H7z',
};

export const icon = (name, size = 20) =>
  h('span', { style: { display: 'inline-flex', lineHeight: 0 }, 'aria-hidden': 'true', html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name] || P.info}"/></svg>` });

// ---------- Arc header ----------

let arcDefs = false;
function ensureArcDefs() {
  if (arcDefs) return;
  arcDefs = true;
  document.body.insertAdjacentHTML('afterbegin',
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><clipPath id="arcClip" clipPathUnits="objectBoundingBox"><path d="M0,0 H1 V1 C0.70,0.98 0.62,0.45 0.40,0.45 H0 Z"/></clipPath></svg>');
}

/** The couple's uploaded square logo, used instead of the name lettering. */
export const coupleLogo = (src, alt) => h('img.couple-logo', { src, alt });

export function arcHeader({ partner1, partner2, motto, cover, title, subtitle, big, left, logo }) {
  ensureArcDefs();
  return h('header.arc-head', { class: big ? 'big' : '' },
    h('.arc-fill', cover ? h('img', { src: cover, alt: '' }) : null),
    h('.arc-line', { html: '<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%"><path d="M0,45 H40 C62,45 70,98 100,100" fill="none" stroke="#b8915a" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>' }),
    left || (motto ? h('.motto', motto) : null),
    logo ? h('.names.logo', coupleLogo(logo, `${partner1} & ${partner2}`)) : h('.names', partner1, h('span', '&'), partner2),
    title ? h('.page-title', h('h1', title), subtitle ? h('p', subtitle) : null) : null,
  );
}

// ---------- Feedback ----------

export function toast(msg, type = '') {
  let box = document.getElementById('toasts');
  if (!box) document.body.append(box = h('#toasts', { role: 'status', 'aria-live': 'polite' }));
  const t = h('.toast', { class: type }, msg);
  box.append(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3200);
}

export const errorToast = (e) => toast(e?.message || String(e), 'error');

/** Opens a modal; `content` is a node or function(close) => node. Returns close(). */
export function modal(title, content, { footer, onClose, wide } = {}) {
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => e.key === 'Escape' && close();
  const body = typeof content === 'function' ? content(close) : content;
  const foot = typeof footer === 'function' ? footer(close) : footer;
  const box = h('.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? { width: 'min(860px, 100%)' } : null },
    h('header', h('h3', title), h('button.icon-btn', { onclick: close, 'aria-label': 'Schließen' }, icon('close'))),
    h('.body', body),
    foot ? h('footer', foot) : null,
  );
  const back = h('.modal-back', { onclick: (e) => e.target === back && close() }, box);
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  setTimeout(() => box.querySelector('input, textarea, select')?.focus(), 30);
  return close;
}

export function confirmDialog(title, text, okLabel = 'Löschen') {
  return new Promise((resolve) => {
    let ok = false;
    modal(title, h('p', text), {
      onClose: () => resolve(ok),
      footer: (close) => [
        h('button.btn.ghost', { onclick: close }, 'Abbrechen'),
        h('button.btn.danger', { onclick: () => { ok = true; close(); } }, okLabel),
      ],
    });
  });
}

/**
 * Form modal: fields = [{name, label, type, value, options, required, hint}], resolves with values or null.
 */
export function formDialog(title, fields, { submit = 'Speichern', extra } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const inputs = {};
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); collect(); } },
      fields.map((f) => {
        if (f.type === 'checkbox') {
          inputs[f.name] = h('input', { type: 'checkbox', checked: Boolean(f.value) });
          return h('label.check', inputs[f.name], h('span', f.label, f.hint ? h('div.small.muted', f.hint) : null));
        }
        let input;
        if (f.type === 'select') input = h('select', f.options.map((o) => h('option', { value: o.value ?? o, selected: String(o.value ?? o) === String(f.value ?? '') }, o.label ?? o)));
        else if (f.type === 'textarea') input = h('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '' }, f.value ?? '');
        else input = h('input', { type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder || '', step: f.step, min: f.min });
        if (f.required) input.required = true;
        inputs[f.name] = input;
        return h('label.field', h('span', f.label + (f.required ? ' *' : '')), input, f.hint ? h('div.small.muted', { style: { marginTop: '4px' } }, f.hint) : null);
      }),
      extra || null,
      h('button', { type: 'submit', class: 'hidden' }),
    );
    let closeFn;
    const collect = () => {
      if (!form.reportValidity()) return;
      result = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value]));
      closeFn();
    };
    closeFn = modal(title, form, {
      onClose: () => resolve(result),
      footer: (close) => [h('button.btn.ghost', { onclick: close }, 'Abbrechen'), h('button.btn', { onclick: collect }, submit)],
    });
  });
}

// ---------- Formatting ----------

const dtf = (opts) => new Intl.DateTimeFormat('de-DE', opts);
export const fmtDate = (s) => (s ? dtf({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s)) : '');
export const fmtShortDate = (s) => (s ? dtf({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(s)) : '');
export const fmtTime = (s) => (s ? dtf({ hour: '2-digit', minute: '2-digit' }).format(new Date(s)) : '');
export const fmtDateTime = (s) => (s ? `${dtf({ weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(s))}, ${fmtTime(s)} Uhr` : '');
export const fmtAgo = (s) => {
  const d = (Date.now() - new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')) / 1000;
  if (d < 60) return 'gerade eben';
  if (d < 3600) return `vor ${Math.round(d / 60)} Min.`;
  if (d < 86400) return `vor ${Math.round(d / 3600)} Std.`;
  return fmtShortDate(s.replace(' ', 'T') + 'Z');
};
export const money = (cents) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 ? 2 : 0 });
export const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
export const avatar = (name) => h('.avatar', initials(name || '?'));
export const daysUntil = (s) => Math.ceil((new Date(s).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400e3);

// ---------- Sharing ----------

export async function copyText(text, label = 'Kopiert') {
  try { await navigator.clipboard.writeText(text); toast(label); } catch { prompt('Zum Kopieren:', text); }
}

export async function shareLink({ title, text, url }) {
  if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch { /* cancelled */ } }
  copyText(url || text, 'Link kopiert');
}

export const waLink = (phone, text) => {
  const num = String(phone || '').replace(/[^\d+]/g, '').replace(/^00/, '+').replace(/^0(?=\d)/, '+49');
  return `https://wa.me/${num.replace('+', '')}?text=${encodeURIComponent(text)}`;
};

// ---------- Image processing in the browser ----------

async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}

function drawScaled(src, max) {
  const w = src.width, hgt = src.height;
  const s = Math.min(1, max / Math.max(w, hgt));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(hgt * s);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (canvas, q = 0.86) => new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));

/** Sharpness estimate: variance of the Laplacian on a 256px grayscale copy (higher = sharper). */
function sharpness(src) {
  const c = drawScaled(src, 256);
  const { data, width, height } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const g = new Float32Array(width * height);
  for (let i = 0; i < g.length; i++) g[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const lap = g[i - 1] + g[i + 1] + g[i - width] + g[i + width] - 4 * g[i];
    sum += lap; sum2 += lap * lap; n++;
  }
  const mean = sum / n;
  return Math.round(sum2 / n - mean * mean);
}

/** 8x8 average hash as 64-char bit string, used to skip near-duplicates in the photo book. */
function averageHash(src) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  const g = [];
  for (let i = 0; i < 64; i++) g.push(d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]);
  const avg = g.reduce((a, b) => a + b, 0) / 64;
  return g.map((v) => (v >= avg ? '1' : '0')).join('');
}

/** Returns {file, thumb, width, height, quality, ahash, canvas} – resized JPEGs ready for upload. */
export async function processImage(file) {
  const bmp = await loadBitmap(file);
  const full = drawScaled(bmp, 2400);
  const thumb = drawScaled(full, 640);
  const out = {
    file: await toBlob(full, 0.86), thumb: await toBlob(thumb, 0.8),
    width: full.width, height: full.height, quality: sharpness(full), ahash: averageHash(full), canvas: full,
  };
  bmp.close?.();
  return out;
}

/** Poster frame for a video (first second). */
export function videoPoster(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'metadata';
    const url = URL.createObjectURL(file);
    const done = (blob, meta = {}) => { URL.revokeObjectURL(url); resolve({ blob, ...meta }); };
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 1) / 2); };
    v.onseeked = async () => {
      const c = drawScaled(v, 640);
      done(await toBlob(c, 0.8), { duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    };
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

// ---------- Face descriptors (face-api.js, served locally, runs on-device) ----------

let faceApiPromise = null;
export function loadFaceApi() {
  faceApiPromise ??= (async () => {
    const faceapi = await import('/vendor/face-api/face-api.esm.js');
    await faceapi.tf.ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/vendor/face-models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/vendor/face-models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/vendor/face-models'),
    ]);
    return faceapi;
  })();
  return faceApiPromise;
}

/** All face descriptors in an image/canvas (array of 128-number arrays). */
export async function faceDescriptors(input) {
  const faceapi = await loadFaceApi();
  const src = input.width > 1024 || input.height > 1024 ? drawScaled(input, 1024) : input;
  const res = await faceapi.detectAllFaces(src, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.45 }))
    .withFaceLandmarks().withFaceDescriptors();
  return res.map((r) => Array.from(r.descriptor, (x) => Math.round(x * 1e5) / 1e5));
}

// ---------- Lightbox ----------

export function lightbox(items, start, { src, caption, actions } = {}) {
  let i = start;
  const stage = h('.stage');
  const cap = h('.grow.small');
  const acts = h('.row');
  const show = () => {
    const it = items[i];
    mount(stage, it.kind === 'video'
      ? h('video', { src: src(it), controls: true, autoplay: true, playsInline: true })
      : h('img', { src: src(it), alt: it.caption || '' }));
    mount(cap, caption ? caption(it) : '');
    mount(acts, actions ? actions(it, close) : null);
  };
  const go = (d) => { i = (i + d + items.length) % items.length; show(); };
  const onKey = (e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); if (e.key === 'Escape') close(); };
  const box = h('.lightbox', stage,
    items.length > 1 ? h('button.icon-btn.nav.prev', { onclick: () => go(-1), 'aria-label': 'Vorheriges' }, icon('left', 26)) : null,
    items.length > 1 ? h('button.icon-btn.nav.next', { onclick: () => go(1), 'aria-label': 'Nächstes' }, icon('right', 26)) : null,
    h('.bar', cap, acts, h('button.icon-btn', { onclick: () => close(), 'aria-label': 'Schließen' }, icon('close', 24))));
  let x0 = null;
  box.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => { if (x0 != null) { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx > 0 ? -1 : 1); } x0 = null; });
  function close() { box.remove(); document.removeEventListener('keydown', onKey); }
  document.addEventListener('keydown', onKey);
  document.body.append(box);
  show();
  return close;
}

export const mediaUrl = (wid, file, key) => (file ? `/media/${wid}/${file}${key ? `?k=${encodeURIComponent(key)}` : ''}` : '');

// ---------- Upload of one photo/video (guest app + QR upload page) ----------

/** Resizes images in the browser, adds quality score, hash and (optionally) face descriptors, then uploads. */
export async function uploadOne(file, onProgress, url, features, extra = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  if (file.type.startsWith('video/')) {
    const poster = await videoPoster(file);
    form.append('file', file, file.name);
    if (poster.blob) form.append('thumb', poster.blob, 'poster.jpg');
    if (poster.width) { form.append('width', poster.width); form.append('height', poster.height); }
  } else {
    const img = await processImage(file);
    form.append('file', img.file, 'foto.jpg');
    form.append('thumb', img.thumb, 'thumb.jpg');
    form.append('width', img.width); form.append('height', img.height);
    form.append('quality', img.quality); form.append('ahash', img.ahash);
    if (features?.faceSearch) {
      try { form.append('faces', JSON.stringify(await faceDescriptors(img.canvas))); } catch (e) { console.warn('face detection skipped', e); }
    }
  }
  return upload(url, form, onProgress);
}

