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
  function visibleOffset() {
    const { top, bottom } = getPadding();
    const H = map.getSize().y;
    const visibleCenterY = top + (H - top - bottom) / 2;
    return H / 2 - visibleCenterY;
  }

  function panToVisible(latlng, zoom) {
    const z = zoom ?? map.getZoom();
    const p = map.project(latlng, z).add([0, visibleOffset()]);
    map.setView(map.unproject(p, z), z, { animate: animate() });
  }

  function fitTo(points, maxZoom = 18) {
    const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (!valid.length) return;
    const { top, bottom } = getPadding();
    const bounds = L.latLngBounds(valid.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, {
      paddingTopLeft: [40, top + 70],
      paddingBottomRight: [40, bottom + 24],
      maxZoom,
      animate: animate(),
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
    },
    fitAll() {
      const pts = [...model.buildings];
      if (mode === 'detour') {
        pts.push(...model.detour.spots);
        for (const s of model.detour.spots) for (const [lat, lng] of s.path || []) pts.push({ lat, lng });
      }
      fitTo(pts);
    },
    focusBuilding(id, { zoom } = {}) {
      const b = model.buildingById.get(id);
      if (!b) return;
      panToVisible([b.lat, b.lng], Math.max(map.getZoom(), zoom ?? 17));
    },
    focusPoint(p, zoom) {
      panToVisible([p.lat, p.lng], Math.max(map.getZoom(), zoom ?? 17));
    },
    setSelectedBuilding(id) {
      for (const [bid, m] of buildingMarkers) m.getElement()?.classList.toggle('is-selected', bid === id);
    },
    showEntrances,
    setSelectedSpot(id) {
      for (const [sid, m] of spotMarkers) {
        const on = sid === id;
        m.getElement()?.classList.toggle('is-selected', on);
        m.setZIndexOffset(on ? 500 : 0);
      }
    },
    setUser,
    get userPos() {
      return userPos;
    },
    centerOnUser() {
      if (userPos) panToVisible([userPos.lat, userPos.lng], Math.max(map.getZoom(), 17));
    },
    invalidate() {
      map.invalidateSize({ animate: false });
    },
  };
}
