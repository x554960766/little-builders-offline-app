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

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(4000);
await page.screenshot({ path: '/tmp/lb_garage.png' });
console.log('stage1', await page.evaluate(() => ({
  garage: !!document.querySelector('.garage-root'),
  sandbox: !!document.querySelector('.sandbox-canvas-host'),
  hud: !!document.querySelector('.hud'),
})));

// 点击第 3 辆车（世界 x=-1.22 → 屏幕 ~550px）
await page.mouse.click(550, 400);
await page.waitForSelector('.sandbox-canvas-host', { timeout: 8000 });
await sleep(4200);
// 连拍两张，规避 swiftshader 合成层滞后
await page.screenshot({ path: '/tmp/lb_sandbox_a.png' });
await sleep(600);
await page.screenshot({ path: '/tmp/lb_sandbox_b.png' });

console.log('stage2', await page.evaluate(() => ({
  garage: !!document.querySelector('.garage-root'),
  sandbox: !!document.querySelector('.sandbox-canvas-host'),
  hud: !!document.querySelector('.hud'),
  guide: !!document.querySelector('.guide-hand'),
  sprouts: document.querySelectorAll('.level-sprout').length,
  dots: document.querySelectorAll('.hud-dot').length,
})));

console.log('--- logs ---');
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 20).join('\n') || '(clean)');

await browser.close();
