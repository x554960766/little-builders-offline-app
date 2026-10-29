import puppeteer from 'puppeteer-core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--mute-audio',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const snap = () =>
  page.evaluate(() => {
    const m = window.__lbDebug?.machine;
    if (!m) return null;
    const s = m.getSnapshot();
    return { phase: s.phase, step: s.stepIndex, target: s.targetPartId };
  });

const waitPrompt = async (step) => {
  for (let i = 0; i < 30; i++) {
    const s = await snap();
    if (s && s.phase === 'PROMPT' && s.step === step) return s;
    await sleep(400);
  }
  return null;
};

await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await sleep(3500);
await page.screenshot({ path: '/tmp/f_garage.png' });

await page.mouse.click(550, 400);
await page.waitForSelector('.sandbox-canvas-host');
const ready0 = await waitPrompt(0);
await page.screenshot({ path: '/tmp/f_sandbox.png' });
console.log('step0', JSON.stringify(ready0));

const steps = [
  ['part_headlights', [1, 0]],
  ['part_hopper_lever', [0, 1]],
  ['part_dump_bed', [0.3, -1]],
];

for (let i = 0; i < steps.length; i++) {
  const ready = await waitPrompt(i);
  if (!ready) break;
  const pos = await page.evaluate((id) => window.__lbDebug.partScreen(id), steps[i][0]);
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await sleep(40);
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(pos.x + steps[i][1][0] * k * 18, pos.y + steps[i][1][1] * k * 18);
    await sleep(26);
  }
  await page.mouse.up();
  await sleep(600);
}

for (let i = 0; i < 20; i++) {
  const celeb = await page.evaluate(() => !!document.querySelector('.celebration'));
  if (celeb) break;
  await sleep(500);
}
await sleep(2600);
await page.screenshot({ path: '/tmp/f_celebrate.png' });
const ui = await page.evaluate(() => ({
  buttons: document.querySelectorAll('.celebration-btn').length,
  sticker: !!document.querySelector('.celebration-sticker'),
  box: !!document.querySelector('.celebration-box'),
  stickers: localStorage.getItem('little_builders_stickers_v1'),
}));
console.log('celebration ui', JSON.stringify(ui));
console.log('errors', errors.length ? errors.join(' | ') : '(none)');

await browser.close();
