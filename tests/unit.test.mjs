import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, csvToObjects, decodeText } from '../js/csv.js';
import { floorNumber, floorCode, floorText, exhibitionStatus, loadModel } from '../js/data.js';
import { distance, walkMinutes, googleRouteUrl } from '../js/geo.js';

test('CSV: 引用符・カンマ・改行・"" エスケープ・CRLF・BOM', () => {
  const text = '﻿id,title\r\nA-01,"ゆらぎ, の温度"\r\nA-02,"1行目\n2行目"\r\nA-03,"彼は""こんにちは""と言った"\r\n\r\n';
  assert.deepEqual([...parseCSV(text)], [
    ['id', 'title'],
    ['A-01', 'ゆらぎ, の温度'],
    ['A-02', '1行目\n2行目'],
    ['A-03', '彼は"こんにちは"と言った'],
  ]);
});

test('CSV: 最終行に改行がなくても読める / 空欄', () => {
  assert.deepEqual([...parseCSV('a,b,c\n1,,3')], [['a', 'b', 'c'], ['1', '', '3']]);
});

test('CSV: 日本語の見出しも使える', () => {
  const rows = csvToObjects('作品ID,会場,タイトル,作者,説明,画像\nB-01,B,題,名前,説明文,img.jpg');
  assert.deepEqual(rows[0], { _line: 2, id: 'B-01', venue: 'B', title: '題', artist: '名前', description: '説明文', image: 'img.jpg' });
});

