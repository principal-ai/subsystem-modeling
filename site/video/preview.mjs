import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { loadFiles } from './files.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const times = process.argv.slice(2).map(Number);
const DIR = join(HERE, 'preview');
mkdirSync(DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars',
         '--font-render-hinting=none', '--disable-lcd-text', '--disable-gpu',
         '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('file://' + join(HERE, 'scene.html'), { waitUntil: 'load' });
await page.evaluate((files) => { window.__FILES = files; }, loadFiles());
await page.evaluate(() => document.fonts.ready);

for (const t of times) {
  await page.evaluate(async (tt) => { window.__render(tt); await new Promise(requestAnimationFrame); }, t);
  const p = join(DIR, `t${String(t.toFixed(2)).replace('.', '_')}.png`);
  await page.screenshot({ path: p });
  console.log(p);
}
await browser.close();
