import puppeteer from 'puppeteer-core';

/**
 * 六车巡检：逐辆进入工地，映射主线目标部件屏幕坐标并完成第 1 步，截图留证。
 * 用于发现单一车型的场景布局/部件朝向问题。
 */

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

const SLOT_X = [146, 344, 541, 739, 936, 1134];
const IDS = [
  'water_truck',
  'excavator',
  'dump_truck',
  'crane_truck',
  'cement_mixer',
  'bulldozer',
];

const snap = () =>
  page.evaluate(() => {
    const m = window.__lbDebug?.machine;
    if (!m) return null;
    const s = m.getSnapshot();
    return { phase: s.phase, step: s.stepIndex, target: s.targetPartId };
  });

for (let i = 0; i < 6; i++) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2600);
  if (i === 0) await page.screenshot({ path: '/tmp/lb_a_garage.png' });
  await page.mouse.click(SLOT_X[i], 400);
  try {
    await page.waitForSelector('.sandbox-canvas-host', { timeout: 6000 });
  } catch {
    console.log(IDS[i], 'ENTER FAILED');
    continue;
  }

  // 等 PROMPT
  let ready = null;
  for (let k = 0; k < 20; k++) {
    await sleep(400);
    const s = await snap();
    if (s?.phase === 'PROMPT') {
      ready = s;
      break;
    }
  }
  const vid = await page.evaluate(() => window.__lbDebug?.vehicleId);
  console.log(IDS[i], '->', vid, JSON.stringify(ready));

  if (!ready) {
    await page.screenshot({ path: `/tmp/lb_a_${i}_${IDS[i]}.png` });
    continue;
  }

  const dirMap = {
    water_truck: [1, 0],
    excavator: [-1, 0],
    dump_truck: [1, 0],
    crane_truck: [0, 1],
    cement_mixer: [0, 1],
    bulldozer: [0, -1],
  };
  const dir = dirMap[vid] ?? [1, 0];
  const pos = await page.evaluate((id) => window.__lbDebug.partScreen(id), ready.target);
  if (!pos) {
    console.log(IDS[i], 'no anchor for', ready.target);
    await page.screenshot({ path: `/tmp/lb_a_${i}_${IDS[i]}.png` });
    continue;
  }

  await page.screenshot({ path: `/tmp/lb_a_${i}_${IDS[i]}_pre.png` });
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await sleep(40);
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(pos.x + dir[0] * k * 18, pos.y + dir[1] * k * 18);
    await sleep(26);
  }
  await page.mouse.up();
  await sleep(1900);
  await page.screenshot({ path: `/tmp/lb_a_${i}_${IDS[i]}.png` });
  console.log(IDS[i], 'state', JSON.stringify(await snap()));
}

await browser.close();
