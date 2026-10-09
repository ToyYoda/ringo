import { q } from '../db.js';
import { config } from '../config.js';
import { features } from '../logic.js';
import { isVideo, removeFile } from '../media.js';
import { publish } from '../realtime.js';

/**
 * Persists an uploaded photo/video (multer fields "file" + optional "thumb").
 * The browser already resized the image and computed quality score, hash and face descriptors.
 */
export function storePhotoUpload(req, { guestId = null, uploaderName = '' }) {
  const w = req.wedding;
  const file = req.files?.file?.[0];
  const thumb = req.files?.thumb?.[0];
  const cleanup = () => { removeFile(w.id, file?.filename); removeFile(w.id, thumb?.filename); };
  if (!file) return { error: 'Keine Datei erhalten.', status: 400 };

  const f = features(w);
  const video = isVideo(file.mimetype);
  if (video && !f.video) { cleanup(); return { error: 'Videos sind im Premium-Paket enthalten.', status: 402 }; }
  const limitMb = video ? config.limits.videoMb : config.limits.photoMb;
  if (file.size > limitMb * 1024 * 1024) { cleanup(); return { error: `Die Datei ist zu groß (max. ${limitMb} MB).`, status: 413 }; }
  if (f.maxPhotos && q.get('SELECT COUNT(*) n FROM photos WHERE wedding_id = ?', w.id).n >= f.maxPhotos) {
    cleanup();
    return { error: 'Das Fotoalbum ist voll. Das Brautpaar kann auf Premium erweitern.', status: 402 };
  }

  const b = req.body || {};
  let faces = null;
  if (f.faceSearch && b.faces) {
    try {
      const parsed = JSON.parse(b.faces);
      if (Array.isArray(parsed) && parsed.every((d) => Array.isArray(d) && d.length === 128)) faces = JSON.stringify(parsed.slice(0, 40));
    } catch { /* ignore malformed descriptors */ }
  }
  const approved = w.moderate_photos ? 0 : 1;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const r = q.run(
    `INSERT INTO photos (wedding_id, guest_id, uploader_name, kind, file, thumb, width, height, caption, approved, quality, ahash, faces, size_bytes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    w.id, guestId, String(uploaderName || b.name || 'Gast').slice(0, 80), video ? 'video' : 'photo', file.filename, thumb?.filename || null,
    num(b.width), num(b.height), String(b.caption || '').slice(0, 200), approved, num(b.quality),
    /^[01]{64}$/.test(b.ahash || '') ? b.ahash : null, faces, file.size + (thumb?.size || 0),
  );
  if (approved) publish(w.id, 'photo', { id: Number(r.lastInsertRowid) });
  return { id: Number(r.lastInsertRowid), approved: Boolean(approved) };
}
