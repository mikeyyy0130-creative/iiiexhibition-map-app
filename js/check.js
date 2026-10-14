// データ確認モード(URL に ?check を付けて開く)
// 設定ミス・画像の置き忘れを一覧で表示します。来場者には表示されません。

import { h, icon } from './dom.js';

function probe(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

export async function runCheck(model, mount) {
  const issues = [...model.issues];

  // 画像ファイルの有無
  const images = [];
  for (const w of model.works) {
    if (w.image) images.push({ where: `作品 ${w.id}`, src: w.image, optional: !w.imageExplicit });
  }
  for (const b of model.buildings) {
    for (const e of b.entrances) {
      if (e.photo) images.push({ where: `入口 ${e.name}`, src: e.photo });
      else issues.push({ level: 'info', where: `入口 ${e.name}`, message: 'photo(入口写真)が未設定です' });
    }
    for (const [floor, f] of Object.entries(b.plan.floors || {})) {
      if (f.image) images.push({ where: `${b.name} ${floor} フロア図`, src: f.image });
    }
  }
  const results = await Promise.all(images.map(async (i) => ({ ...i, ok: await probe(i.src) })));
  for (const r of results) {
    if (r.ok) continue;
    issues.push({
      level: r.optional ? 'info' : 'warn',
      where: r.where,
      message: r.optional ? `画像なし(${r.src} を置くと表示されます)` : `画像が見つかりません: ${r.src}`,
    });
  }

  const count = (lv) => issues.filter((i) => i.level === lv).length;
  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);

  const panel = h(
    'details',
    { class: 'check', open: count('error') + count('warn') > 0 },
    h(
      'summary',
      null,
      icon('warn'),
      h('b', null, 'データ確認モード'),
      ` エラー ${count('error')} / 注意 ${count('warn')} / 未設定 ${count('info')}`,
    ),
    h(
      'div',
      { class: 'check-body' },
      h(
        'p',
        null,
        `作品データ: ${model.worksSource || '読み込み失敗'}(${model.works.length}件)/ 会場 ${model.venues.length} / 寄り道 ${model.detour.spots.length}件`,
      ),
      issues.length
        ? h(
            'ul',
            { class: 'check-list' },
            issues.map((i) =>
              h('li', { class: `lv-${i.level}` }, h('span', { class: 'check-lv' }, { error: 'エラー', warn: '注意', info: '未設定' }[i.level]), h('b', null, i.where), ` ${i.message}`),
            ),
          )
        : h('p', null, '問題は見つかりませんでした。'),
    ),
  );
  mount.replaceChildren(panel);
  for (const i of issues) console[i.level === 'error' ? 'error' : 'warn'](`[check] ${i.where}: ${i.message}`);
}
