# 日常業務 — v4 の画面仕様

> **この文書は生成物です。** `node scripts/extract-v4-design.mjs` で作られます。
> 元データ: [`mockups/v4-mockup-dailyops.dc.html`](mockups/v4-mockup-dailyops.dc.html) (117KB)
>
> **レイアウトはここを読むより[モックをブラウザで開く](mockups/v4-mockup-dailyops.dc.html)ほうが速い。**
> ここには「grep すると高い情報」＝画面が扱うデータの項目名だけを置いています。
> 共通の寸法・色は [`_tokens.md`](_tokens.md)、守る規律は [`_rules.md`](_rules.md)。

**v4.0.0 のスコープ**: v4.0.0 対象

## 画面一覧 (6)

- ① ウィークリー活動報告
- ② デイリーニュース
- ③ 内覧会 開催日の一覧
- ④ 内覧会 その日の受付
- ⑤ 入ってきた情報
- ⑥ セキュリティカード

## 画面が扱うデータ (7 定義)

実装するときは、ここの項目名をそのまま型と列定義に使ってください
(モックのサンプル値は現実的な値なので、桁数・文字数の見当にも使えます)。

### APPS — 9 件

**項目 (5)**: `label` / `icon` / `iconBg` / `iconFg` / `to`

```js
{ label: '機材管理', icon: 'package', iconBg: '#f2f4f7', iconFg: '#5d6470', to: 'v4-mockup-equipment.dc.html' }
```

### MENU — 5 件

**項目 (2)**: `group` / `label`

```js
{ group: '定期報告', label: 'ウィークリー活動報告' }
```

### WEEKS — 6 件

**項目 (3)**: `label` / `sub` / `state`

```js
{ label: '7/27 〜 8/2 の週', sub: 'トピック 3件', state: '下書き' }
```

### NEWS — 8 件

**項目 (7)**: `cat` / `ai` / `content` / `note` / `by` / `src` / `pick`

```js
{ cat: '映像', ai: false, content: '12G-SDI対応の小型スイッチャーが発表。4ME構成で価格は据え置き', note: '常設の更新候補', by: 'AI', src: 'ai', pick: 4 }
```

### INV_ROWS — 5 件

**項目 (11)**: `ses` / `name` / `kana` / `company` / `role` / `meta` / `party` / `companions` / `interest` / `checked` / `promoted`

```js
{ ses: 0, name: '田中 太郎', kana: 'たなか たろう', company: 'GMOメディア', role: '制作部 部長', meta: '090-1234-5678 ／ t.tanaka@example.co.jp ／ 東京都渋谷区', party: 3, companions: ['佐藤 花子', '鈴木 一郎'], interest: 'バーチャルプロダクションの制作フローと、内製化したときの人員体制を相談したい。', checked: true, promoted: true }
```

### INQ — 8 件

**項目 (11)**: `src` / `from` / `imp` / `summary` / `subject` / `tags` / `received` / `ai` / `state` / `ticket` / `due`

```js
{ src: 'mail', from: '◯◯大学 メディア学部', imp: '高', summary: 'バーチャルプロダクションの取材を受けてほしい（学生向け教材の制作）', subject: '件名: 【取材のお願い】スタジオ設備について', tags: ['取材', '広報'], received: '7/30', ai: true, state: '未仕分け', ticket: '', due: '' }
```

### AREAS — 10 件

**項目 (3)**: `key` / `label` / `icon`

```js
{ key: 'office', label: '執務室', icon: 'building-2' }
```

