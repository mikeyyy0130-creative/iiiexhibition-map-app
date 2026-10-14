// 距離計算・Googleマップ連携・現在地の取得

/** 2点間の距離(m) */
export function distance(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// 直線距離 → 徒歩の目安。道は直線より長いので 1.3 倍、80m/分 で計算
const DETOUR = 1.3;
const WALK_M_PER_MIN = 80;
export function walkMinutes(meters) {
  return Math.max(1, Math.round((meters * DETOUR) / WALK_M_PER_MIN));
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** 「徒歩5分」「1.2km」など。遠い場合は徒歩を出さない */
export function describeDistance(meters) {
  if (meters > 3000) return `${formatDistance(meters)}`;
  return `徒歩${walkMinutes(meters)}分`;
}

/** Googleマップの徒歩経路 URL(アプリがあればアプリで開く) */
export function googleRouteUrl({ lat, lng }) {
  const p = new URLSearchParams({ api: '1', destination: `${lat},${lng}`, travelmode: 'walking' });
  return `https://www.google.com/maps/dir/?${p}`;
}

/** Googleマップで場所を表示する URL */
export function googleSearchUrl({ lat, lng }) {
  const p = new URLSearchParams({ api: '1', query: `${lat},${lng}` });
  return `https://www.google.com/maps/search/?${p}`;
}

/**
 * 現在地の監視。onUpdate({lat,lng,accuracy}) / onError({code,message})
 * 戻り値の start() / stop() で制御
 */
export function createLocator({ onUpdate, onError }) {
  let watchId = null;
  return {
    get active() {
      return watchId !== null;
    },
    start() {
      if (watchId !== null) return;
      if (!('geolocation' in navigator)) {
        onError({ code: 'unsupported', message: 'この端末・ブラウザは位置情報に対応していません。' });
        return;
      }
      if (!window.isSecureContext) {
        onError({ code: 'insecure', message: '位置情報は https:// のページでのみ使えます。' });
        return;
      }
      watchId = navigator.geolocation.watchPosition(
        (pos) =>
          onUpdate({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          }),
        (err) => {
          const messages = {
            1: '位置情報の利用が許可されていません。ブラウザの設定で、このサイトの位置情報を「許可」にしてください。',
            2: '現在地を取得できませんでした。電波の届く屋外で、もう一度お試しください。',
            3: '現在地の取得に時間がかかっています。屋外で、もう一度お試しください。',
          };
          if (err.code === 1) this.stop(); // 拒否されたら監視をやめる(再タップで再要求)
          onError({ code: err.code, message: messages[err.code] || err.message });
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
    },
    stop() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    },
  };
}

/** 位置情報の許可状態('granted' | 'prompt' | 'denied' | 'unknown') */
export async function permissionState() {
  try {
    const r = await navigator.permissions.query({ name: 'geolocation' });
    return r.state;
  } catch {
    return 'unknown';
  }
}
