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

## 決めごと

- 色・書体・角丸・寸法は [`docs/design/v4/_tokens.md`](../../v4/_tokens.md) のとおり。
  制作資料のアクセントは **`#c2410e`**（既存モック `v4-mockup-production.dc.html` と同じ）
- 守る規律は [`docs/design/v4/_rules.md`](../../v4/_rules.md)
- アイコンは**インライン SVG**（`lucide-react` に相当する形を手で描いてある）。
  v4 のモックは `<i data-lucide>` を使うが、キャンバス側に lucide が無いため
- **スマホに OS の時計・電池・キーボードを描かない**（実機では上に重なるため）
- 数字は `font-variant-numeric: tabular-nums`。書体は Google Fonts の LINE Seed JP（400 / 700 / 800）
