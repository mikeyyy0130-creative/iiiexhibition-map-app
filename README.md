# 東京大学制作展2026 会場マップ

来場者がQRコードから開く、スマホ向けの会場マップです(インストール不要・ビルド不要の静的サイト)。

- 現在地(GPS)と会場を地図に表示し、各会場から **Googleマップの徒歩経路** を開けます
- 工学部2号館は地図上では **ピン1本**。タップすると **簡易フロア図** で会場A・B・Cの位置・階・使う入口を案内します(屋内ではGPSで会場を区別しません)
- 会場ごとの作品を **カード形式** で表示(ボトムシート)
- 番外編の **寄り道**(ごはん・カフェ・散歩ロード)は、切り替えたときだけ表示。ピンは小さな灰色の丸で、展示会場のピンより目立たないようにしています

> いま入っている座標・文章・作品は **すべてダミー** です。

---

## どこを編集すればいいか

| 変えたいもの | ファイル |
| --- | --- |
| 展示名・会期・開場時間・会場・入口・フロア図・寄り道 | `data/config.js` |
| 作品(タイトル・作者・説明・画像) | `data/works.csv`(Excel / Googleスプレッドシートで編集可) |
| 作品画像 | `images/works/` |
| 入口写真 | `images/entrances/` |
| 実際のフロア図(任意) | `images/floors/` |

編集したら、公開URLの末尾に **`?check`** を付けて開くと、設定ミスや画像の置き忘れが一覧で出ます(来場者には表示されません)。

```
https://<公開URL>/?check
```

### 会場の座標を入れる

Googleマップで場所を長押し(PCは右クリック)すると `35.71xxx, 139.76xxx` が出るので、`data/config.js` の `lat`(1つ目)と `lng`(2つ目)に入れます。

- 建物ピンの位置: `buildings[].lat / lng`
- 入口の位置: `buildings[].entrances[].lat / lng`(2号館の会場を選ぶと、使う入口が地図に出ます。経路の目的地にもなります)
- 中山未来ファクトリー(情報学環本館)の場所: <https://maps.app.goo.gl/bpi3zq43bh6B3G6E6>

### 作品データ(`data/works.csv`)

| 列 | 内容 | 例 |
| --- | --- | --- |
| `id` | 作品番号(カードに大きく出ます) | `A-01` |
| `venue` | 会場のid(`data/config.js` の `venues`) | `A` |
| `title` | タイトル | |
| `artist` | 作者 | |
| `description` | 説明(改行OK) | |
| `image` | 画像のパス(空欄なら `images/works/<id>.jpg` を自動で探します) | `images/works/A-01.jpg` |
| `link` | 作品ページのURL(任意) | |

- 見出しは日本語(`作品ID, 会場, タイトル, 作者, 説明, 画像, リンク`)でも読めます
- Excelで「CSV」保存(Shift_JIS)しても、「CSV UTF-8」で保存しても読めます
- 並び順はCSVの行の順です

**Googleスプレッドシートで管理したい場合**:ファイル → 共有 → ウェブに公開 → 「カンマ区切り形式(.csv)」で公開し、そのURLを `data/config.js` の `works.sources` の先頭に追加します。読めなかったときは `data/works.csv` が使われます。

### 写真・画像

- 置くだけで表示されます。まだ無いものは「準備中」の枠が出ます
- 作品画像は正方形に切り抜いてカードに、詳細画面では4:3で表示します。長辺1200px・300KB程度に縮小しておくと、会場の電波が弱くても速く開けます
- 入口写真は4:3がおすすめ(`data/config.js` の `entrances[].photo` にパスを書きます)

### フロア図

`data/config.js` の `plan` に、建物を `width × height` の方眼(左上が0,0)とみなした座標で書きます。

- `outline`: 建物の外形
- `cores`: エレベーター(`ev`)・階段(`stairs`)
- `entrances[].plan`: 入口の位置/`entrances[].path`: 入口 → EV・階段の道順(1Fに点線)
- `venues[].room`: 部屋の四角形/`venues[].path`: EV・階段 → 部屋の道順(会場の階に点線)
- 実際の図面がある階は `plan.floors['2F'].image` に画像を指定すると、簡易図の代わりに表示されます(画像の縦横比を `width:height` にそろえると、部屋の枠がぴったり重なります)

### 寄り道

`data/config.js` の `detour.spots` に、カテゴリ(`food` / `cafe` / `walk`)ごと2〜3件ずつ。`comment` に制作陣の一言、`by` に誰の推しかを書きます。散歩ロードは `path` に通る順の座標を並べると地図に点線で描きます。

---

## 公開(GitHub Pages)

1. このリポジトリを GitHub に push
2. Settings → Pages → Build and deployment → Source を「Deploy from a branch」、ブランチを `main` / `/ (root)` にして Save
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

位置情報は **https でしか動きません**(GitHub Pages / Vercel は https なのでそのままでOK)。
更新はファイルを push するだけです。ブラウザのキャッシュで反映まで数分かかることがあります(設定と作品データは毎回最新を読みに行きます)。

### QRコード

会場ごとのQRコードも作れます。2号館の入口に貼れば、その会場の行き方がすぐ開きます。

| 開く画面 | URL |
| --- | --- |
| 地図(トップ) | `https://<公開URL>/` |
| 会場Cの行き方 | `https://<公開URL>/?venue=C` |
| 作品 A-01 の詳細 | `https://<公開URL>/#work/A-01` |
| 寄り道 | `https://<公開URL>/#detour` |

---

## 手元で確認する

位置情報とデータ読み込みのため、ファイルを直接ダブルクリックではなく簡易サーバーで開きます。

```sh
npm start            # → http://localhost:8080/
# または
python3 -m http.server 8080
```

```sh
npm run check        # データの確認(ブラウザ不要)
npm test             # ユニットテスト
npm install && npm run test:e2e   # スマホ画面での通しテスト(Playwright)
```

## 構成

```
index.html          画面の骨組み
css/app.css         見た目
js/main.js          画面の切り替え(URLの # で管理。戻るボタン対応)
js/map.js           地図(Leaflet + OpenStreetMap)・ピン・現在地
js/sheet.js         ボトムシート
js/views.js         会場一覧・作品カード・寄り道・詳細画面
js/floorplan.js     階表示・簡易フロア図・入口写真の枠
js/data.js          データの読み込みとチェック
js/csv.js           CSVの読み込み
js/geo.js           距離・徒歩分数・Googleマップ連携・位置情報
data/               ← 編集するのはここ
vendor/leaflet/     Leaflet 1.9.4(同梱。CDNに依存しない)
```

## メモ

- 屋内ではGPSの精度が10〜30m程度に落ち、階もわからないため、2号館の3会場はGPSで区別せずフロア図で案内しています
- 地図タイルは OpenStreetMap の標準タイルを使っています([タイル利用ポリシー](https://operations.osmfoundation.org/policies/tiles/))。数日間のイベントの来場者規模なら問題ない想定です
- 文字は BIZ UDPゴシック(読みやすさ重視のユニバーサルデザイン書体)、階や番号は Barlow を使っています(Google Fonts。読めない環境では端末の標準フォント)