test('CSV: 文中の " はそのまま文字。閉じていない " や列の過不足は警告', () => {
  const ok = csvToObjects('id,title\nA-01,7" のモニター\nA-02,次の作品');
  assert.deepEqual(ok.map((r) => r.title), ['7" のモニター', '次の作品']);
  assert.deepEqual(ok.warnings, []);
  const open = csvToObjects('id,title\nA-01,"閉じ忘れ\nA-02,消える');
  assert.match(open.warnings.join(), /2行目の " が閉じていません/);
  const extra = csvToObjects('id,venue,title\nA-01,A,こんにちは,世界');
  assert.match(extra.warnings.join(), /2行目: 見出しより列が多く/);
});

test('文字コード: UTF-8 と Shift_JIS(Excel 保存)を自動判別', () => {
  const utf8 = new TextEncoder().encode('タイトル');
  assert.equal(decodeText(utf8), 'タイトル');
  // 「タイトル」の Shift_JIS
  const sjis = new Uint8Array([0x83, 0x5e, 0x83, 0x43, 0x83, 0x67, 0x83, 0x8b]);
  assert.equal(decodeText(sjis), 'タイトル');
});

test('階の表記', () => {
  assert.equal(floorNumber('2F'), 2);
  assert.equal(floorNumber('9f'), 9);
  assert.equal(floorNumber('B1'), -1);
  assert.equal(floorNumber('B2F'), -2);
  assert.equal(floorNumber('地下1階'), -1);
  assert.equal(floorNumber('3階'), 3);
  assert.ok(Number.isNaN(floorNumber('屋上')));
  assert.equal(floorCode(-1), 'B1');
  assert.equal(floorText(9), '9階');
});

test('会期の状態(日本時間で判定)', () => {
  const ex = { period: { start: '2026-11-12', end: '2026-11-16' }, hours: { default: ['10:00', '19:00'], '2026-11-16': ['10:00', '17:00'] } };
  const at = (iso) => exhibitionStatus(ex, new Date(iso));
  assert.equal(at('2026-10-14T12:00:00+09:00').state, 'before');
  assert.equal(at('2026-11-12T09:30:00+09:00').state, 'before-open');
  assert.equal(at('2026-11-12T10:00:00+09:00').state, 'open');
  assert.equal(at('2026-11-12T19:30:00+09:00').state, 'after-close');
  assert.equal(at('2026-11-16T16:59:00+09:00').state, 'open');
  assert.equal(at('2026-11-16T17:00:00+09:00').state, 'ended');
  assert.equal(at('2026-11-17T12:00:00+09:00').state, 'ended');
  // UTC では前日でも、日本時間で会期初日なら開催中
  assert.equal(at('2026-11-12T01:30:00Z').state, 'open');
});

test('開場時間は 9:30 のような書き方でも判定できる', () => {
  const ex = { period: { start: '2026-11-12', end: '2026-11-16' }, hours: { default: ['9:30', '19:00'] } };
  assert.equal(exhibitionStatus(ex, new Date('2026-11-13T12:00:00+09:00')).state, 'open');
});

test('距離と徒歩分数', () => {
  const d = distance({ lat: 35.7144, lng: 139.7622 }, { lat: 35.7117, lng: 139.7599 });
  assert.ok(d > 300 && d < 400, `distance=${d}`);
  assert.equal(walkMinutes(80 / 1.3), 1);
  assert.match(googleRouteUrl({ lat: 1.5, lng: 2.5 }), /destination=1\.5%2C2\.5&travelmode=walking/);
});

function withFetch(files, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (src) => (src in files ? new Response(files[src]) : new Response('', { status: 404 }));
  return fn().finally(() => (globalThis.fetch = orig));
}

test('データ読み込み: 不正な参照を issues に出す', () =>
  withFetch({ 'w.csv': 'id,venue,title\nA-01,A,t1\nX-01,X,t2\nb-01,b,t3\nN-01,展示,t4' }, async () => {
    const model = await loadModel({
      buildings: [{ id: 'b1', name: '建物', lat: 35, lng: 139, entrances: [{ id: 'e1', name: '入口', lat: 35, lng: 139 }] }],
      venues: [
        { id: 'A', name: 'a', building: 'b1', floor: '2F', entrance: 'e1', color: '#123456' },
        { id: 'B', name: '展示', building: 'b1', floor: '3F', entrance: 'nope', color: 'red' },
        { id: 'C', name: 'c', building: 'nope', floor: '1F' },
      ],
      works: { sources: ['missing.csv', 'w.csv'] },
      detour: { categories: [{ id: 'food', name: 'ご飯' }], spots: [{ id: 's', category: 'cafe', lat: 1, lng: 1 }] },
    });
    assert.equal(model.worksSource, 'w.csv', '読めない読み込み先は飛ばして次を使う');
    assert.deepEqual(model.works.map((w) => [w.id, w.venue]), [['A-01', 'A'], ['b-01', 'B'], ['N-01', 'B']]);
    const msgs = model.issues.map((i) => `${i.level}:${i.where}:${i.message}`).join('\n');
    assert.match(msgs, /error:会場 C.*building「nope」/);
    assert.match(msgs, /warn:会場 B.*entrance「nope」/);
    assert.match(msgs, /warn:会場 B.*color/);
    assert.match(msgs, /error:作品 X-01.*venue「X」/);
    assert.match(msgs, /warn:寄り道.*category「cafe」/);
    assert.equal(model.venueById.get('B').entranceObj.id, 'e1', '入口が見つからなければ建物の最初の入口');
  }));

test('同梱の data/config.js と data/works.csv にエラーがない', async () => {
  const { readFile } = await import('node:fs/promises');
  const config = (await import('../data/config.js')).default;
  const csv = await readFile(new URL('../data/works.csv', import.meta.url));
  await withFetch({ 'data/works.csv': csv }, async () => {
    const model = await loadModel(config);
    const errors = model.issues.filter((i) => i.level === 'error');
    assert.deepEqual(errors, []);
    assert.ok(model.works.length >= 30);
    assert.equal(model.venues.length, 4);
  });
});

test('データ読み込み: 重複ID・数値ID・他の建物の入口・遠すぎる座標・階キー・リンク', () =>
  withFetch({ 'w.csv': 'id,venue,title,link\nA-01,A,一つ目,example.com/a\nA-01,Ａ,二つ目,' }, async () => {
    const model = await loadModel({
      buildings: [
        { id: 1, name: '建物1', lat: 35.71, lng: 139.76, entrances: [{ id: 'e1', name: '入口1', lat: 35.71, lng: 139.76 }], plan: { floors: { '2階': { image: 'x.png' } } } },
        { id: 'b2', name: '建物2', lat: 139.76, lng: 35.71, entrances: [{ id: 'e2', name: '入口2', lat: 35.71, lng: 139.76 }] },
      ],
      venues: [{ id: 'A', name: 'a', building: 1, floor: '2F', entrance: 'e2' }],
      works: { sources: ['w.csv'] },
    });
    const msgs = model.issues.map((i) => `${i.level}:${i.where}:${i.message}`).join('\n');
    assert.ok(model.buildingById.has('1'), '数値の id も文字列として扱う');
    assert.match(msgs, /error:会場 A.*e2」は建物1の入口ではありません/);
    assert.equal(model.venueById.get('A').entranceObj.id, 'e1');
    assert.match(msgs, /error:作品 A-01.*重複/);
    assert.equal(model.works.length, 2);
    assert.equal(new Set(model.works.map((w) => w.id)).size, 2, '重複してもカードと詳細が食い違わない');
    assert.equal(model.works[1].venue, 'A', '全角の Ａ も A として扱う');
    assert.equal(model.works[0].link, 'https://example.com/a');
    assert.match(msgs, /warn:建物 建物2.*km離れています/);
    assert.ok(model.buildingById.get('1').plan.floors['2F'], "'2階' は '2F' にそろえる");
  }));

test('データ読み込み: 見出しが違う CSV や、読めない読み込み先を知らせる', () =>
  withFetch({ 'bad.csv': 'No,作品の名前\n1,x', 'html.csv': '<!DOCTYPE html><html></html>', 'ok.csv': 'id,venue,title\nA-01,A,t' }, async () => {
    const cfg = (sources) => ({
      buildings: [{ id: 'b', name: 'b', lat: 35, lng: 139 }],
      venues: [{ id: 'A', name: 'a', building: 'b', floor: '1F' }],
      works: { sources },
    });
    let model = await loadModel(cfg(['bad.csv']));
    assert.match(model.issues.map((i) => i.message).join(), /venue\(会場\) の列が見つかりません/);
    model = await loadModel(cfg(['html.csv', 'ok.csv']));
    assert.equal(model.worksSource, 'ok.csv');
    assert.match(model.issues.map((i) => i.message).join(), /html\.csv.*Webページ.*ok\.csv を表示/);
  }));
