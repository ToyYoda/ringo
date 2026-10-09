import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { randomToken } from './auth.js';

const IMAGE = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
const AUDIO = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'];

const EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
  'audio/webm': '.webm', 'audio/mp4': '.m4a', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/aac': '.aac', 'audio/x-m4a': '.m4a',
};

export const mediaDir = (weddingId) => {
  const d = path.join(config.dataDir, 'media', String(Number(weddingId)));
  fs.mkdirSync(d, { recursive: true });
  return d;
};

/** Normalises e.g. "video/webm;codecs=vp9" to "video/webm". */
const baseMime = (m) => String(m || '').split(';')[0].trim().toLowerCase();

const BY_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.webm': 'video/webm', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.aac': 'audio/aac' };

/**
 * Some browsers send a generic or unparsable type (e.g. MediaRecorder codec lists); fall back to the file extension.
 * Audio recordings in .webm are told apart by the field name prefix the client uses ("nachricht").
 */
function effectiveMime(file, allowed) {
  const m = baseMime(file.mimetype);
  if (allowed.includes(m)) return m;
  const byExt = BY_EXT[path.extname(file.originalname || '').toLowerCase()];
  if (!byExt) return m;
  if (byExt === 'video/webm' && allowed.includes('audio/webm') && !allowed.includes('video/webm')) return 'audio/webm';
  return byExt;
}

/** Multer instance storing into the wedding's media folder with random file names. */
export function uploader(kinds) {
  const allowed = [...(kinds.includes('image') ? IMAGE : []), ...(kinds.includes('video') ? VIDEO : []), ...(kinds.includes('audio') ? AUDIO : [])];
  return multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => cb(null, mediaDir(req.wedding.id)),
      filename: (_req, file, cb) => cb(null, randomToken(12) + (EXT[baseMime(file.mimetype)] || '.bin')),
    }),
    limits: { fileSize: Math.max(config.limits.photoMb, config.limits.videoMb) * 1024 * 1024, files: 2 },
    fileFilter: (_req, file, cb) => {
      file.mimetype = effectiveMime(file, allowed);
      if (allowed.includes(file.mimetype)) return cb(null, true);
      cb(Object.assign(new Error(`Dateityp wird nicht unterstützt (${baseMime(file.mimetype) || 'unbekannt'}).`), { status: 400 }));
    },
  });
}

export const isVideo = (mime) => VIDEO.includes(baseMime(mime));
export const isImage = (mime) => IMAGE.includes(baseMime(mime));

export function removeFile(weddingId, file) {
  if (!file) return;
  const p = path.join(mediaDir(weddingId), path.basename(file));
  fs.rm(p, { force: true }, () => {});
}

export function filePath(weddingId, file) {
  return path.join(mediaDir(weddingId), path.basename(file));
}

export function folderSize(weddingId) {
  let total = 0;
  for (const f of fs.readdirSync(mediaDir(weddingId))) total += fs.statSync(path.join(mediaDir(weddingId), f)).size;
  return total;
}
