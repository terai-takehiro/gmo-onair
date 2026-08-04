# 機材管理 — v4 の画面仕様

> **この文書は生成物です。** `node scripts/extract-v4-design.mjs` で作られます。
> 元データ: [`mockups/v4-mockup-equipment.dc.html`](mockups/v4-mockup-equipment.dc.html) (209KB)
>
> **レイアウトはここを読むより[モックをブラウザで開く](mockups/v4-mockup-equipment.dc.html)ほうが速い。**
> ここには「grep すると高い情報」＝画面が扱うデータの項目名だけを置いています。
> 共通の寸法・色は [`_tokens.md`](_tokens.md)、守る規律は [`_rules.md`](_rules.md)。

**v4.0.0 のスコープ**: v4.0.0 対象

## 画面一覧 (8)

- ① ダッシュボード
- ② 機材台帳
- ③ ラック図
- ④ メンテナンス
- ⑤ 棚卸し
- ⑥ QRスキャン
- ⑦ 貸出・返却
- ⑧ 設定

## 画面が扱うデータ (20 定義)

実装するときは、ここの項目名をそのまま型と列定義に使ってください
(モックのサンプル値は現実的な値なので、桁数・文字数の見当にも使えます)。

### MENU — 9 件

**項目 (3)**: `group` / `label` / `on`

```js
{ group: '現場', label: 'ダッシュボード', on: true }
```

### APPS — 9 件

**項目 (5)**: `label` / `icon` / `iconBg` / `iconFg` / `here`

```js
{ label: '機材管理', icon: 'package', iconBg: '#f2f4f7', iconFg: '#5d6470', here: true }
```

### MAINT — 4 件

**項目 (7)**: `code` / `title` / `name` / `place` / `state` / `kind` / `since`

```js
{ code: 'C-0207', title: 'レンズのAF不良（修理見積待ち）', name: 'SONY FE 24-70mm F2.8 GM II', place: '用賀 ／ WORLD STUDIO ／ —', state: '未対応', kind: '修理', since: '12日' }
```

### OVERDUE — 3 件

**項目 (4)**: `code` / `name` / `who` / `late`

```js
{ code: 'C-0142', name: 'SONY PXW-Z190 本体', who: '大西 ／ 夏フェス 中継（3日間）', late: '4日 超過' }
```

### MOVES — 5 件

**項目 (5)**: `kind` / `day` / `name` / `who` / `code`

```js
{ kind: '出庫', day: '今日', name: 'HyperDeck Shuttle HD ×2', who: '60周年 記念式典 ／ 寺井', code: 'V-0102' }
```

### BY_TYPE — 8 件

**項目 (5)**: `code` / `label` / `total` / `lend` / `assetClass`

```js
{ code: 'V', label: '映像', total: 412, lend: 18 , assetClass: '固定資産' }
```

### ITEMS — 12 件

**項目 (10)**: `code` / `name` / `maker` / `model` / `type` / `unitNo` / `place` / `state` / `lend` / `assetClass`

```js
{ code: 'V-0021', name: 'ATEM 4 M/E Constellation HD', maker: 'Blackmagic', model: 'SWATEMCONS4M/E', type: 'V', unitNo: '1', place: '用賀 ／ 第1副調整室 ／ ラックA', state: '稼働中', lend: false , assetClass: '固定資産' }
```

### LENDS — 6 件

**項目 (8)**: `code` / `name` / `maker` / `model` / `type` / `to` / `state` / `due`

```js
{ code: 'C-0142', name: 'PXW-Z190 本体', maker: 'SONY', model: 'PXW-Z190V', type: 'C', to: '夏フェス 中継（3日間）／ 大西', state: '返却遅延', due: '07/29' }
```

### SUPPLIES — 8 件

**項目 (11)**: `kind` / `name` / `maker` / `model` / `m` / `color` / `place` / `storage` / `n` / `min` / `unit`

```js
{ kind: 'ケーブル', name: '12G-SDI ケーブル', maker: 'カナレ電気', model: 'L-5.5CUHD', m: '5', color: '黒', place: '用賀 ／ 3F 倉庫 ／ —', storage: 'リール', n: 86, min: 40, unit: '本' }
```

### RACKS — 5 件

**項目 (5)**: `name` / `note` / `place` / `used` / `size`

```js
{ name: 'ラックA（第1副調）', note: 'スイッチャー・収録', place: '用賀 ／ 第1副調整室 ／ —', used: 32, size: 42 }
```

### MNT — 7 件

**項目 (9)**: `code` / `kind` / `title` / `name` / `desc` / `vendor` / `cost` / `at` / `state`

```js
{ code: 'C-0207', kind: '故障', title: 'レンズのAF不良（修理見積待ち）', name: 'SONY FE 24-70mm F2.8 GM II', desc: '中望遠でAFが迷う。作例あり', vendor: 'ソニーSC', cost: 48000, at: '07/21', state: '報告済' }
```

### INV_CHECKS — 4 件

**項目 (4)**: `id` / `title` / `date` / `state`

```js
{ id: 'a', title: '2026年8月度 棚卸し（用賀）', date: '2026/08/01', state: '実施中' }
```

### INV_ITEMS — 8 件

**項目 (5)**: `code` / `name` / `place` / `expect` / `found`

```js
{ code: 'V-0021', name: 'ATEM 4 M/E Constellation HD', place: '第1副調整室', expect: '用賀 ／ 第1副調整室 ラックA', found: 1 }
```

### SCAN_LOG — 4 件

**項目 (4)**: `code` / `name` / `tag` / `when`

```js
{ code: 'C-0088', name: 'カメラ三脚 Vision 250', tag: '棚卸し', when: '3分前' }
```

### LEND_ROWS — 7 件

**項目 (7)**: `code` / `name` / `to` / `state` / `out` / `due` / `dueSub`

```js
{ code: 'C-0142', name: 'SONY PXW-Z190 本体', to: '夏フェス 中継（3日間）／ 大西', state: '返却遅延', out: '07/24', due: '07/29', dueSub: '4日 超過' }
```

### ITEM_HIST — 6 件

**項目 (4)**: `tag` / `what` / `who` / `when`

```js
{ tag: '貸出', what: '60周年 記念式典 配信・収録 へ出庫（返却予定 08/06）', who: '寺井', when: '08/02' }
```

### CFG_LOCS — 11 件

**項目 (7)**: `loc` / `name` / `where` / `kind` / `units` / `count` / `sort`

```js
{ loc: '用賀', name: '第1調整室 ラックA', where: 'WORLD STUDIO ／ 2F ／ ラック列', kind: 'ラック', units: 42, count: 156, sort: 10 }
```

### CFG_MAKERS — 12 件

**項目 (5)**: `name` / `person` / `tel` / `mail` / `n`

```js
{ name: 'Blackmagic Design', person: '髙木 亮', tel: '03-6863-2151', mail: 'support@bmd.example.jp', n: 214 }
```

### CFG_COLORS — 8 件

**項目 (3)**: `name` / `hex` / `n`

```js
{ name: '本線系', hex: '#e0f2fe', n: 186 }
```

### CFG_CATS

`['カメラ', 'レンズ', 'スイッチャー', 'コンバーター', 'マイク・音声', 'インカム', '三脚・支持機材']`

