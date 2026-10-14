// CSV の読み込み(RFC 4180 準拠: "…" 内のカンマ・改行・"" エスケープに対応)

/**
 * CSV テキストを行(文字列配列)の配列にする。
 * 戻り値の配列には warnings(文字列配列)と lines(各行の開始行番号)が付く
 */
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const rows = [];
  const lines = [];
  const warnings = [];
  let row = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  let line = 1;
  let rowLine = 1;
  let quoteLine = 0;
  const endField = () => {
    row.push(field);
    field = '';
    wasQuoted = false;
  };
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
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === '"' && field === '' && !wasQuoted) {
      // 欄の先頭の " だけを囲みとして扱う(文中の " はそのまま文字)
      quoted = true;
      wasQuoted = true;
      quoteLine = line;
    } else if (c === ',') {
      endField();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endField();
      rows.push(row);
      lines.push(rowLine);
      row = [];
      line++;
      rowLine = line;
    } else {
      field += c;
    }
  }
  if (quoted) warnings.push(`${quoteLine}行目の " が閉じていません(以降の行が1つの欄として読まれています)`);
  if (field !== '' || row.length || wasQuoted) {
    endField();
    rows.push(row);
    lines.push(rowLine);
  }
  // 完全な空行は捨てる
  const out = [];
  out.lines = [];
  rows.forEach((r, i) => {
    if (r.some((v) => v.trim() !== '')) {
      out.push(r);
      out.lines.push(lines[i]);
    }
  });
  out.warnings = warnings;
  return out;
}

// 見出しの別名(日本語の見出しでも読めるように)
const HEADER_ALIASES = {
  id: ['id', '作品ID', '作品番号', '番号', 'No', 'No.'],
  venue: ['venue', '会場', '会場ID', '会場名'],
  title: ['title', 'タイトル', '作品名', '作品タイトル'],
  artist: ['artist', '作者', '作者名', '作家', '制作者'],
  description: ['description', '説明', '解説', '作品説明'],
  image: ['image', '画像', '画像パス', '写真'],
  link: ['link', 'url', 'リンク'],
};

const norm = (s) => String(s).normalize('NFKC').trim().toLowerCase();

function normalizeHeader(h) {
  const key = norm(h);
  for (const [name, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((a) => norm(a) === key)) return name;
  }
  return h.trim();
}

/**
 * CSV テキスト → オブジェクト配列(1行目を見出しとして使う)
 * 戻り値には warnings / headers が付き、各行には _line(CSV上の行番号)が入る
 */
export function csvToObjects(text) {
  const parsed = parseCSV(text);
  const [header, ...rows] = parsed;
  const out = [];
  out.warnings = [...parsed.warnings];
  out.headers = header ? header.map(normalizeHeader) : [];
  if (!header) return out;
  const keys = out.headers;
  rows.forEach((r, i) => {
    const line = parsed.lines[i + 1];
    const extra = r.slice(keys.length).filter((v) => v.trim() !== '');
    if (extra.length) {
      out.warnings.push(`${line}行目: 見出しより列が多くなっています。カンマ(,)を含む文は "…" で囲んでください`);
    }
    const o = { _line: line };
    keys.forEach((k, j) => {
      o[k] = (r[j] ?? '').trim();
    });
    out.push(o);
  });
  return out;
}

/** バイト列を文字列に。UTF-8 で読めなければ Shift_JIS(Excel の「CSV」保存)として読む */
export function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('shift_jis').decode(buffer);
  }
}
