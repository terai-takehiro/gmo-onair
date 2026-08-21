# 収録設定 / 配信設定 — モックアップの元ファイル

**見るときは [Claude Design のキャンバス](https://claude.ai/code/artifact/82ae03a9-e3ac-4027-a922-1f46c628514d)を開いてください。**
ここにあるのは、そのキャンバスを組み立て直すための元ファイルです。

| ファイル | 画面 | 枠 |
| --- | --- | --- |
| `Main.dc.html` | 収録設定（PC） | 1440 × 1180 |
| `Stream.dc.html` | 配信設定（PC・右にインスペクタ） | 1440 × 1000 |
| `Export.dc.html` | Excel を書き出す（点検つき） | 1440 × 1000 |
| `RecordMobile.dc.html` | 収録設定（スマホ） | 390 × 844 |
| `StreamMobile.dc.html` | 配信設定（スマホ・下から出る編集シート） | 390 × 844 |
| `canvas.json` | 5 枚の配置と付箋 | — |

## ブラウザで直接開くとき

`.dc.html` は `<script src="./support.js">` を読みます。このフォルダには置いていないので、
開く前に `docs/design/v4/mockups/support.js` をこのフォルダへ写してください
（`support.js` は 69KB あり、二重に持つと差分が読みにくくなるのでコミットしていません）。

```bash
cp docs/design/v4/mockups/support.js docs/design/qsheet-recording-streaming/mockups/
```

⚠️ 写した `support.js` は**コミットしないこと**（`.gitignore` していないので、`git status` に出たら消してください）。

## 直すとき

このフォルダのファイルを直してから、キャンバスを作り直して同じ URL へ公開し直します。
**キャンバス側で直したものは、ここには戻ってきません** — 画面上で直したら、
その版を読み出してこのフォルダへ書き戻してください。

## レイアウトの決めごと（実測して直したもの）

**値は 1 行。折り返さない。入らないときは長体で詰める。** 説明文（注記）は自然に折り返してよい。
この区別が要点で、「2 行になって読みにくい」のは**値が語の途中で折り返したとき**です。

### 長体は「枠を広げてから縮める」

`transform: scaleX()` だけを当てても**文字数は増えません**。`text-overflow: ellipsis` は
**変形前の幅**で切る位置を決めるので、字が細くなるだけで末尾は同じところで切れます
（実際にこれを踏み、収録先が `ネットワ…` のままでした）。

```css
.condw { flex: 1 1 0; min-width: 0; overflow: hidden; }   /* 横並びの中の受け皿 */
.cond  { display: block; width: 106.4%; transform: scaleX(.94); transform-origin: left center;
         white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }   /* 6% 多く入る */
.cond-s{ display: block; width: 111.2%; transform: scaleX(.90); … }          /* 11% 多く入る */
.cond-r{ display: block; width: 106.4%; margin-left: -6.4%; transform: scaleX(.94);
         transform-origin: right center; text-align: right; … }              /* 右揃えの値 */
```

- **横並び（row flex）の中で使うときは `.condw` でくるむ。** 素の flex アイテムに
  `width: 106.4%` を書いても flex-basis に食われて効きません
- **縦積み（column flex）の親には `overflow: hidden` を付ける。** 広げた 6% が外に漏れます
- **`.cond-s`（.90）は本当に詰まるところだけ。** スマホの一覧の 2 行目だけに使っています
- ⚠️ **JS で測って書き戻す「長体フィット」は入れない**
  （[`../../v4/mockups/DESIGN_POLICY.md`](../../v4/mockups/DESIGN_POLICY.md)。
  再測定と再描画が連鎖してモックが固まった実績があります）

### 高さは `100vh`。`height: 100%` は効かない

`support.js` は `#dc-root` に描き、そこに高さが無いので `height: 100%` が解決できません。
スマホ画面が枠から **196px あふれていました**。根の要素は `height: 100vh` にし、
`html, body, body > div { height: 100% }` も保険で入れてあります。

### 実ブラウザで測る（ソースを読んだだけでは分からない）

`.dc.html` は `<sc-for>` / `<sc-if>` を JS が展開するので、**grep では描かれる文字も寸法も分かりません**。
Playwright で枠のサイズに合わせて描き、次の 4 つを機械で数えました。

| 見るもの | 判定 |
| --- | --- |
| 値が 2 行になっていないか | テキストノードの `getClientRects()` が 2 つ以上 |
| … で切れていないか | `text-overflow: ellipsis` の要素自身の `scrollWidth > clientWidth` |
| 枠から下が切れていないか | `overflow: hidden` の器で `scrollHeight > clientHeight` |
| タップ対象 44px | `cursor: pointer` の**いちばん外側**だけ（子に継承されるため） |

**49 件 → 4 件**（残りは注記が 2 行になっているだけ）。
ローカルで描くには `support.js` を写したうえで、`react` / `react-dom` / `@babel/standalone` を
`unpkg.com` の代わりに手元から返す必要があります（放送設備 LAN と同じく CDN に出られないため）。

## 決めごと

- 色・書体・角丸・寸法は [`docs/design/v4/_tokens.md`](../../v4/_tokens.md) のとおり。
  制作資料のアクセントは **`#c2410e`**（既存モック `v4-mockup-production.dc.html` と同じ）
- 守る規律は [`docs/design/v4/_rules.md`](../../v4/_rules.md)
- アイコンは**インライン SVG**（`lucide-react` に相当する形を手で描いてある）。
  v4 のモックは `<i data-lucide>` を使うが、キャンバス側に lucide が無いため
- **スマホに OS の時計・電池・キーボードを描かない**（実機では上に重なるため）
- 数字は `font-variant-numeric: tabular-nums`。書体は Google Fonts の LINE Seed JP（400 / 700 / 800）
