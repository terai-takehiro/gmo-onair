# 制作技術支援 (Qシート) — v4 の画面仕様

> **この文書は生成物です。** `node scripts/extract-v4-design.mjs` で作られます。
> 元データ: [`mockups/v4-mockup-production.dc.html`](mockups/v4-mockup-production.dc.html) (47KB)
>
> **レイアウトはここを読むより[モックをブラウザで開く](mockups/v4-mockup-production.dc.html)ほうが速い。**
> ここには「grep すると高い情報」＝画面が扱うデータの項目名だけを置いています。
> 共通の寸法・色は [`_tokens.md`](_tokens.md)、守る規律は [`_rules.md`](_rules.md)。

**v4.0.0 のスコープ**: 凍結解除中 — 作り直し進行中

## 画面一覧 (3)

- ① 香盤表一覧
- ② 進行台本（編集）
- ③ 本番

## 画面が扱うデータ (5 定義)

実装するときは、ここの項目名をそのまま型と列定義に使ってください
(モックのサンプル値は現実的な値なので、桁数・文字数の見当にも使えます)。

### MENU — 6 件

**項目 (3)**: `group` / `label` / `on`

```js
{ group: '制作', label: '香盤表一覧', on: true }
```

### APPS — 9 件

**項目 (5)**: `label` / `icon` / `iconBg` / `iconFg` / `here`

```js
{ label: '制作資料', icon: 'layout-template', iconBg: '#fff7ed', iconFg: '#c2410e', here: true }
```

### ROWS — 7 件

**項目 (10)**: `date` / `day` / `title` / `sub` / `place` / `ver` / `items` / `len` / `state` / `owner`

```js
{ date: '08/02', day: '土 ・ 今日', title: '60周年 記念式典 配信・収録', sub: 'ミナトデジタル ／ 本番（式典 90分＋懇親 60分）', place: '用賀 ／ WORLD STUDIO', ver: '第3稿 確定', items: 12, len: '2:30:00', state: 'today', owner: '寺井' }
```

### CUES — 12 件

**項目 (7)**: `kind` / `name` / `note` / `cast` / `len` / `script` / `assets`

```js
{ kind: 'OP', name: 'オープニング映像', note: '尺 30 秒 ・ 音声 CH1-2', cast: 'VTR', len: '0:30', script: '', assets: [] }
```

### LOG — 4 件

**項目 (3)**: `who` / `what` / `when`

```js
{ who: '大森', what: '#142 の香盤を第2稿に更新（オープニング尺を 30秒 短縮）', when: '35分前' }
```

