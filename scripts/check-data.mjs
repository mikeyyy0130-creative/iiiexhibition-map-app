// データの確認(ブラウザを開かずに): npm run check
// data/config.js と作品データを読み込み、設定ミス・画像の置き忘れを一覧表示します。
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadModel } from '../js/data.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
// GitHub Pages はファイル名の大文字・小文字を区別する(Mac では区別されず、手元では見えてしまう)ので、名前を厳密に照合する
const dirCache = new Map();
async function listDir(dir) {
  if (!dirCache.has(dir)) dirCache.set(dir, await readdir(dir).catch(() => []));
  return dirCache.get(dir);
}
async function exists(p) {
  const full = resolve(ROOT, decodeURI(p));
  return (await listDir(dirname(full))).includes(basename(full));
}
/** 見つからない画像について、似た名前のファイルがあればヒントを返す */
async function hint(p) {
  const full = resolve(ROOT, decodeURI(p));
  const want = basename(full, extname(full)).toLowerCase();
  const near = (await listDir(dirname(full))).filter((f) => basename(f, extname(f)).toLowerCase() === want);
  return near.length ? `(${near.join(', ')} があります → ${basename(full)} に名前を変えるか、パスを書き直してください)` : '';
}
const BIG = 1024 * 1024;

// ローカルのファイルは fs から、http(s) は通常の fetch で読む
const realFetch = globalThis.fetch;
globalThis.fetch = async (src, opts) => {
  if (/^https?:/.test(src)) return realFetch(src, opts);
  try {
    const buf = await readFile(resolve(ROOT, src));
    return new Response(buf, { status: 200 });
  } catch {
    return new Response('', { status: 404 });
  }
};

const config = (await import(pathToFileURL(resolve(ROOT, 'data/config.js')).href)).default;
const model = await loadModel(config);
const issues = [...model.issues];

async function checkImage(path, where, { optional = false } = {}) {
  if (!path || /^https?:/.test(path)) return;
  if (await exists(path)) {
    const size = (await stat(resolve(ROOT, decodeURI(path)))).size;
    if (size > BIG) issues.push({ level: 'warn', where, message: `画像が大きすぎます(${(size / BIG).toFixed(1)}MB): ${path}。長辺1200px・300KB程度に縮小すると速く開けます` });
    if (/\.hei[cf]$/i.test(path)) issues.push({ level: 'warn', where, message: `HEIC 形式はブラウザで表示できません: ${path}。JPEG に変換してください` });
    return;
  }
  const h = await hint(path);
  if (optional && !h) issues.push({ level: 'info', where, message: `画像なし(${path} を置くと表示されます)` });
  else issues.push({ level: 'warn', where, message: `画像が見つかりません: ${path}${h}` });
}

for (const w of model.works) await checkImage(w.image, `作品 ${w.id}`, { optional: !w.imageExplicit });
for (const b of model.buildings) {
  for (const e of b.entrances) {
    if (!e.photo) issues.push({ level: 'info', where: `入口 ${e.name}`, message: 'photo(入口写真)が未設定です' });
    else await checkImage(e.photo, `入口 ${e.name}`);
  }
  for (const [floor, f] of Object.entries(b.plan.floors || {})) await checkImage(f.image, `${b.name} ${floor} フロア図`);
}

const label = { error: 'エラー', warn: '注意  ', info: '未設定' };
const order = { error: 0, warn: 1, info: 2 };
issues.sort((a, b) => order[a.level] - order[b.level]);
console.log(`作品データ: ${model.worksSource || '読み込み失敗'}(${model.works.length}件)/ 会場 ${model.venues.length} / 寄り道 ${model.detour.spots.length}件\n`);
for (const i of issues) console.log(`[${label[i.level]}] ${i.where}: ${i.message}`);
const errors = issues.filter((i) => i.level === 'error').length;
console.log(`\nエラー ${errors} / 注意 ${issues.filter((i) => i.level === 'warn').length} / 未設定 ${issues.filter((i) => i.level === 'info').length}`);
process.exit(errors ? 1 : 0);
