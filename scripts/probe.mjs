import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await sleep(3000);
await page.mouse.click(550, 400);
await page.waitForSelector('.sandbox-canvas-host');

const snap = () =>
  page.evaluate(() => {
    const m = window.__lbDebug?.machine;
    if (!m) return null;
    const s = m.getSnapshot();
    return { phase: s.phase, step: s.stepIndex, target: s.targetPartId, p: +s.progress.toFixed(2) };
  });

// 等进入 PROMPT
for (let i = 0; i < 12; i++) {
  await sleep(700);
  const s = await snap();
  if (s?.phase === 'PROMPT') break;
}
console.log('ready', JSON.stringify(await snap()));

const pos = await page.evaluate(() => window.__lbDebug.partScreen('part_headlights'));
console.log('target screen', JSON.stringify(pos));

await page.mouse.move(pos.x, pos.y);
await page.mouse.down();
await sleep(60);
console.log('after down', JSON.stringify(await snap()));
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(pos.x + i * 18, pos.y);
  await sleep(30);
  if (i === 4) console.log('mid drag', JSON.stringify(await snap()));
}
await page.mouse.up();
await sleep(500);
console.log('after up', JSON.stringify(await snap()));
await sleep(2500);
console.log('after cascade', JSON.stringify(await snap()));
await page.screenshot({ path: '/tmp/lb_step1.png' });

await browser.close();
