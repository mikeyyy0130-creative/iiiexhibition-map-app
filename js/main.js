// アプリ本体:画面の切り替え(URL の # で管理)と各部品のつなぎ込み

import { loadModel, dateParts } from './data.js';
import { createMap } from './map.js';
import { createSheet } from './sheet.js';
import { homeView, buildingView, detourView, workDetail, infoView, updateDistances } from './views.js';
import { createLocator, distance, formatDistance, permissionState } from './geo.js';
import { h, icon, icons } from './dom.js';

const params = new URLSearchParams(location.search);
const checkMode = params.has('check');
const $ = (sel) => document.querySelector(sel);

boot().catch((err) => {
  console.error(err);
  fatal(err.message || String(err));
});

async function boot() {
  if (!window.L) throw new Error('地図ライブラリ(vendor/leaflet)を読み込めませんでした。');

  // 設定ファイルは毎回最新を読む(直前の差し替えをすぐ反映するため)
  let config;
  try {
    config = (await import(`../data/config.js?t=${Date.now()}`)).default;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(
        `data/config.js の書き方に誤りがあります(${e.message})。カンマや ' の閉じ忘れを確認してください。PCで npm run check を実行すると行番号がわかります。`,
      );
    }
    // 通信の失敗なら、キャッシュされた版でもう一度
    try {
      config = (await import('../data/config.js')).default;
    } catch {
      throw new Error('データを読み込めませんでした。電波の良い場所で、ページを再読み込みしてください。');
    }
  }
  const model = await loadModel(config);
  const app = createApp(model);
  app.start();
  if (checkMode) {
    const { runCheck } = await import('./check.js');
    runCheck(model, $('#check'));
  }
}

function fatal(message) {
  const el = $('#fatal');
  el.hidden = false;
  el.replaceChildren(h('div', { class: 'fatal-box' }, icon('warn'), h('p', null, message)));
}

