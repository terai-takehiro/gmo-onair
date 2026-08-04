# プロジェクト管理 (新規) — v4 の画面仕様

> **この文書は生成物です。** `node scripts/extract-v4-design.mjs` で作られます。
> 元データ: [`mockups/v4-mockup-project.dc.html`](mockups/v4-mockup-project.dc.html) (242KB)
>
> **レイアウトはここを読むより[モックをブラウザで開く](mockups/v4-mockup-project.dc.html)ほうが速い。**
> ここには「grep すると高い情報」＝画面が扱うデータの項目名だけを置いています。
> 共通の寸法・色は [`_tokens.md`](_tokens.md)、守る規律は [`_rules.md`](_rules.md)。

**v4.0.0 のスコープ**: v4.0.0 対象

## 画面一覧 (7)

- ① ダッシュボード
- ② プロジェクト一覧
- ③ プロジェクト詳細
- ④ プロジェクト新規作成
- ⑤ タスク一覧（全プロジェクト）
- ⑥ 見積・請求
- ⑦ 標準工程テンプレート（設定）

## 画面が扱うデータ (20 定義)

実装するときは、ここの項目名をそのまま型と列定義に使ってください
(モックのサンプル値は現実的な値なので、桁数・文字数の見当にも使えます)。

### GP_EST — 6 件

**項目 (9)**: `project` / `title` / `ver` / `amount` / `state` / `to` / `toName` / `due` / `dueSub`

```js
{ project: '用賀スタジオ 第2副調整室 構築', title: '第2副調整室 構築一式（設計・機材・工事）', ver: 'v2', amount: '18,400,000', state: '提出済', to: '自社', toName: '経営管理部', due: '07/29', dueSub: '回答待ち' }
```

### GP_BILL — 5 件

**項目 (8)**: `project` / `note` / `times` / `amount` / `check` / `pay` / `due` / `dueSub`

```js
{ project: '用賀スタジオ 第2副調整室 構築', note: '着手金 30%（個別見積 v2 に基づく）', times: '第1回 / 2回', amount: '5,520,000', check: '対象外', pay: '入金済', due: '06/30', dueSub: '06/28 入金' }
```

### GP_MINUTES — 4 件

**項目 (9)**: `date` / `title` / `who` / `state` / `meta` / `summary` / `decisions` / `todos` / `asks`

```js
{ date: '08/01', title: '第8回 定例（副調・空調の扱い）', who: '寺井 ・ 中西 ・ 井上様（日建） ・ 佐野様', state: 'AI整形済', meta: '2026/08/01 10:00〜11:05 ・ Teams ・ 文字起こし 4,120字から整形', summary: '副調の空調増設をどちらが手配するかが未決のまま。ビル側の工事範囲を総務が確認し、8/5 までに回答をもらう。中継回線は27F側で実測する方針で、立会者を8/5に決める。機材選定は代替案を2つ出したうえで8/8に確定させる。', decisions: [ { no: '01', text: '中継回線の引込口は27F側 …
```

### GP_TABS — 7 件

**項目 (2)**: `key` / `label`

```js
{ key: 'gpm', label: '① ダッシュボード' }
```

### APPS — 9 件

**項目 (5)**: `label` / `icon` / `iconBg` / `iconFg` / `here`

```js
{ label: 'プロジェクト管理', icon: 'list-checks', iconBg: '#eef2ff', iconFg: '#4338ca', here: true }
```

### GP_MENU — 3 件

**項目 (2)**: `title` / `items`

```js
{ title: 'プロジェクト', items: [{ label: 'ダッシュボード' }, { label: 'プロジェクト一覧', tag: '4' }] }
```

### GP_ROWS — 4 件

**項目 (16)**: `name` / `client` / `kind` / `phase` / `pmCo` / `pmCoSelf` / `pm` / `term` / `pct` / `money` / `ask` / `next` / `due` / `dueWarn` / `moved` / `flag`

```js
{ name: '用賀スタジオ 第2副調整室 構築', client: '自社（GMOグローバルスタジオ）', kind: '自社構築', phase: '設計・機材選定', pmCo: '自社PM', pmCoSelf: true, pm: '寺井', term: '05/12〜09/30', pct: 42, money: '個別見積 v2 提出済', ask: 2, next: '機材選定の確定', due: '08/05', dueWarn: true, moved: '2時間前', flag: '' }
```

### GP_PHASES — 7 件

**項目 (7)**: `label` / `state` / `when` / `left` / `width` / `bg` / `done`

```js
{ label: '発注確定・要件整理', state: '完了', when: '05/12〜05/31', left: 0, width: 14, bg: '#a6ceeb', done: 100 }
```

