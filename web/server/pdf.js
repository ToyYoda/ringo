// Printable outputs: QR table cards, guest list, photo book, thank-you cards.
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { filePath } from './media.js';

const BURGUNDY = '#8E3B5A';
const GOLD = '#B8915A';
const INK = '#2E2427';
const MUTED = '#7A6A6E';

const mm = (v) => (v * 72) / 25.4;

function newDoc(res, filename, opts = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: mm(15), autoFirstPage: false, info: { Title: filename, Creator: 'Ringo' }, ...opts });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}.pdf"`);
  doc.pipe(res);
  return doc;
}

/** The signature arc: flat on the left, sweeping down to the right edge. */
function arc(doc, x, y, w, h, color = GOLD) {
  doc.save().lineWidth(1.2).strokeColor(color)
    .moveTo(x, y + h * 0.45).lineTo(x + w * 0.4, y + h * 0.45)
    .bezierCurveTo(x + w * 0.62, y + h * 0.45, x + w * 0.7, y + h * 0.98, x + w, y + h)
    .stroke().restore();
}

/**
 * The couple's lettering: their uploaded square logo if there is one, otherwise the names in italic.
 * align: 'left' | 'center' | 'right'. Returns the y position below the element.
 */
function namesOrLogo(doc, wedding, { x, y, width, logoSize, fontSize, align }) {
  if (wedding.logo_path) {
    const left = align === 'right' ? x + width - logoSize : align === 'center' ? x + (width - logoSize) / 2 : x;
    try {
      doc.image(filePath(wedding.id, wedding.logo_path), left, y, { fit: [logoSize, logoSize], align: 'center', valign: 'center' });
      return y + logoSize;
    } catch { /* unreadable logo – fall back to the names */ }
  }
  doc.fillColor(BURGUNDY).font('Times-Italic').fontSize(fontSize).text(`${wedding.partner1} & ${wedding.partner2}`, x, y, { width, align });
  return doc.y;
}

const qrBuffer = (text, dark = INK) => QRCode.toBuffer(text, { margin: 1, width: 600, color: { dark, light: '#FFFFFF' } });

