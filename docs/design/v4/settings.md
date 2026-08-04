# 設定 — v4 の画面仕様

> **この文書は生成物です。** `node scripts/extract-v4-design.mjs` で作られます。
> 元データ: [`mockups/v4-mockup-settings.dc.html`](mockups/v4-mockup-settings.dc.html) (104KB)
>
> **レイアウトはここを読むより[モックをブラウザで開く](mockups/v4-mockup-settings.dc.html)ほうが速い。**
> ここには「grep すると高い情報」＝画面が扱うデータの項目名だけを置いています。
> 共通の寸法・色は [`_tokens.md`](_tokens.md)、守る規律は [`_rules.md`](_rules.md)。

**v4.0.0 のスコープ**: v4.0.0 対象

## 画面一覧 (7)

- ① 設定トップ
- ② 拠点・部屋
- ③ 権限とメンバー
- ④ 取引先・仕入先
- ⑤ お金のルール
- ⑥ 休日・営業時間
- ⑦ 通知とテンプレート

## 画面が扱うデータ (8 定義)

実装するときは、ここの項目名をそのまま型と列定義に使ってください
(モックのサンプル値は現実的な値なので、桁数・文字数の見当にも使えます)。

### MENU — 9 件

**項目 (3)**: `group` / `label` / `key`

```js
{ group: 'マスター', label: '設定トップ', key: 'hub' }
```

### APPS — 9 件

**項目 (5)**: `label` / `icon` / `iconBg` / `iconFg` / `here`

```js
{ label: '設定', icon: 'settings', iconBg: '#f2f4f7', iconFg: '#5d6470', here: true }
```

### SITES — 3 件

**項目 (3)**: `id` / `name` / `addr`

```js
{ id: 'yoga', name: '用賀', addr: '東京都世田谷区用賀 4-10-1' }
```

### ROLES — 5 件

**項目 (3)**: `id` / `name` / `desc`

```js
{ id: 'admin', name: '管理者', desc: 'すべてを見て直せる' }
```

### PERM_LABELS

`['案件の作成・編集','見積の作成・編集','工程とタスク','予約（スタジオ）','機材の貸出','請求・入金','料金表マスター','権限とメンバー']`

### MEMBERS — 42 件

**項目 (6)**: `name` / `dept` / `mail` / `role` / `status` / `last`

```js
{ name: '寺井 亮', dept: '営業部', mail: 'terai@example.co.jp', role: 'sales_mgr', status: '在籍', last: '08/01 18:24' }
```

### TEMPLATES — 11 件

**項目 (10)**: `id` / `name` / `trigger` / `group` / `channel` / `to` / `sent` / `subject` / `body` / `vars`

```js
{ id: 'q_send', name: '見積送付のご案内', trigger: '見積を「送付済み」にしたとき', group: '社外', channel: 'メール', to: '取引先の担当者', sent: '86 通', subject: '【GMOグローバルスタジオ】お見積書のご送付（{案件名}）', body: '{取引先名}\n{担当者名} 様\n\nいつもお世話になっております。\n{案件名} のお見積書をお送りいたします。\n\n・お見積番号：{見積番号}\n・金額：{見積金額}（税抜）\n・有効期限：{有効期限}\n\nご不明な点がございましたらお知らせください。', vars: ['{取引先名}', ' …
```

### PARTNERS — 12 件

**項目 (7)**: `name` / `sub` / `kind` / `owner` / `terms` / `amount` / `status`

```js
{ name: '株式会社アドクリエイト', sub: '広告制作 ・ 東京都港区', kind: '得意先', owner: '寺井 亮', terms: '月末締 翌月末払', amount: '18,420,000', status: '取引中' }
```

