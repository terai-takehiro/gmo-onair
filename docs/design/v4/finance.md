# 財務管理 — v4 の画面仕様

> **この文書は生成物です。** `node scripts/extract-v4-design.mjs` で作られます。
> 元データ: [`mockups/v4-mockup-finance.dc.html`](mockups/v4-mockup-finance.dc.html) (161KB)
>
> **レイアウトはここを読むより[モックをブラウザで開く](mockups/v4-mockup-finance.dc.html)ほうが速い。**
> ここには「grep すると高い情報」＝画面が扱うデータの項目名だけを置いています。
> 共通の寸法・色は [`_tokens.md`](_tokens.md)、守る規律は [`_rules.md`](_rules.md)。

**v4.0.0 のスコープ**: v4.0.0 対象

## 画面一覧 (8)

- ① ダッシュボード
- ② 請求・入金
- ③ 売上
- ④ 仕入
- ⑤ 販管費
- ⑥ 受け取った書類
- ⑦ 取り込み
- ⑦ 取引先

## 画面が扱うデータ (14 定義)

実装するときは、ここの項目名をそのまま型と列定義に使ってください
(モックのサンプル値は現実的な値なので、桁数・文字数の見当にも使えます)。

### APPS — 9 件

**項目 (5)**: `label` / `icon` / `iconBg` / `iconFg` / `to`

```js
{ label: '機材管理', icon: 'package', iconBg: '#f2f4f7', iconFg: '#5d6470', to: 'v4-mockup-equipment.dc.html' }
```

### MENU — 8 件

**項目 (3)**: `group` / `label` / `on`

```js
{ group: '見る', label: 'ダッシュボード', on: true }
```

### DOCS — 6 件

**項目 (13)**: `type` / `state` / `sender` / `subject` / `amount` / `closing` / `due` / `overdue` / `received` / `gls` / `ai` / `orig` / `trail`

```js
{ type: '請求書', state: '確認中', sender: 'ライトウェーブ音響', subject: '7月分 音声オペレート（夏フェス 中継 ほか2件）', amount: '286,000', closing: '2026-07', due: '7/31', overdue: true, received: '7/20', gls: 'GLS-2607-009', ai: true, orig: true, trail: 'AIが7/20に取込 ／ 寺井が確認中' }
```

### REV — 6 件

**項目 (6)**: `code` / `name` / `sub` / `v` / `tag` / `bill`

```js
{ code: 'GLS-2607-018', name: '60周年 記念式典 配信・収録', sub: 'GMOインターネットグループ', v: 4820000, tag: '確定', bill: '未請求' }
```

### PUR — 5 件

**項目 (6)**: `code` / `name` / `sub` / `v` / `tag` / `url`

```js
{ code: 'GLS-2607-018', name: '照明オペレート（3名）', sub: 'ライトウェーブ音響 ／ 人件費', v: 640000, tag: '確', url: true }
```

### FIX — 3 件

**項目 (6)**: `code` / `name` / `sub` / `v` / `tag` / `url`

```js
{ code: 'FIX-001', name: 'スタジオ償却負担額（用賀）', sub: '固定原価Pj ／ 月次', v: 1860000, tag: '固', url: false }
```

### SGA — 5 件

**項目 (6)**: `code` / `name` / `sub` / `v` / `tag` / `url`

```js
{ code: '—', name: 'クラウド利用料', sub: 'AWS ／ 通信費', v: 386000, tag: '確', url: true }
```

### PAID — 3 件

**項目 (4)**: `name` / `sub` / `v` / `when`

```js
{ name: '周年イベント 配信', sub: 'GMOクリック証券', v: 2180000, when: '7/28 入金' }
```

### RECUR — 4 件

**項目 (4)**: `name` / `sub` / `v` / `prev`

```js
{ name: 'PROGRAM 月次運用', sub: 'GMOメディア', v: 980000, prev: 980000 }
```

### IMP — 9 件

**項目 (8)**: `no` / `payee` / `desc` / `date` / `v` / `st` / `proj` / `kind`

```js
{ no: 'XP-2607-0182', payee: 'ライトウェーブ音響', desc: '照明オペレート（3名）／ GLS-2607-018', date: '7/28', v: 640000, st: '未仕分け', proj: 'GLS-2607-018 60周年 記念式典', kind: '仕入' }
```

### JOINT — 3 件

**項目 (5)**: `name` / `host` / `n` / `v` / `cos`

```js
{ name: '合同新年会 配信（9社）', host: 'GMOインターネットグループ', n: 9, v: 5400000, cos: [ { name: 'GMOインターネットグループ', code: 'GLS-2601-101', host: true, rate: '11.2%', rev: 604000, cost: 372000, inv: '発行済' }, { name: 'GMOペイメントゲートウェイ', code: 'GLS-2601-102', rate: '11.1%', rev: 600000, cost: 370000, inv: '発行済' }, { name: 'GMOフィナンシャルHD', cod …
```

### VENDORS — 5 件

**項目 (6)**: `name` / `person` / `tel` / `mail` / `extra` / `v`

```js
{ name: 'ライトウェーブ音響', person: '大西 亮', tel: '03-5432-1180', mail: 'sales@lightwave.example.jp', extra: 'T1234567890123', v: 2860000 }
```

### CUSTOMERS — 5 件

**項目 (6)**: `name` / `person` / `tel` / `mail` / `extra` / `v`

```js
{ name: 'GMOインターネットグループ', person: '広報 高橋', tel: '03-5456-2555', mail: 'pr@gmo.example.jp', extra: '請求書：郵送 ／ 締め 月末', v: 12480000 }
```

### PARTNERS — 4 件

**項目 (6)**: `name` / `person` / `tel` / `mail` / `extra` / `v`

```js
{ name: '寺井 健太郎', person: 'テクニカルディレクター', tel: '090-1234-5678', mail: 'terai@example.jp', extra: '映像・スイッチング', v: 0 }
```

