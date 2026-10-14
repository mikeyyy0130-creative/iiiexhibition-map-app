// スマホ相当の画面で主要な操作を通しで確認する: npm run test:e2e
// 地図タイル・Webフォントは外部に取りに行かず、ダミーを返す(オフラインでも動くように)
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { startServer } from '../scripts/serve.mjs';

const PORT = 8790;
const BASE = `http://localhost:${PORT}/`;
const HONGO3 = { latitude: 35.7102, longitude: 139.7605, accuracy: 25 }; // 本郷三丁目寄り
const server = await startServer(PORT);
const browser = await chromium.launch();

const TILE = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f2efe9"/></svg>';

async function newPage({ geo = HONGO3, grant = true } = {}) {
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'ja-JP',
    geolocation: geo,
    permissions: grant ? ['geolocation'] : [],
  });
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ contentType: 'image/svg+xml', body: TILE }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  return page;
}

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
    console.log(`ok   ${name}`);
  } catch (e) {
    results.push(['FAIL', name]);
    console.log(`FAIL ${name}\n     ${e.message.split('\n').join('\n     ')}`);
  }
}

const page = await newPage();
await page.goto(BASE);
await page.waitForSelector('.bpin-card');

await step('初期表示: 展示会場のピンだけ(寄り道は出ない)', async () => {
  assert.equal(await page.locator('.bpin-card').count(), 2);
  assert.equal(await page.locator('.spin').count(), 0);
  assert.equal(await page.locator('.venue-row').count(), 4);
});

await step('現在地が地図に出て、会場までの距離が出る', async () => {
  await page.waitForSelector('.upin', { timeout: 5000 });
  await page.waitForFunction(() => /現在地から徒歩\d+分/.test(document.querySelector('.site .dist')?.textContent || ''));
  assert.equal(await page.locator('#locate').getAttribute('data-state'), 'active');
});

await step('2号館のピン → フロア案内(A/B/C を選べる)', async () => {
  await page.locator('.bpin-card', { hasText: '工学部2号館' }).click();
  await page.waitForFunction(() => location.hash === '#building/eng2');
  assert.equal(await page.locator('.vp').count(), 3);
  assert.equal(await page.locator('.guide-name').textContent(), '展示会場');
  const href = await page.locator('.sheet-head .btn-primary').getAttribute('href');
  assert.match(href, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=35\.\d+%2C139\.\d+&travelmode=walking$/);
});

await step('会場Cを選ぶと 9F の案内と、1F(入口)・2F・9F の階表示', async () => {
  await page.locator('.vp', { hasText: '92B' }).click();
  assert.equal(await page.locator('.guide-name').textContent(), '92B');
  assert.deepEqual(await page.locator('.fs-code').allTextContents(), ['9F', '2F', '1F']);
  assert.equal(await page.locator('.fp-room.is-target .fp-room-id').textContent(), 'C');
  await page.locator('.fs-floor', { hasText: '1F' }).click();
  assert.match(await page.locator('.plan-cap').textContent(), /1F.*入口/);
  assert.equal(await page.locator('.fp-entrance.is-used').count(), 1);
});

await step('作品タブ: 2号館の作品カードと、会場でのしぼりこみ', async () => {
  await page.locator('[role=tab]', { hasText: '作品' }).click();
  assert.equal(await page.locator('.card').count(), 25);
  await page.locator('.chip', { hasText: 'フォーラム' }).click();
  assert.equal(await page.locator('.card').count(), 9);
});

await step('作品カード → 詳細(戻るで閉じる)', async () => {
  await page.locator('.card').first().click();
  await page.waitForSelector('#overlay:not([hidden])');
  assert.equal(await page.locator('.detail-title').textContent(), 'みんなの重力');
  await page.goBack();
  await page.waitForSelector('#overlay', { state: 'hidden' });
  assert.equal(await page.locator('.card').count(), 9, '一覧の状態は保たれる');
});

await step('寄り道に切り替えると、寄り道ピンが出て展示ピンも残る', async () => {
  await page.locator('[data-mode-btn=detour]').click();
  await page.waitForFunction(() => location.hash === '#detour');
  assert.equal(await page.locator('.spin').count(), 7);
  assert.equal(await page.locator('.bpin-card').count(), 2);
  assert.equal(await page.locator('path.walk-line').count(), 2);
  assert.equal(await page.locator('.spot-comment').count(), 7);
  assert.equal(await page.locator('.spot a', { hasText: 'お店のページ' }).count(), 0, 'url 未設定ならリンクを出さない');
});

await step('展示会場に戻すと寄り道ピンが消える', async () => {
  await page.locator('[data-mode-btn=exhibit]').click();
  await page.waitForFunction(() => !location.hash);
  assert.equal(await page.locator('.spin').count(), 0);
});

await step('展示情報の画面', async () => {
  await page.locator('#info-btn').click();
  await page.waitForSelector('#overlay:not([hidden]) .info');
  assert.equal(await page.locator('.day').count(), 5);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#overlay', { state: 'hidden' });
});

await step('ページ内でエラーが起きていない', async () => {
  assert.deepEqual(page.errors, []);
});

await step('QR 用リンク: #venue/D と ?venue=C で会場が開く', async () => {
  const p = await newPage();
  await p.goto(`${BASE}#venue/D`);
  await p.waitForSelector('.guide-name');
  assert.equal(await p.locator('.guide-name').textContent(), '中山未来ファクトリー');
  assert.deepEqual(await p.locator('.fs-code').allTextContents(), ['1F', 'B1']);
  await p.goto(`${BASE}?venue=C`);
  await p.waitForFunction(() => document.querySelector('.guide-name')?.textContent === '92B');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

await step('位置情報を拒否 → 設定方法つきの案内が出る', async () => {
  const p = await newPage({ grant: false });
  await p.goto(BASE);
  await p.waitForSelector('.bpin-card');
  await p.locator('#locate').click();
  await p.waitForSelector('#toast:not([hidden])');
  assert.match(await p.locator('#toast').textContent(), /許可/);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

await step('?check でデータ確認パネル(エラー 0)', async () => {
  const p = await newPage();
  await p.goto(`${BASE}?check`);
  await p.waitForSelector('.check summary');
  assert.match(await p.locator('.check summary').textContent(), /エラー 0/);
  await p.context().close();
});

await browser.close();
server.close();
const failed = results.filter(([r]) => r === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
