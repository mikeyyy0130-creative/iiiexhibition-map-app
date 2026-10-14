// 地図(Leaflet + OpenStreetMap)。ピン・現在地・寄り道レイヤーを管理

import { icons } from './dom.js';

const L = window.L;
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const animate = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param el 地図を描く要素
 * @param model loadModel() の戻り値
 * @param opts.getPadding () => ({ top, bottom }) 地図の上下でシート等に隠れている高さ(px)
 * @param opts.onBuilding(id) / opts.onSpot(id) / opts.onEntrance(id)
 */
export function createMap(el, model, { getPadding, onBuilding, onSpot, onEntrance }) {
  const cfg = model.map;
  // 指が少し動いただけでピンのタップがドラッグ扱いになるのを防ぐ(既定 3px は iOS で厳しすぎる)
  L.Draggable.mergeOptions({ clickTolerance: 10 });
  const map = L.map(el, {
    center: cfg.center || [35.7132, 139.7612],
    zoom: cfg.zoom || 17,
    maxZoom: cfg.maxZoom || 19,
    zoomControl: false,
    attributionControl: false,
  });
  // 帰属表示はシートに隠れないよう左下(シートの上端に追従)に置く
  L.control.attribution({ position: 'bottomleft', prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(map);
  L.tileLayer(cfg.tileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: cfg.maxZoom || 19,
    attribution: cfg.attribution || '&copy; OpenStreetMap contributors',
  }).addTo(map);

  // ---- 展示会場(建物ピン):大きな看板型 ----
  const buildingMarkers = new Map();
  const exhibitLayer = L.layerGroup().addTo(map);
  for (const b of model.buildings) {
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) continue;
    const badges = b.venues
      .map((v) => `<b class="badge" style="--c:${esc(v.color)}">${esc(v.id)}</b>`)
      .join('');
    const label = `${b.name}(会場 ${b.venues.map((v) => `${v.id} ${v.name}`).join('、')})`;
    // 会場が1つだけの建物は会場名を大きく、建物名を小さく
    const names =
      b.venues.length === 1
        ? `<span class="bpin-name">${esc(b.venues[0].name)}</span><span class="bpin-sub">${esc(b.name)}</span>`
        : `<span class="bpin-name">${esc(b.name)}</span>`;
    const m = L.marker([b.lat, b.lng], {
      icon: L.divIcon({
        className: 'bpin-wrap',
        html: `<div class="bpin"><div class="bpin-card"><span class="bpin-badges">${badges}</span><span class="bpin-text">${names}</span></div><div class="bpin-stem"></div></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      title: label,
      alt: label,
      riseOnHover: true,
      zIndexOffset: 1000,
      keyboard: true,
    });
    m.on('click', () => onBuilding(b.id));
    m.on('keypress', (e) => e.originalEvent.key === 'Enter' && onBuilding(b.id));
    m.addTo(exhibitLayer);
    buildingMarkers.set(b.id, m);
  }

  // ---- 入口(建物を選んだときだけ表示) ----
  const entranceLayer = L.layerGroup().addTo(map);
  function showEntrances(buildingId, highlightId) {
    entranceLayer.clearLayers();
    const b = model.buildingById.get(buildingId);
    if (!b) return;
    for (const e of b.entrances) {
      if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) continue;
      const on = e.id === highlightId;
      L.marker([e.lat, e.lng], {
        icon: L.divIcon({
          className: 'epin-wrap',
          html: `<div class="epin${on ? ' is-on' : ''}"><span class="epin-dot">${icons.door}</span>${on ? `<span class="epin-label">${esc(e.name)}</span>` : ''}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        title: `入口: ${e.name}`,
        alt: `入口: ${e.name}`,
        zIndexOffset: on ? 900 : 800,
        keyboard: true,
      })
        .on('click', () => onEntrance?.(e.id))
        .addTo(entranceLayer);
    }
  }

  // ---- 寄り道(小さな丸ピン+散歩ロード) ----
  const detourLayer = L.layerGroup();
  const spotMarkers = new Map();
  for (const s of model.detour.spots) {
    if (Array.isArray(s.path) && s.path.length > 1) {
      L.polyline(s.path, { className: 'walk-line', weight: 5, interactive: false }).addTo(detourLayer);
    }
    const m = L.marker([s.lat, s.lng], {
      icon: L.divIcon({
        className: 'spin-wrap',
        html: `<div class="spin" data-cat="${esc(s.category)}"><span class="spin-dot">${icons[s.categoryObj.icon] || icons.pin}</span><span class="spin-label">${esc(s.name)}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      title: `${s.categoryObj.name}: ${s.name}`,
      alt: `${s.categoryObj.name}: ${s.name}`,
      zIndexOffset: 0,
      keyboard: true,
    });
    m.on('click', () => onSpot(s.id));
    m.on('keypress', (e) => e.originalEvent.key === 'Enter' && onSpot(s.id));
    m.addTo(detourLayer);
    spotMarkers.set(s.id, m);
  }

  // ---- 現在地 ----
  let userMarker = null;
  let accuracyCircle = null;
  let userPos = null;
  function setUser(pos) {
    userPos = pos;
    const ll = [pos.lat, pos.lng];
    if (!userMarker) {
      accuracyCircle = L.circle(ll, { radius: pos.accuracy, className: 'accuracy', interactive: false }).addTo(map);
      userMarker = L.marker(ll, {
        icon: L.divIcon({ className: 'upin-wrap', html: '<div class="upin"></div>', iconSize: [0, 0], iconAnchor: [0, 0] }),
        title: '現在地',
        alt: '現在地',
        interactive: false,
        zIndexOffset: 2000,
        keyboard: false,
      }).addTo(map);
    } else {
      userMarker.setLatLng(ll);
      accuracyCircle.setLatLng(ll).setRadius(pos.accuracy);
    }
    el.classList.toggle('low-accuracy', pos.accuracy > 60);
  }

  // ---- 表示位置の制御(シートに隠れない範囲で中央に) ----
  /** シート等に隠れる上下左右の余白。縦が短い画面でも地図が最低 minFree px は残るよう縮める */
  function paddings(extraTop = 0, extraBottom = 0, minFree = 120) {
    const { top, bottom, left = 0 } = getPadding();
    const H = map.getSize().y;
    let t = top + extraTop;
    let b = bottom + extraBottom;
    // 縦が短い画面では余白を削って地図の見える範囲を確保する。
    // ただしシートに隠れる分(bottom)は削らない(削るとピンや現在地がシートの下に入ってしまう)
    let over = t + b - (H - minFree);
    if (over > 0) {
      const cutB = Math.min(over, extraBottom);
      b -= cutB;
      over -= cutB;
      t -= Math.min(over, t - Math.min(top, 16));
    }
    return { t: Math.max(0, t), b, l: left };
  }

  function visibleOffset() {
    const { t, b, l } = paddings(0, 0, 60);
    const { x: W, y: H } = map.getSize();
    return L.point(W / 2 - (l + (W - l) / 2), H / 2 - (t + (H - t - b) / 2));
  }

  function panToVisible(latlng, zoom, anim = animate()) {
    const z = zoom ?? map.getZoom();
    const p = map.project(latlng, z).add(visibleOffset());
    map.setView(map.unproject(p, z), z, { animate: anim });
  }

  function fitTo(points, { maxZoom = 18, anim = animate(), extraBottom = 24 } = {}) {
    const valid = points.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (!valid.length) return;
    const { t, b, l } = paddings(70, extraBottom);
    const bounds = L.latLngBounds(valid.map((p) => [p.lat, p.lng]));
    map.stop(); // 進行中のズームアニメーションに上書きされないように
    map.fitBounds(bounds, {
      paddingTopLeft: [40 + l, t],
      paddingBottomRight: [40, b],
      maxZoom,
      animate: anim,
    });
  }

  let mode = 'exhibit';
  return {
    map,
    setMode(next) {
      mode = next;
      if (mode === 'detour') detourLayer.addTo(map);
      else detourLayer.remove();
      el.dataset.mode = mode;
      // 寄り道モードでは小さな寄り道ピンを建物の看板より手前に(看板の下に隠れてタップできなくなるのを防ぐ)
      for (const m of spotMarkers.values()) m.setZIndexOffset(mode === 'detour' ? 1100 : 0);
    },
    fitAll({ anim = animate() } = {}) {
      const pts = [...model.buildings];
      if (mode === 'detour') {
        pts.push(...model.detour.spots);
        for (const s of model.detour.spots) for (const [lat, lng] of s.path || []) pts.push({ lat, lng });
      }
      fitTo(pts, { anim });
    },
    /** 任意の地点が全部見えるように(現在地+会場など) */
    fitTo,
    /** 建物を表示。include(使う入口など)があれば一緒に収める */
    focusBuilding(id, { zoom, include } = {}) {
      const b = model.buildingById.get(id);
      if (!b) return;
      if (include && Number.isFinite(include.lat)) {
        fitTo([b, include], { maxZoom: Math.max(map.getZoom(), zoom ?? 17), extraBottom: 56 });
      } else {
        panToVisible([b.lat, b.lng], Math.max(map.getZoom(), zoom ?? 17));
      }
    },
    focusPoint(p, zoom) {
      panToVisible([p.lat, p.lng], Math.max(map.getZoom(), zoom ?? 17));
    },
    /** 点が地図の見えている範囲(シートの外)にあるか */
    isVisible(p, margin = 30) {
      if (!p || !Number.isFinite(p.lat)) return true;
      const { t, b, l } = paddings(0, 0, 60);
      const pt = map.latLngToContainerPoint([p.lat, p.lng]);
      const { x: W, y: H } = map.getSize();
      return pt.x > l + margin && pt.x < W - margin && pt.y > t + margin && pt.y < H - b - margin;
    },
    setSelectedBuilding(id) {
      for (const [bid, m] of buildingMarkers) m.getElement()?.classList.toggle('is-selected', bid === id);
    },
    showEntrances,
    setSelectedSpot(id) {
      for (const [sid, m] of spotMarkers) {
        const on = sid === id;
        m.getElement()?.classList.toggle('is-selected', on);
        m.setZIndexOffset(on ? 1500 : mode === 'detour' ? 1100 : 0);
      }
    },
    setUser,
    get userPos() {
      return userPos;
    },
    centerOnUser() {
      if (userPos) panToVisible([userPos.lat, userPos.lng], Math.max(map.getZoom(), 17));
    },
    stop() {
      map.stop();
    },
    invalidate() {
      map.invalidateSize({ animate: false });
    },
  };
}
