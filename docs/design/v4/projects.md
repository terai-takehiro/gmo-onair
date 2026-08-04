# 共通・案件管理 — v4 の画面仕様

> **この文書は生成物です。** `node scripts/extract-v4-design.mjs` で作られます。
> 元データ: [`mockups/v4-mockup-main.dc.html`](mockups/v4-mockup-main.dc.html) (628KB)
>
> **レイアウトはここを読むより[モックをブラウザで開く](mockups/v4-mockup-main.dc.html)ほうが速い。**
> ここには「grep すると高い情報」＝画面が扱うデータの項目名だけを置いています。
> 共通の寸法・色は [`_tokens.md`](_tokens.md)、守る規律は [`_rules.md`](_rules.md)。

**v4.0.0 のスコープ**: v4.0.0 対象

## 画面一覧 (8)

- ① ダッシュボード
- ② 受付
- ③ 案件一覧
- ④ タスク一覧（全案件）
- ⑤ 見積・請求（全案件）
- ⑥ 案件詳細
- ⑦ 標準工程（設定）
- ⑧ 料金表（設定）

## 画面が扱うデータ (14 定義)

実装するときは、ここの項目名をそのまま型と列定義に使ってください
(モックのサンプル値は現実的な値なので、桁数・文字数の見当にも使えます)。

### SAMPLE_FILES — 3 件

**項目 (5)**: `name` / `meta` / `icon` / `bg` / `fg`

```js
{ name: '御見積書_ミナトデジタル様.pdf', meta: '212 KB ・ 金額と明細を読み取ります', icon: 'file-text', bg: '#fef6f7', fg: '#c7243a' }
```

### APP_ORDER

`['案件管理', 'プロジェクト管理', '財務管理', 'カレンダー', '日常業務', '機材管理', '制作資料', '技術資料', '設定', '計時LIVE', 'リアルタイムCG']`

### PM_TK — 12 件

**項目 (8)**: `name` / `case` / `owner` / `due` / `over` / `dueSub` / `state` / `from`

```js
{ name: '見積書を送る（60周年 記念式典）', case: '60周年 記念式典 配信・収録', owner: '寺井', due: '08/02', over: true, dueSub: '今日が期限', state: '進行中', from: '標準工程「見積提案」から' }
```

### PM_QUOTE — 6 件

**項目 (10)**: `case` / `cust` / `title` / `ver` / `amount` / `state` / `owner` / `due` / `dueSub` / `warn`

```js
{ case: '60周年 記念式典 配信・収録', cust: 'ミナトデジタル', title: '配信・収録一式（3カメ／同時通訳）', ver: 'v2', amount: '1,380,000', state: '提出済', owner: '寺井', due: '08/02', dueSub: '今日が期限', warn: true }
```

### PM_BILL — 5 件

**項目 (9)**: `case` / `cust` / `note` / `times` / `amount` / `check` / `pay` / `due` / `dueSub`

```js
{ case: '夏フェス 中継（3日間）', cust: 'ライトウェーブ音響', note: '3日間ぶん一括', times: '第1回 / 1回', amount: '4,200,000', check: '検収済', pay: '入金済', due: '07/31', dueSub: '07/30 入金' }
```

### STUDIOS — 3 件

**項目 (4)**: `id` / `short` / `name` / `note`

```js
{ id: 'yoga', short: '用賀', name: 'GMOサムライスタジオ 用賀', note: 'WORLD ／ SKY ／ LOUNGE' }
```

### CALCS — 5 件

**項目 (2)**: `key` / `label`

```js
{ key: 'fixed', label: '式（一式）' }
```

### EQ_OUT — 6 件

**項目 (3)**: `name` / `meta` / `tag`

```js
{ name: 'SONY FX9 ①', meta: 'CAM-014 ・ ケース A', tag: '本体' }
```

### EQ_IN — 4 件

**項目 (3)**: `name` / `meta` / `tag`

```js
{ name: 'SONY FX6 ②', meta: 'CAM-021 ・ 期限 8/04', tag: '本体' }
```

### OPS_TODAY — 5 件

**項目 (6)**: `time` / `title` / `meta` / `tag` / `act` / `actIcon`

```js
{ time: '8:30', title: '搬入立会い ／ 60周年 記念式典', meta: '用賀 WORLD STUDIO ・ 荒井／瀬川', tag: '完了', act: '搬入チェックは記録済み', actIcon: 'check-circle-2' }
```

### OPS_ISSUE — 4 件

**項目 (6)**: `time` / `title` / `meta` / `tag` / `act` / `actIcon`

```js
{ time: '8:52', title: 'ST01 ワイヤレス 3ch にノイズ', meta: '小柳が報告 ・ 予備機に交換済み', tag: '対応済', act: '経過を残す', actIcon: 'pen-line' }
```

### SP_RECV — 5 件

**項目 (4)**: `cust` / `meta` / `amount` / `state`

```js
{ cust: 'ミナトデジタル株式会社', meta: 'IV-2606-018 ・ 期限 7/31', amount: '1,848,000', state: '超過' }
```

### SP_PAID — 3 件

**項目 (4)**: `cust` / `meta` / `amount` / `state`

```js
{ cust: '関西映像サービス株式会社', meta: 'IV-2606-014 ・ 8/01 入金', amount: '748,000', state: '消込済' }
```

### SP_FIND — 8 件

**項目 (5)**: `kind` / `title` / `meta` / `icon` / `tag`

```js
{ kind: '案件', title: '60周年 記念式典 配信・収録', meta: 'ミナトデジタル ・ 8/02 用賀', icon: 'folder-open', tag: '進行中' }
```

