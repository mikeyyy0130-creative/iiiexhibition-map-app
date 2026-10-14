// データの確認(ブラウザを開かずに): npm run check
// data/config.js と作品データを読み込み、設定ミス・画像の置き忘れを一覧表示します。
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadModel } from '../js/data.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const exists = (p) => access(resolve(ROOT, p)).then(() => true, () => false);

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

for (const w of model.works) {
  if (w.image && !/^https?:/.test(w.image) && !(await exists(w.image))) {
    issues.push(w.imageExplicit
      ? { level: 'warn', where: `作品 ${w.id}`, message: `画像が見つかりません: ${w.image}` }
      : { level: 'info', where: `作品 ${w.id}`, message: `画像なし(${w.image} を置くと表示されます)` });
  }
}
for (const b of model.buildings) {
  for (const e of b.entrances) {
    if (!e.photo) issues.push({ level: 'info', where: `入口 ${e.name}`, message: 'photo(入口写真)が未設定です' });
    else if (!/^https?:/.test(e.photo) && !(await exists(e.photo))) issues.push({ level: 'warn', where: `入口 ${e.name}`, message: `画像が見つかりません: ${e.photo}` });
  }
  for (const [floor, f] of Object.entries(b.plan.floors || {})) {
    if (f.image && !/^https?:/.test(f.image) && !(await exists(f.image))) issues.push({ level: 'warn', where: `${b.name} ${floor} フロア図`, message: `画像が見つかりません: ${f.image}` });
  }
}

const label = { error: 'エラー', warn: '注意  ', info: '未設定' };
const order = { error: 0, warn: 1, info: 2 };
issues.sort((a, b) => order[a.level] - order[b.level]);
console.log(`作品データ: ${model.worksSource || '読み込み失敗'}(${model.works.length}件)/ 会場 ${model.venues.length} / 寄り道 ${model.detour.spots.length}件\n`);
for (const i of issues) console.log(`[${label[i.level]}] ${i.where}: ${i.message}`);
const errors = issues.filter((i) => i.level === 'error').length;
console.log(`\nエラー ${errors} / 注意 ${issues.filter((i) => i.level === 'warn').length} / 未設定 ${issues.filter((i) => i.level === 'info').length}`);
process.exit(errors ? 1 : 0);
