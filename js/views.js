// シートの中身(会場一覧・建物・作品・寄り道)と、全画面の重ね表示(作品詳細・展示情報)

import { h, icon, safeUrl } from './dom.js';
import { floorCode, floorText, formatDateJa, dateParts, hoursOn, exhibitionStatus } from './data.js';
import { renderGuide, photoFrame } from './floorplan.js';
import { googleRouteUrl, describeDistance, distance } from './geo.js';

const badge = (v, size = '') =>
  h('b', { class: `badge${size ? ` badge-${size}` : ''}`, style: `--c:${v.color}`, 'aria-hidden': 'true' }, v.id);

/** 現在地からの距離表示(現在地が更新されたら updateDistances が書き換える) */
function distSlot(point, prefix = '') {
  return h('span', {
    class: 'dist',
    dataset: { lat: String(point.lat), lng: String(point.lng), prefix },
  });
}

export function updateDistances(root, user) {
  for (const el of root.querySelectorAll('.dist[data-lat]')) {
    if (!user) {
      el.textContent = '';
      continue;
    }
    const m = distance(user, { lat: Number(el.dataset.lat), lng: Number(el.dataset.lng) });
    el.textContent = `${el.dataset.prefix || ''}${describeDistance(m)}`;
  }
}

function routeButton(target, label = 'Googleマップで経路を開く', cls = 'btn btn-primary') {
  return h(
    'a',
    { class: cls, href: googleRouteUrl(target), target: '_blank', rel: 'noopener' },
    icon('route'),
    h('span', null, label),
  );
}

function statusChip(ex) {
  const st = exhibitionStatus(ex);
  if (!st.label) return null;
  return h(
    'span',
    { class: 'status', dataset: { state: st.state } },
    h('b', null, st.label),
    st.detail ? h('span', null, st.detail) : null,
  );
}

// ---------------------------------------------------------------------------
// 会場一覧(初期表示)
// ---------------------------------------------------------------------------
export function homeView(model, ctx) {
  const head = h(
    'div',
    { class: 'head-row' },
    h('h2', { class: 'sheet-title' }, '会場'),
    h('span', { class: 'head-count' }, `${model.venues.length}か所`),
    statusChip(model.exhibition),
  );
  const list = h(
    'ul',
    { class: 'site-list' },
    model.buildings
      .filter((b) => b.venues.length)
      .map((b) =>
        h(
          'li',
          { class: 'site' },
          h(
            'div',
            { class: 'site-top' },
            h(
              'button',
              { type: 'button', class: 'site-open', onclick: () => ctx.go(`building/${b.id}`) },
              h('span', { class: 'site-name' }, b.name),
              distSlot(b.routeTarget, '現在地から'),
            ),
            routeButton(b.routeTarget, '経路', 'btn btn-route'),
          ),
          h(
            'ul',
            { class: 'venue-rows' },
            b.venues.map((v) =>
              h(
                'li',
                null,
                h(
                  'button',
                  { type: 'button', class: 'venue-row', style: `--c:${v.color}`, onclick: () => ctx.go(`venue/${v.id}`) },
                  badge(v),
                  h('span', { class: 'venue-row-name' }, v.name),
                  h('span', { class: 'code floor', 'aria-label': floorText(v.floorN) }, floorCode(v.floorN)),
                  h('span', { class: 'venue-row-count' }, `${model.worksByVenue.get(v.id)?.length || 0}作品`),
                ),
              ),
            ),
          ),
        ),
      ),
  );
  const multi = model.buildings.find((b) => b.venues.length > 1);
  const note = multi
    ? h(
        'p',
        { class: 'hint' },
        `${multi.name}の中にある${multi.venues.length}つの会場は、GPSでは区別できません。建物に着いたら、会場を選んでフロア図で場所を確認してください。`,
      )
    : null;
  return { head, body: [list, note] };
}

