// Consistent online backup: npm run backup [targetDir]
// Writes <target>/ringo-<timestamp>/ with a database snapshot (VACUUM INTO) and a copy of all media.
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const target = path.resolve(process.argv[2] || path.join(config.dataDir, 'backups'), `ringo-${stamp}`);
fs.mkdirSync(target, { recursive: true });

const dbFile = path.join(target, 'ringo.db');
db.exec(`VACUUM INTO '${dbFile.replace(/'/g, "''")}'`);
fs.cpSync(path.join(config.dataDir, 'media'), path.join(target, 'media'), { recursive: true });

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`Backup erstellt: ${target} (${Math.round(size(target) / 1048576)} MB)`);
console.log('Wiederherstellen: Server stoppen, Inhalt dieses Ordners nach DATA_DIR kopieren, Server starten.');
