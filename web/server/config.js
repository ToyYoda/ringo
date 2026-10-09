import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));

/** All configuration comes from environment variables (see docs/Betriebshandbuch.md). */
export const config = {
  root,
  port: int(process.env.PORT, 3000),
  baseUrl: (process.env.BASE_URL || `http://localhost:${int(process.env.PORT, 3000)}`).replace(/\/$/, ''),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data')),
  /** Plan for newly created weddings: "free" or "premium". Self-hosters typically use "premium". */
  defaultPlan: process.env.DEFAULT_PLAN === 'free' ? 'free' : 'premium',
  /** Password for the operator console (/betreiber). Empty disables it. */
  operatorPassword: process.env.OPERATOR_PASSWORD || '',
  secureCookies: process.env.SECURE_COOKIES === 'true' || (process.env.BASE_URL || '').startsWith('https://'),
  limits: {
    photoMb: int(process.env.MAX_PHOTO_MB, 15),
    videoMb: int(process.env.MAX_VIDEO_MB, 80),
    freePhotos: int(process.env.FREE_PLAN_PHOTOS, 100),
    freeGuests: int(process.env.FREE_PLAN_GUESTS, 60),
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
  /** AI features are optional and only active when an Anthropic credential is configured. */
  ai: {
    enabled: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    model: process.env.AI_MODEL || 'claude-opus-5-5',
  },
};
