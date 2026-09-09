# `docs/changelog.d/` — 版に載せる文を、PR ごとに1ファイルで置く場所

**作業 PR はここにファイルを1つ足すだけ。** `package.json` の `version`・`CLAUDE.md`「現在のバージョン」・
`README.md` の版は**触らない**（`npm run lint` の `check-changelog.mjs` が止める。
全体の決めごとは [docs/branching.md](../branching.md)「版の番号は、作業 PR では取らない」）。

## なぜこの形か

版の番号は**マージされた順**で決まるので、着手時に番号を取ると並行した PR と同じ3か所で必ずぶつかる
（実測ではコードは1度も競合せず、この3か所だけが毎回衝突していた）。
ファイルを分ければ同じ行を2人が書かないので、衝突しようがない。

## 書き方

| 決めごと | 中身 |
| --- | --- |
| ファイル名 | 枝の名前（`/` は `-`）。例: `fix-141-calendar-duplicate.md` |
| 1 PR = 1 ファイル | 直しが増えたら同じファイルに書き足す。2つ以上足すと `check-changelog.mjs` が警告する（止めない） |
| 中身 | そのまま版の履歴に載る本文。集めるとき改行は取り除かれて1行になる |
| 先頭 | **`**太字の見出し**` で始める**。画面の「バージョン履歴」は先頭の太字を版の名前として切り出す（無いと本文の頭 90 文字が名前になる） |
| `vX.Y.Z —` | **書かない**。番号はリリースのときに決まる |
| 書式 | 何が起きていたか → なぜ困るか → どう直したか → 検証 |
| `docs/` へのリンク | Markdown リンクではなく**素のパス**（`` `docs/branching.md` ``）。`release:notes` がリポジトリ直下の `CLAUDE.md` へそのまま貼るので、相対パスの基準がずれてリンク切れになる。`docs/version-history.md` も同じ |
| 長さ | 1本 3,000 バイトを目安に。超えると `release:notes` が警告する（止めない — リリースの日に人の文章を削らせないため） |

```markdown
**スマホから古い未入金が見えなかったのを直した**（Codex のレビュー棚卸し #61）。
①先月以前の未入金が1件も出ていなかった — 今月の締めだけを引いていたため…
```

## 長さの上限（12,000 バイト／1つの版）

`CLAUDE.md`「## 現在のバージョン」は毎ターン文脈に載るので、`scripts/collect-changelog.mjs` は
版1件の行に **12,000 バイト**の上限を持つ。超えたときは止めずに**自動で分ける**:

- **全文** → `docs/version-history.md`「## 過去のバージョン」直下（`(…)` で包んだ1行）
- **要約** → `CLAUDE.md`

画面の「バージョン履歴」は両方を読み、同じ版なら**長いほう（＝全文）を本文に、見出しは要約のもの**を出す。
中身は失われない。

### 要約は人が書く（`_summary.md`）

- `docs/changelog.d/_summary.md` を置くと、その中身を**そのまま**要約に使う。無いときは
  「収録した見出しを並べたもの」が入り、`release:notes` が警告する（その版が何だったかを1文で言うのは人の仕事）
- `**タイトル**。本文…` から書き始める。**`vX.Y.Z — ` は書かない**（`release:notes` が付ける）
- 下書きとしては集めない。門（`check-changelog.mjs`）も下書きに数えない
  （判定は `scripts/lib/changelog-summary.mjs` の `isNoteFile` 1か所）
- 要約が全文より長い（画面と同じ数え方＝文字数）と `release:notes` は止まる。要約も 12,000 バイトを超えると止まる
- リリースで下書きと一緒に消える（残すと次の版が前の版の要約を名乗る）

## リリースのとき

```bash
npm run release:notes -- 4.6.11          # 集めて書き込む
npm run release:notes -- 4.6.11 --dry    # 何が起きるか出すだけ
```

1. `README.md`・`_summary.md` 以外の `*.md` を **git の履歴順**（下書きが追加されたコミットの時刻＝マージされた順）に集め、
   `vX.Y.Z — 本文1 本文2 …` の1行にする
2. `CLAUDE.md`「## 現在のバージョン」の先頭に置き、4件目を `docs/version-history.md` へ移す
3. `README.md` の `**現在のバージョン**: vX.Y.Z — **タイトル**` の**1行だけ**を書き換える
   （本文や「旧 vX.Y.Z」の行は README に置かない。全文は `CLAUDE.md` と `docs/version-history.md` にある）
4. `package.json` の `version` を上げる
5. 集めた下書きと `_summary.md` を消す

あとは `npm run check:version`（3か所の一致）と `RELEASE=1 npm run lint`。
画面用の `client/public/version-history.json` は client の `predev` / `prebuild`
（`scripts/generate-version-history.mjs`）が作る。
