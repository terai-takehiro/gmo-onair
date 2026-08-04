# カレンダー — v4 の画面仕様

> **この文書は生成物です。** `node scripts/extract-v4-design.mjs` で作られます。
> 元データ: [`mockups/v4-mockup-calendar.dc.html`](mockups/v4-mockup-calendar.dc.html) (112KB)
>
> **レイアウトはここを読むより[モックをブラウザで開く](mockups/v4-mockup-calendar.dc.html)ほうが速い。**
> ここには「grep すると高い情報」＝画面が扱うデータの項目名だけを置いています。
> 共通の寸法・色は [`_tokens.md`](_tokens.md)、守る規律は [`_rules.md`](_rules.md)。

**v4.0.0 のスコープ**: v4.0.0 対象

## 画面一覧 (4)

- ① 予定
- ② 部屋の空き
- ③ 仮押さえ
- ④ 設定

## 画面が扱うデータ (6 定義)

実装するときは、ここの項目名をそのまま型と列定義に使ってください
(モックのサンプル値は現実的な値なので、桁数・文字数の見当にも使えます)。

### APPS — 9 件

**項目 (5)**: `label` / `icon` / `iconBg` / `iconFg` / `to`

```js
{ label: '機材管理', icon: 'package', iconBg: '#f2f4f7', iconFg: '#5d6470', to: 'v4-mockup-equipment.dc.html' }
```

### MENU — 4 件

**項目 (3)**: `group` / `label` / `on`

```js
{ group: '見る', label: '予定', on: true }
```

### EV — 29 件

**項目 (7)**: `d` / `s` / `e` / `t` / `title` / `room` / `layer`

```js
{ d: 1, s: '10:00', e: '18:00', t: 'setup', title: '60周年 記念式典 設営', room: 'W', layer: 'studio' }
```

### ROOMS — 7 件

**項目 (5)**: `site` / `name` / `abbr` / `sub` / `color`

```js
{ site: 'yoga', name: 'WORLD STUDIO', abbr: 'W', sub: '用賀 ／ 1F ・ スタジオ', color: '#dc2626' }
```

### HOLDS — 7 件

**項目 (7)**: `date` / `left` / `d` / `title` / `sub` / `rooms` / `v`

```js
{ date: '8/6（木）', left: 'あと4日', d: 4, title: '夏フェス 中継（3日間）', sub: 'ライトウェーブ音響 ・ GLS-2607-009', rooms: 'WORLD STUDIO', v: '3,400,000' }
```

### FEEDS — 4 件

**項目 (6)**: `src` / `label` / `url` / `synced` / `count` / `on`

```js
{ src: 'Google', label: '寺井 業務カレンダー', url: 'google://terai@gmo-globalstudio.com', synced: '3分前', count: '128件', on: true }
```

