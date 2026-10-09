// Renders a preview of all logo variants to a PNG: node scripts/preview-logo.mjs <out.png>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const svg = (f) => 'data:image/svg+xml;base64,' + fs.readFileSync('public/img/' + f).toString('base64');
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1100, height: 520 });
await p.setContent(`<body style="margin:0;display:grid;grid-template-columns:1fr 1fr">
<div style="background:#fbf7f4;padding:40px;display:grid;gap:30px;place-items:center"><img src="${svg('ringo.svg')}" style="width:440px"><img src="${svg('ringo.svg')}" style="width:130px"></div>
<div style="background:#5e2139;padding:40px;display:grid;gap:30px;place-items:center"><img src="${svg('ringo-hell.svg')}" style="width:440px">
<div style="display:flex;gap:20px;align-items:center"><img src="${svg('logo.svg')}" style="width:160px"><img src="${svg('logo.svg')}" style="width:48px"><img src="${svg('logo.svg')}" style="width:16px"></div></div></body>`);
await new Promise((r) => setTimeout(r, 300));
await p.screenshot({ path: process.argv[2] || 'logo-preview.png' });
await b.close();
