import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadFiles } from './files.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const FPS = 30;
const DUR = 45;
const W = 1920, H = 1080;
const OUT = process.argv[2] || join(HERE, 'out', 'subsystem-modeling-launch.mp4');

const ff = spawn('ffmpeg', [
  '-y',
  '-f', 'image2pipe', '-vcodec', 'png', '-r', String(FPS), '-i', 'pipe:0',
  '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
  '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
  '-movflags', '+faststart',
  '-r', String(FPS),
  OUT,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--font-render-hinting=none',
    '--disable-lcd-text',
    '--disable-gpu',
    '--allow-file-access-from-files',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto('file://' + join(HERE, 'scene.html'), { waitUntil: 'load' });
await page.evaluate((files) => { window.__FILES = files; }, loadFiles());
await page.evaluate(() => document.fonts.ready);

const total = FPS * DUR;
const t0 = Date.now();
for (let f = 0; f < total; f++) {
  const t = f / FPS;
  const buf = await page.evaluate(async (tt) => {
    window.__render(tt);
    await new Promise(requestAnimationFrame);
    return null;
  }, t);
  const png = await page.screenshot({ type: 'png', optimizeForSpeed: false });
  if (!ff.stdin.write(png)) await once(ff.stdin, 'drain');
  if (f % 150 === 0 || f === total - 1) {
    const pct = ((f + 1) / total * 100).toFixed(0);
    const el = (Date.now() - t0) / 1000;
    process.stdout.write(`  frame ${String(f).padStart(4)}/${total}  t=${t.toFixed(1)}s  ${pct}%  ${el.toFixed(0)}s elapsed\n`);
  }
}
ff.stdin.end();
await once(ff, 'close');
await browser.close();
console.log(`\ndone -> ${OUT}`);