// ---------------------------------------------------------------------------
// 建物(館内の行き方/作品)
// ---------------------------------------------------------------------------
export function buildingView(model, ctx, st) {
  const b = model.buildingById.get(st.id);
  const venue = model.venueById.get(st.venue) || b.venues[0];
  const works = b.venues.flatMap((v) => model.worksByVenue.get(v.id) || []);
  const tab = st.tab === 'works' ? 'works' : 'guide';

  const head = [
    h(
      'div',
      { class: 'head-row' },
      h(
        'button',
        { type: 'button', class: 'icon-btn', 'aria-label': '会場一覧に戻る', onclick: () => ctx.go('') },
        icon('back'),
      ),
      h(
        'div',
        { class: 'head-titles' },
        h('h2', { class: 'sheet-title' }, b.name),
        h(
          'div',
          { class: 'head-sub' },
          h('span', { class: 'badges' }, b.venues.map((v) => badge(v, 'xs'))),
          distSlot(b.routeTarget, '現在地から'),
        ),
      ),
    ),
    routeButton(venue?.entranceObj && Number.isFinite(venue.entranceObj.lat) ? venue.entranceObj : b.routeTarget),
    h(
      'div',
      { class: 'tabs', role: 'tablist' },
      tabButton('館内の行き方', tab === 'guide', () => ctx.go(`building/${b.id}/guide/${venue?.id || ''}`, { replace: true })),
      tabButton(
        h('span', null, '作品', h('span', { class: 'tab-count' }, works.length)),
        tab === 'works',
        () => ctx.go(`building/${b.id}/works${st.filter ? `/${st.filter}` : ''}`, { replace: true }),
      ),
    ),
  ];

  let body;
  if (tab === 'guide') {
    if (!venue) {
      body = h('p', { class: 'empty' }, 'この建物には会場が登録されていません。');
    } else {
      body = [
        b.venues.length > 1 ? venuePicker(b, venue, (id) => ctx.go(`building/${b.id}/guide/${id}`, { replace: true })) : null,
        renderGuide(
          b,
          venue,
          st.floor,
          {
            onFloor: (n) => ctx.setFloor(n),
            onShowEntrance: (id) => ctx.showEntrance(id),
          },
          ctx.checkMode,
        ),
        h('p', { class: 'hint' }, '建物の中ではGPSの位置が10〜30mほどずれ、階もわかりません。フロア図と館内の案内表示をたよりに進んでください。'),
      ];
    }
  } else {
    body = worksList(model, ctx, b, st.filter);
  }
  return { head, body };
}

function tabButton(label, selected, onclick) {
  return h(
    'button',
    { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(selected), onclick },
    label,
  );
}