### GP_ORG — 4 件

**項目 (3)**: `tier` / `sub` / `nodes`

```js
{ tier: '発注者', sub: '決める人', nodes: [ { org: 'グループ本体 コーポレート', role: '発注・意思決定', who: '佐野様 ／ 田中様', kind: '外部', note: '稟議と最終判断', mail: 'sano@example.co.jp', scope: '予算・仕様の最終決定', tasks: 2, asks: 2 }, ] }
```

### GP_TPLS — 2 件

**項目 (6)**: `key` / `name` / `icon` / `desc` / `use` / `phases`

```js
{ key: 'av', name: '施設AV設備 更新', icon: 'monitor-speaker', desc: '稼働中の施設（会議室・ホール・スタジオ）のオーディオビジュアル設備を入れ替えるとき', use: '適用中 2件', phases: [ { label: '現地調査・要件整理', days: 10, role: 'PM', tasks: [ { label: '既存設備の棚卸し（型番・年式・数量）', days: 3, role: '技術', must: true }, { label: '利用シーン・運用ヒアリング', days: 2, role: 'PM', must: true }, { label …
```

### GP_MONTHS — 5 件

**項目 (4)**: `label` / `w` / `weeks` / `days`

```js
{ label: '5月', w: 14, weeks: ['2W', '3W', '4W'], days: ['12', '16', '20', '24', '28'] }
```

### GP_TASKS — 7 件

**項目 (6)**: `label` / `who` / `due` / `warn` / `from` / `done`

```js
{ label: 'カメラ制御盤の型番を確定する', who: '寺井', due: '08/05', warn: true, from: '標準工程', done: false }
```

### GP_MEMBERS — 6 件

**項目 (7)**: `name` / `org` / `role` / `mail` / `kind` / `access` / `state`

```js
{ name: '寺井', org: '自社 ／ 技術', role: 'PM', mail: 'terai@gmo-globalstudio.com', kind: 'ONAiR', access: '編集', state: '' }
```

### GP_ASKS — 2 件

**項目 (4)**: `q` / `to` / `since` / `blocks`

```js
{ q: '副調のモニター壁は据置か可動か（先方判断待ち）', to: 'PM会社 経由 ／ グループ総務 佐野様', since: '3日前', blocks: '調達・工事手配' }
```

### GP_MONEY — 3 件

**項目 (6)**: `label` / `sub` / `amount` / `state` / `bg` / `fg`

```js
{ label: '個別見積 v2', sub: '料金表なし・案件ごと個別積算', amount: '18,400,000', state: '提出済', bg: '#eaf4fb', fg: '#005bac' }
```

### GP_BOX_FOLDERS — 2 件

**項目 (6)**: `name` / `scope` / `note` / `subs` / `bg` / `fg`

```js
{ name: '01_社内限り', scope: '社内', note: '稟議・原価・社内検討メモ', subs: [{ name: '個別見積', n: '6' }, { name: '原価・発注', n: '9' }, { name: '議事メモ', n: '12' }], bg: '#fef6f7', fg: '#b91c1c' }
```

### GP_BOX_FILES — 4 件

**項目 (9)**: `name` / `folder` / `scope` / `who` / `when` / `size` / `icon` / `bg` / `fg`

```js
{ name: '第2副調_内装施工図_v2.pdf', folder: '02_共有／図面', scope: '社外', who: '井上様（日建）', when: '今日 09:12', size: '8.4 MB', icon: 'file-text', bg: '#eaf4fb', fg: '#005bac' }
```

### GP_LOG — 5 件

**項目 (3)**: `who` / `what` / `when`

```js
{ who: '寺井', what: '設計会社と副調レイアウトを確認。可動壁は保留', when: '2時間前' }
```

### GP_TK — 9 件

**項目 (9)**: `name` / `project` / `owner` / `ext` / `due` / `over` / `dueSub` / `state` / `from`

```js
{ name: '副調の空調増設、どちらの手配か整理して回す', project: '用賀スタジオ 第2副調整室 構築', owner: '寺井', ext: false, due: '07/31', over: true, dueSub: '2日超過', state: '進行中', from: '07/24 の現地確認から ・ 寺井が追加' }
```

### GP_AK — 8 件

**項目 (10)**: `q` / `project` / `to` / `toName` / `state` / `due` / `over` / `dueSub` / `blocks` / `raised`

```js
{ q: '副調の空調増設は自社手配か、ビル側の工事に含めるか', project: '用賀スタジオ 第2副調整室 構築', to: '自社', toName: '施設管理部', state: '回答待ち', due: '07/31', over: true, dueSub: '2日超過', blocks: '「施工・据付」が始められません', raised: '07/24 寺井' }
```

