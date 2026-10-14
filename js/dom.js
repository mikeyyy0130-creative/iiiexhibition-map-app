// 小さな DOM ヘルパー。データ由来の文字列は必ず textContent で入れる(HTML として解釈しない)

/**
 * h('div', { class: 'x', onclick: fn }, child, 'text', [more])
 * attrs の値: class / style(文字列) / on* (関数) / dataset(オブジェクト) / html(信頼できる固定文字列のみ)
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') {
        for (const [dk, dv] of Object.entries(v)) if (dv != null) el.dataset[dk] = dv;
      }
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** http(s) のリンクだけ通す */
export function safeUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const u = new URL(url, location.href);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

// アイコン(固定の SVG 文字列)
const I = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" ${extra}>${d}</svg>`;
export const icons = {
  locate: I('<circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  fit: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  info: I('<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1.4" fill="currentColor"/>'),
  close: I('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  back: I('<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  route: I('<path d="M6 19a2.5 2.5 0 1 0 0-.01M18 5a2.5 2.5 0 1 0 0-.01" fill="currentColor" stroke="currentColor" stroke-width="2"/><path d="M8.5 18.5h6a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  pin: I('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.5" r="2.5" fill="currentColor"/>'),
  door: I('<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M3 21h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="14.5" cy="12.5" r="1.3" fill="currentColor"/>'),
  external: I('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  food: I('<path d="M7 3v8M4.5 3v5.5A2.5 2.5 0 0 0 7 11a2.5 2.5 0 0 0 2.5-2.5V3M7 11v10M16.5 21V3c-2.2 1.2-3.5 3.6-3.5 7v4h3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  cafe: I('<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM17 10.5h1.5a2.5 2.5 0 0 1 0 5H17M8 2.5c-.8 1 .8 2 0 3.5M12 2.5c-.8 1 .8 2 0 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  walk: I('<circle cx="13.5" cy="4" r="2" fill="currentColor"/><path d="M9 22l3-7 3 3v4M7.5 12.5l2-4.5 4-1 3 4 2.5 1M11 8l1.5 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  image: I('<rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="10" r="1.6" fill="currentColor"/><path d="M4 17l5-5 4 4 2.5-2.5L20 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
  warn: I('<path d="M12 3l10 18H2L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.2" fill="currentColor"/>'),
};

export function icon(name, cls = 'icon') {
  return h('span', { class: cls, html: icons[name] || '' });
}
