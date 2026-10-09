// Generates the Ringo brand assets (SVG, text converted to outlines – no font needed to display them).
//   node scripts/make-logo.mjs
// Wordmark: "Ring" in Cormorant Garamond SemiBold + an "o" drawn as a gold ring with a diamond on top.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fontkit = require('fontkit');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
// Static SemiBold instance (OFL) – only needed to generate the outlines.
const font = fontkit.openSync(path.join(root, 'scripts/fonts/CormorantGaramond-SemiBold.woff'));

const C = { burgundy: '#8E3B5A', gold: '#B8915A', goldLight: '#E8C99A', diamond: '#FFFFFF', facet: '#F3E9EE', white: '#FFFFFF' };

/** Glyph outlines for a string, laid out from x=0 on the baseline (font units, y up). */
function textPath(str) {
  const run = font.layout(str);
  let x = 0, d = '';
  run.glyphs.forEach((g, i) => {
    d += g.path.translate(x + run.positions[i].xOffset, run.positions[i].yOffset).toSVG();
    x += run.positions[i].xAdvance;
  });
  return { d, width: x };
}

/**
 * The ring with a brilliant-cut diamond, in font units (y up), centred at cx with the ring sitting on the baseline
 * like a lowercase "o". Returns SVG markup in a y-down coordinate system (caller flips).
 */
function ringWithDiamond(cx, { ring = C.gold, stone = C.diamond, line = C.gold, facet = C.facet }) {
  const r = 182; // outer radius of the stroke centreline ≈ x-height "o"
  const cy = 193;
  const sw = 52; // stroke width ≈ heavy stem of the typeface
  // Diamond: culet sits in the ring's top, crown rises above the x-height.
  const top = cy + r + sw / 2 - 6; // where the setting meets the ring
  const girdleY = top + 135, tableY = top + 215;
  const gw = 150, tw = 82; // half widths
  const P = (x, y) => `${(cx + x).toFixed(1)},${(-y).toFixed(1)}`;
  const culet = P(0, top);
  const gl = P(-gw, girdleY), gr = P(gw, girdleY);
  const tl = P(-tw, tableY), tr = P(tw, tableY);
  const sparkle = (x, y, s) => `M${P(x, y + s)} L${P(x + s * 0.22, y + s * 0.22)} L${P(x + s, y)} L${P(x + s * 0.22, y - s * 0.22)} L${P(x, y - s)} L${P(x - s * 0.22, y - s * 0.22)} L${P(x - s, y)} L${P(x - s * 0.22, y + s * 0.22)} Z`;
  return `
    <circle cx="${cx}" cy="${-cy}" r="${r}" fill="none" stroke="${ring}" stroke-width="${sw}"/>
    <path d="M${P(-26, top - 26)} L${P(-14, top + 30)} M${P(26, top - 26)} L${P(14, top + 30)}" stroke="${ring}" stroke-width="16" stroke-linecap="round" fill="none"/>
    <path d="M${culet} L${gl} L${tl} L${tr} L${gr} Z" fill="${stone}" stroke="${line}" stroke-width="13" stroke-linejoin="round"/>
    <path d="M${gl} L${gr} M${tl} L${P(-tw * 0.35, girdleY)} L${P(0, tableY)} L${P(tw * 0.35, girdleY)} L${tr}
             M${P(-tw * 0.35, girdleY)} L${culet} L${P(tw * 0.35, girdleY)}" stroke="${line}" stroke-width="8" stroke-linejoin="round" fill="none"/>
    <path d="M${P(-tw * 0.35, girdleY)} L${P(0, tableY)} L${P(tw * 0.35, girdleY)} Z" fill="${facet}"/>
    <path d="${sparkle(gw + 70, tableY + 40, 46)}" fill="${line}"/>`;
}

function wordmark({ text = C.burgundy, ring = C.gold, stone = C.diamond, line = C.gold, facet = C.facet } = {}) {
  const { d, width } = textPath('Ring');
  const ringCx = width + 205;
  const W = ringCx + 290, top = 720, bottom = 300;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 ${-top} ${W + 40} ${top + bottom}" role="img" aria-label="Ringo">
  <title>Ringo</title>
  <g transform="scale(1,-1)"><path d="${d}" fill="${text}"/></g>
  ${ringWithDiamond(ringCx, { ring, stone, line, facet })}
</svg>
`;
}

/** App icon / favicon: ring + diamond on a rounded burgundy square. */
function icon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img" aria-label="Ringo">
  <title>Ringo</title>
  <rect width="1000" height="1000" rx="230" fill="${C.burgundy}"/>
  <g transform="translate(500 805) scale(1.02)">${ringWithDiamond(0, { ring: C.goldLight, stone: C.white, line: C.goldLight, facet: '#F6E7EC' })}</g>
</svg>
`;
}

const out = (rel, svg) => { fs.writeFileSync(path.join(root, rel), svg); console.log('✓', rel); };
out('public/img/logo.svg', icon());
out('public/img/ringo.svg', wordmark());
out('public/img/ringo-atelier.svg', wordmark({ text: '#4D504A', ring: '#A0927A', line: '#A0927A', facet: '#F4F1EA' }));
out('public/img/ringo-hell.svg', wordmark({ text: C.white, ring: C.goldLight, line: C.goldLight, facet: '#F6E7EC' }));
