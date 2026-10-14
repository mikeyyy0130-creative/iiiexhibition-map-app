// CSV の読み込み(RFC 4180 準拠: "…" 内のカンマ・改行・"" エスケープに対応)

/** CSV テキストを行(文字列配列)の配列にする */
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // 完全な空行は捨てる
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

// 見出しの別名(日本語の見出しでも読めるように)
const HEADER_ALIASES = {
  id: ['id', 'ID', '作品ID', '番号', 'No', 'no'],
  venue: ['venue', '会場', '会場ID'],
  title: ['title', 'タイトル', '作品名'],
  artist: ['artist', '作者', '作者名', '制作者'],
  description: ['description', '説明', '解説', '作品説明'],
  image: ['image', '画像', '画像パス', '写真'],
  link: ['link', 'url', 'URL', 'リンク'],
};

function normalizeHeader(h) {
  const key = h.trim();
  for (const [name, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === key.toLowerCase())) return name;
  }
  return key;
}

/** CSV テキスト → オブジェクト配列(1行目を見出しとして使う) */
export function csvToObjects(text) {
  const [header, ...rows] = parseCSV(text);
  if (!header) return [];
  const keys = header.map(normalizeHeader);
  return rows.map((r) => {
    const o = {};
    keys.forEach((k, i) => {
      o[k] = (r[i] ?? '').trim();
    });
    return o;
  });
}

/** バイト列を文字列に。UTF-8 で読めなければ Shift_JIS(Excel の「CSV」保存)として読む */
export function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('shift_jis').decode(buffer);
  }
}
