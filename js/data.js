// 設定ファイルと作品 CSV を読み込み、アプリで使いやすい形に整える

import { csvToObjects, decodeText } from './csv.js';

/** '2F' → 2, 'B1' → -1, '地下1階' → -1, '9階' → 9 */
export function floorNumber(floor) {
  const f = String(floor ?? '').trim().toUpperCase();
  let m = f.match(/^B(\d+)F?$/) || f.match(/^地下(\d+)階?$/);
  if (m) return -Number(m[1]);
  m = f.match(/^(\d+)(F|階)?$/);
  if (m) return Number(m[1]);
  return NaN;
}

/** 表示用の短い表記: 2 → '2F', -1 → 'B1' */
export function floorCode(n) {
  return n < 0 ? `B${-n}` : `${n}F`;
}

/** 読み上げ・本文用: 2 → '2階', -1 → '地下1階' */
export function floorText(n) {
  return n < 0 ? `地下${-n}階` : `${n}階`;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const hasLatLng = (o) => o && isNum(o.lat) && isNum(o.lng);

export async function loadModel(config) {
  const issues = [];
  const issue = (level, where, message) => issues.push({ level, where, message });

  // ---- 建物・入口 ----
  const buildings = (config.buildings || []).map((b) => ({
    ...b,
    entrances: (b.entrances || []).map((e) => ({ ...e, building: b.id, floorN: floorNumber(e.floor || '1F') })),
    plan: { width: 100, height: 60, north: 0, cores: [], floors: {}, ...(b.plan || {}) },
    venues: [],
  }));
  const buildingById = new Map();
  const entranceById = new Map();
  for (const b of buildings) {
    if (buildingById.has(b.id)) issue('error', `建物 ${b.id}`, 'id が重複しています');
    buildingById.set(b.id, b);
    if (!hasLatLng(b)) issue('error', `建物 ${b.name || b.id}`, 'lat / lng(座標)が数値になっていません');
    for (const e of b.entrances) {
      if (entranceById.has(e.id)) issue('error', `入口 ${e.id}`, 'id が重複しています');
      entranceById.set(e.id, e);
      if (!hasLatLng(e)) issue('warn', `入口 ${e.name || e.id}`, '座標がないため地図に表示されません');
      if (Number.isNaN(e.floorN)) issue('warn', `入口 ${e.name || e.id}`, `floor「${e.floor}」を読めません(例: 1F, B1)`);
    }
  }

  // ---- 会場 ----
  const venues = [];
  const venueById = new Map();
  for (const raw of config.venues || []) {
    const v = { ...raw, id: String(raw.id), floorN: floorNumber(raw.floor), steps: raw.steps || [] };
    const where = `会場 ${v.id}(${v.name || ''})`;
    if (venueById.has(v.id)) {
      issue('error', where, 'id が重複しています');
      continue;
    }
    const b = buildingById.get(v.building);
    if (!b) {
      issue('error', where, `building「${v.building}」という建物がありません`);
      continue;
    }
    if (Number.isNaN(v.floorN)) issue('warn', where, `floor「${v.floor}」を読めません(例: 2F, B1)`);
    if (!/^#[0-9a-f]{3,8}$/i.test(v.color || '')) {
      if (v.color) issue('warn', where, `color「${v.color}」は #RRGGBB 形式にしてください`);
      v.color = '#334155';
    }
    v.entranceObj = entranceById.get(v.entrance) || b.entrances[0] || null;
    if (v.entrance && !entranceById.has(v.entrance)) issue('warn', where, `entrance「${v.entrance}」という入口がありません`);
    v.buildingObj = b;
    b.venues.push(v);
    venues.push(v);
    venueById.set(v.id, v);
  }
  for (const b of buildings) {
    if (!b.venues.length) issue('warn', `建物 ${b.name || b.id}`, 'この建物に会場がありません(地図には表示します)');
    // 経路の目的地: routeTo → 最初の会場の入口 → 最初の入口 → 建物
    const firstEntrance = b.venues[0]?.entranceObj || b.entrances[0];
    b.routeTarget = hasLatLng(b.routeTo) ? b.routeTo : hasLatLng(firstEntrance) ? firstEntrance : b;
  }

  // ---- 作品 ----
  const { rows, source, error: worksError } = await loadWorks(config.works?.sources || ['data/works.csv']);
  if (worksError) issue('error', '作品データ', worksError);
  const pattern = config.works?.imagePattern || '';
  const works = [];
  const workById = new Map();
  const worksByVenue = new Map(venues.map((v) => [v.id, []]));
  rows.forEach((r, i) => {
    const where = `作品 ${r.id || `(${i + 2}行目)`}`;
    if (!r.id && !r.title) return; // 空行
    // venue 列は会場 id(A など)。大文字小文字の違いや、会場名での指定も受け付ける
    const key = (r.venue || '').trim();
    const venueObj =
      venueById.get(key) ||
      venues.find((v) => v.id.toLowerCase() === key.toLowerCase() || (v.name && v.name === key));
    const w = {
      id: r.id || `row-${i + 2}`,
      venue: venueObj ? venueObj.id : key,
      title: r.title || '(タイトル未定)',
      artist: r.artist || '',
      description: r.description || '',
      link: r.link || '',
      image: r.image || (pattern && r.id ? pattern.replaceAll('{id}', r.id) : ''),
      imageExplicit: !!r.image,
      row: i + 2,
    };
    if (!r.id) issue('warn', where, 'id が空です');
    if (!r.title) issue('warn', where, 'title が空です');
    if (workById.has(w.id)) issue('warn', where, 'id が重複しています');
    const list = worksByVenue.get(w.venue);
    if (!list) {
      issue('error', where, `venue「${w.venue}」という会場がありません(表示されません)`);
      return;
    }
    w.venueObj = venueById.get(w.venue);
    list.push(w);
    works.push(w);
    workById.set(w.id, w);
  });

  // ---- 寄り道 ----
  const d = config.detour || {};
  const categories = (d.categories || []).map((c) => ({ ...c, spots: [] }));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const spots = [];
  const spotById = new Map();
  for (const s of d.spots || []) {
    const where = `寄り道 ${s.name || s.id}`;
    const c = catById.get(s.category);
    if (!c) {
      issue('warn', where, `category「${s.category}」がありません`);
      continue;
    }
    if (!hasLatLng(s)) {
      issue('error', where, '座標がありません');
      continue;
    }
    const spot = { ...s, categoryObj: c };
    c.spots.push(spot);
    spots.push(spot);
    spotById.set(s.id, spot);
  }
  for (const c of categories) {
    if (c.spots.length > 3) issue('warn', `寄り道 ${c.name}`, `${c.spots.length}件あります。推しを2〜3件に絞るのがおすすめです`);
  }
  const detourFrom = buildingById.get(d.from) || buildings[0];

  return {
    config,
    exhibition: config.exhibition || {},
    map: config.map || {},
    buildings,
    buildingById,
    entranceById,
    venues,
    venueById,
    works,
    workById,
    worksByVenue,
    worksSource: source,
    worksError,
    detour: { intro: d.intro || '', from: detourFrom, categories, spots, spotById },
    issues,
  };
}

async function loadWorks(sources) {
  const errors = [];
  for (const src of sources) {
    try {
      const res = await fetch(src, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = decodeText(await res.arrayBuffer());
      const rows = csvToObjects(text);
      if (!rows.length) throw new Error('データが0件です');
      return { rows, source: src };
    } catch (e) {
      errors.push(`${src}: ${e.message}`);
    }
  }
  return { rows: [], source: null, error: `作品データを読み込めませんでした(${errors.join(' / ')})` };
}

// ---------------------------------------------------------------------------
// 会期・開場時間
// ---------------------------------------------------------------------------

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** '2026-11-12' → '11月12日(木)' */
export function formatDateJa(s) {
  const { m, d, dow } = parseYmd(s);
  return `${m}月${d}日(${WEEK[dow]})`;
}

/** '2026-11-12' → { md: '11.12', dow: '木' } */
export function dateParts(s) {
  const { m, d, dow } = parseYmd(s);
  return { md: `${m}.${d}`, dow: WEEK[dow] };
}

function addDays(ymd, n) {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 日本時間の「いま」を 'YYYY-MM-DD' と 'HH:MM' で */
export function nowInTokyo(date = new Date()) {
  const s = date.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour12: false });
  return { ymd: s.slice(0, 10), hm: s.slice(11, 16) };
}

export function hoursOn(ex, ymd) {
  const h = ex.hours || {};
  return h[ymd] || h.default || null;
}

/**
 * 会期の状態。{ state, label, detail }
 * state: before / open / before-open / after-close / ended / unknown
 */
export function exhibitionStatus(ex, date = new Date()) {
  const p = ex.period;
  if (!p?.start || !p?.end) return { state: 'unknown', label: '', detail: '' };
  const { ymd, hm } = nowInTokyo(date);
  if (ymd < p.start) {
    return { state: 'before', label: '会期前', detail: `${formatDateJa(p.start)}から` };
  }
  if (ymd > p.end) return { state: 'ended', label: '会期終了', detail: 'ご来場ありがとうございました' };
  const hrs = hoursOn(ex, ymd);
  if (!hrs) return { state: 'open', label: '開催中', detail: '' };
  const [open, close] = hrs;
  if (hm < open) return { state: 'before-open', label: '本日開催', detail: `${open} 開場` };
  if (hm < close) return { state: 'open', label: '開催中', detail: `本日 ${close} まで` };
  if (ymd === p.end) return { state: 'ended', label: '会期終了', detail: 'ご来場ありがとうございました' };
  const next = hoursOn(ex, addDays(ymd, 1));
  return { state: 'after-close', label: '本日は終了', detail: next ? `明日 ${next[0]} 開場` : '' };
}
