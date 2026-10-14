// 建物内の案内:階数ストリップ(エレベーター表示風)+簡易フロア図+行き方+入口写真

import { h, s, icon } from './dom.js';
import { floorCode, floorText } from './data.js';

/**
 * @param building  建物(venues, entrances, plan を持つ)
 * @param venue     案内する会場
 * @param shownFloor 表示中の階(数値)。省略時は会場の階
 * @param handlers  { onFloor(n), onShowEntrance(entranceId) }
 * @param checkMode ?check のときは写真の差し込み先パスを表示
 */
export function renderGuide(building, venue, shownFloor, handlers, checkMode) {
  const entrance = venue.entranceObj;
  const floor = Number.isFinite(shownFloor) ? shownFloor : venue.floorN;
  return h(
    'div',
    { class: 'guide' },
    h(
      'div',
      { class: 'guide-title', style: `--c:${venue.color}` },
      h('b', { class: 'badge badge-lg', 'aria-hidden': 'true' }, venue.id),
      h(
        'div',
        null,
        h('div', { class: 'guide-name' }, venue.name),
        h(
          'div',
          { class: 'guide-meta' },
          h('span', { class: 'code' }, floorCode(venue.floorN)),
          ` ${building.name} ${floorText(venue.floorN)}`,
        ),
      ),
    ),
    h(
      'div',
      { class: 'plan-row' },
      floorStrip(building, venue, floor, handlers.onFloor),
      planFigure(building, venue, floor),
    ),
    steps(venue),
    entrance ? entranceCard(entrance, handlers.onShowEntrance, checkMode) : null,
  );
}

/** 案内に出す階:入口の階・会場のある階(+表示中の階)。上の階ほど上に */
function relevantFloors(building, venue, floor) {
  const set = new Set([floor, venue.floorN, venue.entranceObj?.floorN ?? 1]);
  for (const v of building.venues) set.add(v.floorN);
  return [...set].filter(Number.isFinite).sort((a, b) => b - a);
}

function floorStrip(building, venue, floor, onFloor) {
  const floors = relevantFloors(building, venue, floor);
  const entranceFloor = venue.entranceObj?.floorN ?? 1;
  const items = [];
  floors.forEach((n, i) => {
    // 1つ飛ばし以上で離れている階の間には「…」
    if (i > 0) {
      const prev = floors[i - 1];
      const gap = prev > 0 && n < 0 ? prev - n - 2 : prev - n - 1; // 0階は存在しない
      if (gap > 0) items.push(h('li', { class: 'fs-gap', 'aria-hidden': 'true' }, '⋮'));
    }
    const here = building.venues.filter((v) => v.floorN === n);
    items.push(
      h(
        'li',
        null,
        h(
          'button',
          {
            type: 'button',
            class: `fs-floor${n === floor ? ' is-shown' : ''}${n === venue.floorN ? ' is-target' : ''}`,
            'aria-pressed': String(n === floor),
            'aria-label': `${floorText(n)}のフロア図を表示${here.length ? `(会場 ${here.map((v) => v.id).join('・')})` : ''}${n === entranceFloor ? '(入口の階)' : ''}`,
            style: `--c:${venue.color}`,
            onclick: () => onFloor(n),
          },
          h('span', { class: 'fs-code' }, floorCode(n)),
          h(
            'span',
            { class: 'fs-marks' },
            here.map((v) => h('b', { class: `badge badge-xs${v.id === venue.id ? '' : ' is-dim'}`, style: `--c:${v.color}` }, v.id)),
            n === entranceFloor && !here.length ? h('span', { class: 'fs-door' }, '入口') : null,
          ),
        ),
      ),
    );
  });
  return h('ol', { class: 'floor-strip', 'aria-label': '階の一覧' }, items);
}