/** One A6 card per table (4 per A4 page) with the photo-upload QR code. */
export async function tableCards(res, { wedding, tables, uploadUrl }) {
  const doc = newDoc(res, `Tischkarten-${wedding.slug}`, { margin: 0 });
  const qr = await qrBuffer(uploadUrl);
  const W = mm(105), H = mm(148);
  const cards = tables.length ? tables : [{ name: '' }];
  cards.forEach((t, i) => {
    if (i % 4 === 0) doc.addPage();
    const x = (i % 2) * W, y = Math.floor((i % 4) / 2) * H;
    doc.save().rect(x, y, W, H).lineWidth(0.3).dash(2, { space: 3 }).strokeColor('#ccc').stroke().restore();
    arc(doc, x + mm(8), y + mm(4), W - mm(16), mm(22));
    namesOrLogo(doc, wedding, { x: x + mm(8), y: y + mm(wedding.logo_path ? 5 : 10), width: W - mm(16), logoSize: mm(24), fontSize: 20, align: 'right' });
    if (t.name) doc.fillColor(INK).font('Times-Roman').fontSize(26).text(t.name, x, y + mm(32), { width: W, align: 'center' });
    doc.image(qr, x + (W - mm(52)) / 2, y + mm(48), { width: mm(52) });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text('Teilt eure Fotos mit uns!', x, y + mm(104), { width: W, align: 'center' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text('QR-Code mit der Handykamera scannen, Foto aufnehmen, fertig.\nKeine App, kein Konto nötig.', x + mm(10), y + mm(111), { width: W - mm(20), align: 'center' });
    if (wedding.motto) doc.fillColor(GOLD).font('Times-Italic').fontSize(11).text(wedding.motto, x, y + mm(132), { width: W, align: 'center' });
  });
  doc.end();
}

/** A4 poster for the entrance / photo wall. */
export async function poster(res, { wedding, url, title, subtitle }) {
  const doc = newDoc(res, `Aushang-${wedding.slug}`);
  doc.addPage();
  const W = doc.page.width;
  arc(doc, mm(15), mm(15), W - mm(30), mm(45));
  namesOrLogo(doc, wedding, { x: mm(15), y: mm(wedding.logo_path ? 14 : 30), width: W - mm(30), logoSize: mm(55), fontSize: 38, align: 'right' });
  doc.fillColor(INK).font('Times-Roman').fontSize(34).text(title, mm(15), mm(85), { width: W - mm(30), align: 'center' });
  doc.fillColor(MUTED).font('Helvetica').fontSize(14).text(subtitle, mm(25), mm(103), { width: W - mm(50), align: 'center' });
  doc.image(await qrBuffer(url), (W - mm(110)) / 2, mm(125), { width: mm(110) });
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(url, mm(15), mm(242), { width: W - mm(30), align: 'center' });
  doc.end();
}

export function guestList(res, { wedding, guests, events, invitations, tables }) {
  const doc = newDoc(res, `Gaesteliste-${wedding.slug}`, { layout: 'landscape' });
  doc.addPage();
  doc.fillColor(BURGUNDY).font('Times-Roman').fontSize(22).text(`Gästeliste ${wedding.partner1} & ${wedding.partner2}`);
  doc.moveDown(0.3).fillColor(MUTED).font('Helvetica').fontSize(9).text(`Stand ${new Date().toLocaleString('de-DE')} · ${guests.length} Einladungen`);
  doc.moveDown(0.8);
  const inv = new Map(invitations.map((i) => [`${i.guest_id}:${i.event_id}`, i]));
  const tableName = new Map(tables.map((t) => [t.id, t.name]));
  const cols = [['Name', 150], ['Gruppe', 90], ...events.map((e) => [e.title, 70]), ['Essen', 70], ['Allergien', 110], ['Tisch', 60]];
  const label = { yes: 'Ja', no: 'Nein', open: '–' };
  const row = (cells, bold) => {
    if (doc.y > doc.page.height - mm(20)) doc.addPage();
    const y = doc.y;
    let x = doc.page.margins.left;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(INK);
    let h = 0;
    cells.forEach((c, i) => {
      doc.text(String(c ?? ''), x, y, { width: cols[i][1] - 4 });
      h = Math.max(h, doc.y - y);
      x += cols[i][1];
    });
    doc.y = y + h + 3;
    doc.moveTo(doc.page.margins.left, doc.y - 1.5).lineTo(doc.page.margins.left + cols.reduce((s, c) => s + c[1], 0), doc.y - 1.5).lineWidth(0.3).strokeColor('#ddd').stroke();
  };
  row(cols.map((c) => c[0]), true);
  for (const g of guests) {
    const name = `${g.first_name} ${g.last_name}`.trim() + (g.plus_one_name ? ` + ${g.plus_one_name}` : '');
    row([name, g.group_label, ...events.map((e) => { const i = inv.get(`${g.id}:${e.id}`); return i ? label[i.rsvp] : 'n. eingel.'; }), g.meal, g.allergies, tableName.get(g.table_id) || '']);
  }
  doc.end();
}

/** Photo book: cover + 1–2 photos per page, chosen by the couple or by quality score. */
export function photoBook(res, { wedding, photos }) {
  const doc = newDoc(res, `Fotobuch-${wedding.slug}`, { margin: 0 });
  doc.addPage();
  const W = doc.page.width, H = doc.page.height;
  const cover = photos[0];
  if (cover) {
    try { doc.image(filePath(wedding.id, cover.file), 0, 0, { cover: [W, H * 0.62], align: 'center', valign: 'center' }); } catch { /* unreadable image */ }
  }
  arc(doc, mm(15), H * 0.62 + mm(8), W - mm(30), mm(30));
  const below = namesOrLogo(doc, wedding, { x: mm(15), y: H * 0.62 + mm(wedding.logo_path ? 22 : 42), width: W - mm(30), logoSize: mm(60), fontSize: 44, align: 'center' });
  if (wedding.wedding_date) {
    doc.fillColor(GOLD).font('Times-Roman').fontSize(16)
      .text(new Date(wedding.wedding_date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }), mm(15), below + mm(3), { width: W - mm(30), align: 'center' });
  }
  const rest = photos.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const p = rest[i];
    const landscape = (p.width || 4) >= (p.height || 3);
    const next = rest[i + 1];
    const pair = landscape && next && (next.width || 4) >= (next.height || 3);
    doc.addPage();
    const box = (photo, x, y, w, h) => {
      try { doc.image(filePath(wedding.id, photo.file), x, y, { fit: [w, h], align: 'center', valign: 'center' }); } catch { /* skip */ }
      if (photo.caption) doc.fillColor(MUTED).font('Times-Italic').fontSize(11).text(photo.caption, x, y + h + mm(3), { width: w, align: 'center' });
    };
    if (pair) {
      box(p, mm(18), mm(18), W - mm(36), H / 2 - mm(30));
      box(next, mm(18), H / 2 + mm(6), W - mm(36), H / 2 - mm(30));
      i++;
    } else {
      box(p, mm(18), mm(25), W - mm(36), H - mm(60));
    }
    doc.fillColor('#bbb').font('Helvetica').fontSize(8).text(String(doc.bufferedPageRange().count), 0, H - mm(10), { width: W, align: 'center' });
  }
  doc.end();
}

/** A6 landscape thank-you card per guest, using a photo the guest appears in when known. */
export function thankYouCards(res, { wedding, guests, photoFor, text }) {
  const doc = newDoc(res, `Dankeskarten-${wedding.slug}`, { size: 'A6', layout: 'landscape', margin: 0 });
  for (const g of guests) {
    doc.addPage();
    const W = doc.page.width, H = doc.page.height;
    const photo = photoFor(g);
    if (photo) {
      try { doc.image(filePath(wedding.id, photo.file), 0, 0, { cover: [W * 0.45, H], align: 'center', valign: 'center' }); } catch { /* skip */ }
    }
    const x = photo ? W * 0.45 + mm(8) : mm(12);
    const w = W - x - mm(10);
    doc.fillColor(BURGUNDY).font('Times-Italic').fontSize(22).text('Danke!', x, mm(12), { width: w });
    const body = (text || 'Liebe/r {vorname},\n\ndanke, dass du unseren Tag mit uns gefeiert hast!')
      .replaceAll('{vorname}', g.first_name)
      .replaceAll('{name}', `${g.first_name} ${g.last_name}`.trim());
    doc.fillColor(INK).font('Times-Roman').fontSize(11).text(body, x, mm(26), { width: w, height: H - mm(48) });
    doc.fillColor(BURGUNDY).font('Times-Italic').fontSize(14).text(`${wedding.partner1} & ${wedding.partner2}`, x, H - mm(18), { width: w, align: 'right' });
  }
  if (!guests.length) doc.addPage().font('Helvetica').text('Keine Gäste mit Zusage.', mm(10), mm(10));
  doc.end();
}

