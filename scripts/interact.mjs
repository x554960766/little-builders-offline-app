import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:4173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
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
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

const snap = () =>
  page.evaluate(() => {
    const m = window.__lbDebug?.machine;
    if (!m) return null;
    const s = m.getSnapshot();
    return { phase: s.phase, step: s.stepIndex, target: s.targetPartId, p: +s.progress.toFixed(2) };
  });

const waitPrompt = async (step) => {
  for (let i = 0; i < 30; i++) {
    const s = await snap();
    if (s && s.phase === 'PROMPT' && s.step === step) return s;
    await sleep(400);
  }
  return null;
};

/** 用真实指针事件沿教学方向拖拽目标部件 */
async function dragPart(partId, dir = [1, 0]) {
  const pos = await page.evaluate((id) => window.__lbDebug.partScreen(id), partId);
  if (!pos) return false;
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await sleep(50);
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(pos.x + dir[0] * i * 18, pos.y + dir[1] * i * 18);
    await sleep(28);
  }
  await page.mouse.up();
  return true;
}

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(3200);
await page.mouse.click(550, 400);
await page.waitForSelector('.sandbox-canvas-host', { timeout: 8000 });
console.log('vehicle', await page.evaluate(() => window.__lbDebug.vehicleId));

const steps = [
  ['part_headlights', [1, 0]],
  ['part_hopper_lever', [0, 1]],
  ['part_dump_bed', [0.3, -1]],
];

for (let i = 0; i < steps.length; i++) {
  const ready = await waitPrompt(i);
  console.log(`step${i + 1} ready`, JSON.stringify(ready));
  if (!ready) break;
  await dragPart(steps[i][0], steps[i][1]);
  await sleep(900);
  console.log(`step${i + 1} after drag`, JSON.stringify(await snap()));
  await sleep(2400);
  await page.screenshot({ path: `/tmp/lb_step${i + 1}.png` });
  console.log(`step${i + 1} after cascade`, JSON.stringify(await snap()));
}

for (let i = 0; i < 16; i++) {
  const celeb = await page.evaluate(() => !!document.querySelector('.celebration'));
  if (celeb) break;
  await sleep(500);
}
await sleep(1200);
await page.screenshot({ path: '/tmp/lb_celebrate.png' });
console.log('final', JSON.stringify(await snap()));
console.log('celebrating', await page.evaluate(() => !!document.querySelector('.celebration')));

console.log('--- errors ---');
console.log(logs.filter((l) => !l.includes('GPU stall') && !l.includes('404')).slice(0, 10).join('\n') || '(clean)');

await browser.close();