function planFigure(building, venue, floor) {
  const plan = building.plan;
  const W = plan.width;
  const H = plan.height;
  const code = floorCode(floor);
  const override = plan.floors?.[code] || {};
  const outline = override.outline || plan.outline || [[0, 0], [W, 0], [W, H], [0, H]];
  const image = override.image;
  const pad = 9; // 外側の余白(入口ラベル用)
  const vb = `${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`;
  const pts = (arr) => arr.map(([x, y]) => `${x},${y}`).join(' ');

  const layers = [];
  if (image) {
    layers.push(s('image', { href: image, x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none' }));
  } else {
    layers.push(s('polygon', { points: pts(outline), class: 'fp-outline' }));
  }

  // この階にある会場(案内中の会場を強調)
  const onFloor = building.venues.filter((v) => v.floorN === floor && v.room);
  for (const v of onFloor) {
    const r = v.room;
    const target = v.id === venue.id;
    layers.push(
      s(
        'g',
        { class: `fp-room${target ? ' is-target' : ''}`, style: `--c:${v.color}` },
        s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 1.2 }),
        s('text', { x: r.x + r.w / 2, y: r.y + r.h / 2, class: 'fp-room-id' }, v.id),
        s('text', { x: r.x + r.w / 2, y: r.y + r.h / 2 + 6.2, class: 'fp-room-name' }, v.name),
      ),
    );
  }

  // 道順の点線:会場の階なら EV/階段→部屋、入口の階なら 入口→EV/階段
  const entrance = venue.entranceObj;
  if (floor === venue.floorN && venue.path?.length > 1) {
    layers.push(s('polyline', { points: pts(venue.path), class: 'fp-path', style: `--c:${venue.color}` }));
  }
  if (entrance && floor === entrance.floorN && entrance.path?.length > 1 && floor !== venue.floorN) {
    layers.push(s('polyline', { points: pts(entrance.path), class: 'fp-path', style: `--c:${venue.color}` }));
  }

  // エレベーター・階段
  for (const c of plan.cores || []) {
    layers.push(
      s(
        'g',
        { class: `fp-core fp-${c.type || 'core'}` },
        s('rect', { x: c.x - 3.4, y: c.y - 3.4, width: 6.8, height: 6.8, rx: 1 }),
        s('text', { x: c.x, y: c.y + 1.3 }, c.type === 'ev' ? 'EV' : c.type === 'stairs' ? '階段' : c.label || ''),
      ),
    );
  }

  // 入口(その階にあるもの)
  for (const e of building.entrances) {
    if (e.floorN !== floor || !e.plan) continue;
    const used = entrance && e.id === entrance.id;
    const { x, y } = e.plan;
    // 外形の外側へ向けてラベルを置く
    const lx = x <= 0 ? x - 1.5 : x >= W ? x + 1.5 : x;
    const ly = y <= 0 ? y - 3.2 : y >= H ? y + 6.4 : y;
    const anchor = x <= 0 ? 'end' : x >= W ? 'start' : 'middle';
    layers.push(
      s(
        'g',
        { class: `fp-entrance${used ? ' is-used' : ''}`, style: `--c:${venue.color}` },
        s('circle', { cx: x, cy: y, r: used ? 2.6 : 1.8 }),
        used ? s('text', { x: lx, y: ly, 'text-anchor': anchor }, '入口') : null,
      ),
    );
  }

  // 方位
  const north = Number(plan.north) || 0;
  layers.push(
    s(
      'g',
      { class: 'fp-north', transform: `translate(${W + pad - 4.5} ${-pad + 5}) rotate(${north})` },
      s('path', { d: 'M0 -3.6 L2.2 2.6 L0 1.4 L-2.2 2.6 Z' }),
      s('text', { x: 0, y: 7.4 }, 'N'),
    ),
  );

  const label = `${building.name} ${floorText(floor)}の簡易フロア図${floor === venue.floorN ? `。会場${venue.id}「${venue.name}」の位置を色で示しています` : ''}`;
  return h(
    'figure',
    { class: 'plan' },
    s('svg', { viewBox: vb, role: 'img', 'aria-label': label, class: 'plan-svg' }, layers),
    h(
      'figcaption',
      { class: 'plan-cap' },
      h('span', { class: 'code' }, code),
      floor === venue.floorN ? ' 会場の階' : floor === entrance?.floorN ? ' 入口の階' : ' フロア図',
    ),
  );
}

function steps(venue) {
  if (!venue.steps.length) return null;
  return h(
    'section',
    { class: 'steps', 'aria-label': '行き方' },
    h('h3', { class: 'sub-h' }, '行き方'),
    h('ol', { class: 'step-list', style: `--c:${venue.color}` }, venue.steps.map((t) => h('li', null, t))),
  );
}

function entranceCard(e, onShowEntrance, checkMode) {
  return h(
    'section',
    { class: 'entrance', 'aria-label': '使う入口' },
    h('h3', { class: 'sub-h' }, '使う入口'),
    photoFrame(e.photo, `${e.name}の写真`, '入口の写真', checkMode),
    h(
      'div',
      { class: 'entrance-body' },
      h('div', { class: 'entrance-name' }, e.name),
      e.note ? h('p', { class: 'entrance-note' }, e.note) : null,
      Number.isFinite(e.lat)
        ? h(
            'button',
            { type: 'button', class: 'btn btn-quiet', onclick: () => onShowEntrance(e.id) },
            icon('pin'),
            '地図で入口を見る',
          )
        : null,
    ),
  );
}

/**
 * 写真の枠。画像が読めない(まだ置いていない)ときは「準備中」の枠を出す。
 * ?check のときは、どこに画像を置けばよいかを表示
 */
export function photoFrame(src, alt, kind, checkMode, cls = 'photo') {
  const frame = h('div', { class: `${cls} is-empty` });
  const empty = h(
    'div',
    { class: 'photo-empty' },
    icon('image'),
    h('span', null, `${kind}(準備中)`),
    checkMode && src ? h('code', { class: 'photo-path' }, src) : null,
    checkMode && !src ? h('code', { class: 'photo-path' }, 'photo が未設定') : null,
  );
  frame.append(empty);
  if (src) {
    const img = h('img', { src, alt, loading: 'lazy', decoding: 'async' });
    img.addEventListener('load', () => {
      frame.classList.remove('is-empty');
      empty.remove();
    });
    img.addEventListener('error', () => img.remove());
    frame.prepend(img);
  }
  return frame;
}