function venuePicker(b, current, onPick) {
  return h(
    'div',
    { class: 'venue-picker', role: 'radiogroup', 'aria-label': '案内する会場' },
    b.venues.map((v) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(v.id === current.id),
          class: 'vp',
          style: `--c:${v.color}`,
          onclick: () => onPick(v.id),
        },
        badge(v, 'sm'),
        h('span', { class: 'vp-name' }, v.name),
        h('span', { class: 'code vp-floor' }, floorCode(v.floorN)),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// 作品カード
// ---------------------------------------------------------------------------
function worksList(model, ctx, b, filter) {
  if (model.worksError && !model.works.length) {
    return h(
      'div',
      { class: 'empty' },
      icon('warn'),
      h('p', null, '作品データを読み込めませんでした。通信状況を確認して、ページを再読み込みしてください。'),
    );
  }
  const venues = b.venues.filter((v) => !filter || v.id === filter);
  const chips =
    b.venues.length > 1
      ? h(
          'div',
          { class: 'chips', role: 'group', 'aria-label': '会場でしぼりこむ' },
          chip('すべて', !filter, () => ctx.go(`building/${b.id}/works`, { replace: true })),
          b.venues.map((v) =>
            chip([badge(v, 'xs'), ` ${v.name}`], filter === v.id, () => ctx.go(`building/${b.id}/works/${v.id}`, { replace: true }), v.color),
          ),
        )
      : null;
  const groups = venues.map((v) => {
    const works = model.worksByVenue.get(v.id) || [];
    return h(
      'section',
      { class: 'work-group', 'aria-label': `会場${v.id} ${v.name}の作品` },
      h(
        'h3',
        { class: 'group-h', style: `--c:${v.color}` },
        badge(v, 'sm'),
        h('span', null, v.name),
        h('span', { class: 'code' }, floorCode(v.floorN)),
        h('span', { class: 'group-count' }, `${works.length}作品`),
      ),
      works.length
        ? h('ul', { class: 'cards' }, works.map((w) => h('li', null, workCard(w, ctx))))
        : h('p', { class: 'empty-sm' }, '作品情報は準備中です'),
    );
  });
  return [chips, ...groups];
}

function chip(label, pressed, onclick, color) {
  return h(
    'button',
    { type: 'button', class: 'chip', 'aria-pressed': String(pressed), onclick, style: color ? `--c:${color}` : null },
    label,
  );
}

function workCard(w, ctx) {
  return h(
    'button',
    { type: 'button', class: 'card', onclick: () => ctx.go(`work/${encodeURIComponent(w.id)}`) },
    thumb(w),
    h(
      'span',
      { class: 'card-text' },
      h('span', { class: 'card-code code', style: `--c:${w.venueObj.color}` }, w.id),
      h('span', { class: 'card-title' }, w.title),
      w.artist ? h('span', { class: 'card-artist' }, w.artist) : null,
      w.description ? h('span', { class: 'card-desc' }, w.description) : null,
    ),
  );
}

function thumb(w) {
  // 画像がない間は、会場色の地に作品番号を出す
  const box = h('span', { class: 'thumb', style: `--c:${w.venueObj.color}` }, h('span', { class: 'thumb-ph code' }, w.id));
  if (w.image) {
    const img = h('img', { src: w.image, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('load', () => box.classList.add('has-img'));
    img.addEventListener('error', () => img.remove());
    box.prepend(img);
  }
  return box;
}

// ---------------------------------------------------------------------------
// 寄り道
// ---------------------------------------------------------------------------
export function detourView(model, ctx, st) {
  const d = model.detour;
  const head = h(
    'div',
    { class: 'head-row head-detour' },
    h('div', { class: 'head-titles' }, h('h2', { class: 'sheet-title' }, '寄り道'), d.intro ? h('div', { class: 'head-sub' }, d.intro) : null),
  );
  const from = d.from;
  const body = d.categories
    .filter((c) => c.spots.length)
    .map((c) =>
      h(
        'section',
        { class: 'spot-group', 'aria-label': c.name },
        h(
          'h3',
          { class: 'spot-group-h' },
          icon(c.icon || 'pin', 'icon spot-ic'),
          h('span', null, c.name),
          c.note ? h('span', { class: 'spot-note' }, c.note) : null,
        ),
        h(
          'ul',
          { class: 'spots' },
          c.spots.map((s) => {
            const fromText = from ? `${from.name}から${describeDistance(distance(from, s))}` : '';
            return h(
              'li',
              { class: `spot${st.spot === s.id ? ' is-selected' : ''}`, id: `spot-${s.id}` },
              h(
                'button',
                { type: 'button', class: 'spot-main', onclick: () => ctx.go(`detour/${s.id}`, { replace: true }) },
                h('span', { class: 'spot-name' }, s.name),
                h('span', { class: 'spot-dist' }, fromText),
              ),
              s.comment
                ? h(
                    'blockquote',
                    { class: 'spot-comment' },
                    h('p', null, s.comment),
                    s.by ? h('footer', null, s.by) : null,
                  )
                : null,
              h(
                'div',
                { class: 'spot-actions' },
                h(
                  'button',
                  { type: 'button', class: 'btn btn-quiet', onclick: () => ctx.go(`detour/${s.id}`, { replace: true }) },
                  icon('pin'),
                  '地図で見る',
                ),
                routeButton(s, '経路', 'btn btn-quiet'),
                safeUrl(s.url)
                  ? h('a', { class: 'btn btn-quiet', href: safeUrl(s.url), target: '_blank', rel: 'noopener' }, icon('external'), 'お店のページ')
                  : null,
              ),
            );
          }),
        ),
      ),
    );
  body.push(
    h(
      'button',
      { type: 'button', class: 'btn btn-back-exhibit', onclick: () => ctx.go('') },
      icon('back'),
      '展示会場にもどる',
    ),
  );
  return { head, body };
}

// ---------------------------------------------------------------------------
// 作品詳細(全画面)
// ---------------------------------------------------------------------------
export function workDetail(model, ctx, w) {
  const v = w.venueObj;
  const link = safeUrl(w.link);
  return h(
    'article',
    { class: 'detail', style: `--c:${v.color}` },
    h(
      'div',
      { class: 'detail-media' },
      photoFrame(w.image, w.title, '作品画像', ctx.checkMode, 'photo detail-photo'),
    ),
    h(
      'div',
      { class: 'detail-body' },
      h('div', { class: 'detail-code code' }, w.id),
      h('h2', { class: 'detail-title', id: 'overlay-title' }, w.title),
      w.artist ? h('p', { class: 'detail-artist' }, w.artist) : null,
      w.description ? h('p', { class: 'detail-desc' }, w.description) : null,
      link ? h('a', { class: 'btn btn-quiet', href: link, target: '_blank', rel: 'noopener' }, icon('external'), '作品ページを開く') : null,
      h(
        'button',
        { type: 'button', class: 'detail-where', onclick: () => ctx.go(`venue/${v.id}`) },
        badge(v, 'sm'),
        h(
          'span',
          null,
          h('span', { class: 'detail-where-name' }, `${v.name}(${v.buildingObj.name} ${floorText(v.floorN)})`),
          h('span', { class: 'detail-where-go' }, 'この会場への行き方を見る'),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// 展示情報(全画面)
// ---------------------------------------------------------------------------
export function infoView(model) {
  const ex = model.exhibition;
  const p = ex.period;
  const days = [];
  if (p?.start && p?.end) {
    for (let d = p.start; d <= p.end; ) {
      days.push(d);
      const [y, m, dd] = d.split('-').map(Number);
      d = new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
      if (days.length > 60) break;
    }
  }
  const site = safeUrl(ex.website);
  return h(
    'article',
    { class: 'info' },
    h('h2', { class: 'info-title', id: 'overlay-title' }, ex.title || ''),
    statusChip(ex),
    days.length
      ? h(
          'section',
          null,
          h('h3', { class: 'sub-h' }, '会期と開場時間'),
          h(
            'ul',
            { class: 'days' },
            days.map((d) => {
              const hr = hoursOn(ex, d);
              const { md, dow } = dateParts(d);
              return h(
                'li',
                { class: `day${dow === '土' ? ' sat' : dow === '日' ? ' sun' : ''}` },
                h('span', { class: 'code day-md' }, md),
                h('span', { class: 'day-dow' }, dow),
                h('span', { class: 'code day-hr' }, hr ? `${hr[0]}–${hr[1]}` : '休み'),
              );
            }),
          ),
        )
      : null,
    ex.notes?.length ? h('ul', { class: 'bullets' }, ex.notes.map((n) => h('li', null, n))) : null,
    ex.access?.length
      ? h('section', null, h('h3', { class: 'sub-h' }, 'アクセス'), h('ul', { class: 'bullets' }, ex.access.map((n) => h('li', null, n))))
      : null,
    h(
      'section',
      null,
      h('h3', { class: 'sub-h' }, '現在地が出ないとき'),
      h(
        'ul',
        { class: 'bullets' },
        h('li', null, 'iPhone: 設定 → プライバシーとセキュリティ → 位置情報サービス → Safari(またはお使いのブラウザ)を「使用中のみ許可」に'),
        h('li', null, 'Android: アドレスバーの鍵アイコン → 権限 → 位置情報を「許可」に'),
        h('li', null, '建物の中や高い建物の間では、位置が数十mずれることがあります'),
      ),
    ),
    site ? h('a', { class: 'btn btn-quiet', href: site, target: '_blank', rel: 'noopener' }, icon('external'), '公式サイト') : null,
    h('p', { class: 'fineprint' }, '地図データ © OpenStreetMap contributors'),
    p?.start ? h('p', { class: 'fineprint' }, `会期 ${formatDateJa(p.start)} 〜 ${formatDateJa(p.end)}`) : null,
  );
}