function createApp(model) {
  const ex = model.exhibition;
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icons[el.dataset.icon] || '';

  // ---- 上部バー ----
  document.title = `${ex.title || '展示'} 会場マップ`;
  $('#title').textContent = ex.title || '';
  if (ex.period?.start && ex.period?.end) {
    const a = dateParts(ex.period.start);
    const b = dateParts(ex.period.end);
    $('#period').replaceChildren(
      h('span', { class: 'code' }, a.md),
      h('span', { class: 'dow' }, a.dow),
      h('span', { class: 'sep', 'aria-label': 'から' }, '–'),
      h('span', { class: 'code' }, b.md),
      h('span', { class: 'dow' }, b.dow),
    );
  }

  // ---- 状態 ----
  let current = null; // いま表示中のルート
  let sheetKey = '';
  let floorView = null; // { venue, n } フロア図で表示中の階(会場ごと)
  let userMoved = false; // 来場者が地図を動かしたか
  let firstFix = true;
  let wantCenter = false;
  let warnedAccuracy = false;

  // ---- 部品 ----
  const wide = window.matchMedia('(min-width: 900px)');
  const sheet = createSheet($('#sheet'), {
    onChange: (state, px, changed) => {
      document.documentElement.dataset.sheet = state;
      if (changed && current?.view === 'building') keepBuildingVisible(current.id);
    },
  });
  document.documentElement.dataset.sheet = sheet.state;

  const map = createMap($('#map'), model, {
    // PC の幅ではシートが左側のパネルになるので、下ではなく左を空ける
    getPadding: () =>
      wide.matches
        ? { top: ($('.map-top')?.offsetHeight || 52) + 8, bottom: 0, left: $('#sheet').offsetWidth + 16 }
        : { top: ($('.map-top')?.offsetHeight || 52) + 8, bottom: sheet.visibleHeight },
    onBuilding: (id) => go(`building/${id}`),
    onSpot: (id) => go(`detour/${id}`, { replace: current?.view === 'detour' }),
    onEntrance: (id) => {
      const e = model.entranceById.get(id);
      toast(`入口: ${e.name}`);
    },
  });
  const mapEl = $('#map');
  for (const ev of ['pointerdown', 'wheel']) mapEl.addEventListener(ev, () => (userMoved = true), { passive: true });

  /** 建物と、案内中の会場の入口が地図に見えるように */
  function showBuilding(r) {
    const v = model.venueById.get(r.venue);
    map.focusBuilding(r.id, { zoom: 18, include: v?.entranceObj });
  }
  function keepBuildingVisible(id) {
    const b = model.buildingById.get(id);
    const e = model.venueById.get(current?.venue)?.entranceObj;
    if (b && (!map.isVisible(b) || !map.isVisible(e))) showBuilding(current);
  }

  // ---- 現在地 ----
  const locBtn = $('#locate');
  const setLoc = (s) => {
    locBtn.dataset.state = s;
    locBtn.setAttribute(
      'aria-label',
      { idle: '現在地を表示', searching: '現在地を取得中', active: '現在地を地図の中央に', error: '現在地を再取得' }[s],
    );
  };
  setLoc('idle');
  const locator = createLocator({
    onUpdate(pos) {
      map.setUser(pos);
      setLoc('active');
      updateDistances($('#sheet'), pos);
      const near = nearestBuilding(pos);
      if (wantCenter) {
        wantCenter = false;
        map.centerOnUser();
        if (near && near.d > 3000) toast(`会場まで約${formatDistance(near.d)}あります。経路は「経路」ボタンからGoogleマップで確認できます。`, 6000);
      } else if (firstFix && !userMoved && current?.view === 'home' && !current.overlay && near && near.d < 2000) {
        // 近くにいるなら、現在地と会場が両方見えるように(最初の表示アニメーションに負けないよう即時に)
        map.fitTo([...model.buildings, pos], { anim: false });
      }
      // 「正確な位置情報」がオフだと誤差が数百m〜数km。距離表示が当てにならないことを知らせる
      if (pos.accuracy > 300 && !warnedAccuracy) {
        warnedAccuracy = true;
        toast('現在地の誤差が大きくなっています。端末の設定で「正確な位置情報」をオンにすると改善します。', 7000, {
          label: '設定方法',
          onClick: () => go('info'),
        });
      }
      firstFix = false;
    },
    onError(err) {
      setLoc(err.code === 1 || err.code === 'insecure' || err.code === 'unsupported' ? 'error' : map.userPos ? 'active' : 'error');
      if (wantCenter || firstFix || err.code === 1) {
        toast(err.message, 7000, err.code === 1 ? { label: '設定方法', onClick: () => go('info') } : null);
      }
      wantCenter = false;
    },
  });
  locBtn.addEventListener('click', () => {
    if (map.userPos && locator.active) {
      map.centerOnUser();
      return;
    }
    wantCenter = true;
    setLoc('searching');
    toast('現在地を探しています…', 2500);
    locator.start();
  });

  function nearestBuilding(pos) {
    let best = null;
    for (const b of model.buildings) {
      if (!b.venues.length) continue;
      const d = distance(pos, b);
      if (!best || d < best.d) best = { b, d };
    }
    return best;
  }

  $('#fit').addEventListener('click', () => map.fitAll());

  // ---- 展示/寄り道 切り替え ----
  for (const btn of document.querySelectorAll('[data-mode-btn]')) {
    btn.addEventListener('click', () => {
      const m = btn.dataset.modeBtn;
      if (m === 'detour' && current?.view !== 'detour') go('detour');
      if (m === 'exhibit' && current?.view === 'detour') go('');
    });
  }
  $('#info-btn').addEventListener('click', () => go('info'));

  // ---- 重ね表示(作品詳細・展示情報) ----
  const overlay = $('#overlay');
  const overlayBody = $('#overlay-body');
  let returnFocus = null;
  $('#overlay-close').addEventListener('click', closeOverlay);
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlay();
  });
  function closeOverlay() {
    if (history.state?.app) history.back();
    else go(current?.overlay?.type === 'work' ? `building/${current.id}/works` : '', { replace: true });
  }
  function renderOverlay(ov) {
    const open = !!ov;
    const wasOpen = !overlay.hidden;
    for (const el of [$('.topbar'), $('#map-area'), $('#sheet')]) el.inert = open;
    if (!open) {
      overlay.hidden = true;
      overlayBody.replaceChildren();
      if (wasOpen && returnFocus?.isConnected) returnFocus.focus();
      return;
    }
    if (!wasOpen) returnFocus = document.activeElement;
    if (ov.type === 'work') overlayBody.replaceChildren(workDetail(model, ctx, model.workById.get(ov.id)));
    else overlayBody.replaceChildren(infoView(model));
    overlay.dataset.type = ov.type;
    overlay.hidden = false;
    overlay.scrollTop = 0;
    $('#overlay-close').focus({ preventScroll: true });
  }

  // ---- 画面の切り替え(# 以降で管理。戻るボタンで1つ前に戻れる) ----
  function go(hash, { replace = false } = {}) {
    const url = hash ? `#${hash}` : location.pathname + location.search;
    const same = (location.hash || '#') === (hash ? `#${hash}` : '#');
    if (!same) {
      if (replace) history.replaceState(history.state, '', url);
      else history.pushState({ app: true }, '', url);
    }
    route();
  }

  function parseRoute() {
    let raw = location.hash.replace(/^#\/?/, '');
    try {
      raw = decodeURIComponent(raw);
    } catch {}
    const [k, a, b, c] = raw.split('/');
    if (k === 'building' && model.buildingById.has(a)) {
      const bld = model.buildingById.get(a);
      const has = (id) => bld.venues.some((v) => v.id === id);
      const tab = b === 'works' ? 'works' : 'guide';
      const filter = tab === 'works' && has(c) ? c : null;
      // 会場を指定していなければ、同じ建物で直前に見ていた会場を引き継ぐ
      const keep = current?.view === 'building' && current.id === a ? current.venue : null;
      const venue = tab === 'guide' && has(c) ? c : filter || keep || bld.venues[0]?.id;
      // 来場者が会場を選んだか(作品タブを開いたとき、その会場にしぼるため)
      const chosen = (tab === 'guide' && has(c)) || !!filter || (!!keep && !!current?.venueChosen);
      return { view: 'building', id: a, tab, venue, filter, venueChosen: chosen };
    }
    if (k === 'venue') {
      const v = findVenue(a);
      if (v) return { view: 'building', id: v.building, tab: 'guide', venue: v.id, filter: null, venueChosen: true };
    }
    if (k === 'work' && model.workById.has(a)) {
      const w = model.workById.get(a);
      return {
        view: 'building',
        id: w.venueObj.building,
        tab: 'works',
        venue: w.venue,
        filter: null,
        overlay: { type: 'work', id: a },
      };
    }
    if (k === 'detour') {
      return { view: 'detour', spot: model.detour.spotById.has(a) ? a : null };
    }
    // 展示情報は、いま見ている画面の上に重ねる
    if (k === 'info') return { ...(current && !current.overlay ? current : { view: 'home' }), overlay: { type: 'info' } };
    return { view: 'home' };
  }

  function findVenue(id) {
    if (!id) return null;
    return model.venueById.get(id) || model.venues.find((v) => v.id.toLowerCase() === String(id).toLowerCase()) || null;
  }

  const keyOf = (r) =>
    JSON.stringify([r.view, r.id, r.tab, r.tab === 'guide' ? r.venue : r.filter, floorView && floorView.venue === r.venue ? floorView.n : null]);

  function route() {
    const r = parseRoute();
    const prev = current;
    // 作品詳細を開くときは、下のシートをそのまま残す(スクロール位置を保つ)
    if (r.overlay?.type === 'work' && prev?.view === 'building' && prev.id === r.id && !prev.overlay) {
      Object.assign(r, { tab: prev.tab, filter: prev.filter, venue: prev.venue, venueChosen: prev.venueChosen });
    }
    // 別の会場・画面に移ったら、フロア図で選んでいた階はリセット
    if (prev && (prev.view !== r.view || prev.id !== r.id || prev.venue !== r.venue)) floorView = null;
    current = r;

    // モード
    const mode = r.view === 'detour' ? 'detour' : 'exhibit';
    map.setMode(mode);
    for (const btn of document.querySelectorAll('[data-mode-btn]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.modeBtn === mode));
    }
    document.documentElement.dataset.mode = mode;

    // シート
    const key = keyOf(r);
    const viewChanged = !prev || prev.view !== r.view || prev.id !== r.id;
    if (key !== sheetKey) {
      const keepScroll = prev && prev.view === r.view && prev.id === r.id && prev.tab === r.tab && prev.venue === r.venue;
      renderSheet(r, keepScroll);
      sheetKey = key;
    }

    // 地図とシートの高さ
    if (r.view === 'building') {
      const v = model.venueById.get(r.venue);
      map.setSelectedBuilding(r.id);
      map.showEntrances(r.id, v?.entranceObj?.id);
      map.setSelectedSpot(null);
      if (viewChanged) {
        if (sheet.state === 'peek' || !prev) sheet.setState('half');
        showBuilding(r);
      } else if (prev?.venue !== r.venue && r.tab === 'guide') {
        keepBuildingVisible(r.id);
      }
    } else {
      map.setSelectedBuilding(null);
      map.showEntrances(null);
      if (r.view === 'detour') {
        // 寄り道は地図を広く見せる(一覧は引き上げると読める)。ピンを選んだらカードが見える高さに
        if (r.spot && sheet.state !== 'half') sheet.setState('half');
        else if (viewChanged && !r.spot) sheet.setState('peek');
        if (viewChanged && !r.spot) map.fitAll({ anim: !!prev });
        map.setSelectedSpot(r.spot);
        if (r.spot && (prev?.spot !== r.spot || viewChanged)) {
          const s = model.detour.spotById.get(r.spot);
          map.focusPoint(s, 17);
          const el = document.getElementById(`spot-${r.spot}`);
          for (const li of document.querySelectorAll('.spot.is-selected')) li.classList.remove('is-selected');
          el?.classList.add('is-selected');
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      } else {
        map.setSelectedSpot(null);
        if (viewChanged) {
          if (prev) sheet.setState('peek');
          map.fitAll({ anim: !!prev }); // 最初の表示はアニメーションなし(直後の現在地の調整を邪魔しない)
        }
      }
    }

    renderOverlay(r.overlay);
  }

  function renderSheet(r, keepScroll) {
    const st = { ...r, floor: floorView && floorView.venue === r.venue ? floorView.n : undefined };
    const view = r.view === 'building' ? buildingView(model, ctx, st) : r.view === 'detour' ? detourView(model, ctx, st) : homeView(model, ctx);
    sheet.render(view.head, view.body, { keepScroll });
    $('#sheet').setAttribute('aria-label', r.view === 'building' ? model.buildingById.get(r.id).name : r.view === 'detour' ? '寄り道' : '会場一覧');
    updateDistances($('#sheet'), map.userPos);
  }

  // views から使う操作
  const ctx = {
    checkMode,
    go,
    setFloor(n) {
      floorView = { venue: current.venue, n };
      route();
    },
    showEntrance(id) {
      const e = model.entranceById.get(id);
      if (!e) return;
      sheet.setState('peek');
      map.showEntrances(e.building, id);
      map.focusPoint(e, 18);
    },
  };

  // ---- トースト ----
  let toastTimer;
  function toast(message, ms = 3500, action = null) {
    const el = $('#toast');
    clearTimeout(toastTimer);
    el.replaceChildren(
      h('span', null, message),
      action
        ? h(
            'button',
            {
              type: 'button',
              class: 'toast-action',
              onclick: () => {
                el.hidden = true;
                action.onClick();
              },
            },
            action.label,
          )
        : null,
    );
    el.hidden = false;
    toastTimer = setTimeout(() => (el.hidden = true), ms);
  }

  return {
    start() {
      // QR コード用: ?venue=C でも会場を開けるように
      // ?venue= は URL から外す(再読み込みのたびに同じ会場へ戻されないように)
      const qv = findVenue(params.get('venue'));
      if (params.has('venue')) {
        const p = new URLSearchParams(location.search);
        p.delete('venue');
        const q = p.toString();
        const hash = !location.hash && qv ? `#venue/${qv.id}` : location.hash;
        history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${hash}`);
      }
      window.addEventListener('popstate', route);
      window.addEventListener('hashchange', route);
      route();
      requestAnimationFrame(() => map.invalidate());

      // 位置情報:許可済み or 未確認なら自動で開始(拒否済みならボタンを押したときだけ)
      if (model.map.autoLocate !== false) {
        permissionState().then((s) => {
          if (s !== 'denied') locator.start();
          if (s !== 'denied' && s !== 'granted') setLoc('searching');
        });
      }
    },
  };
}
