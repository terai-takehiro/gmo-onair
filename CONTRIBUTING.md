# 開発の始め方

GMO ONAiR（GMOグローバルスタジオの制作管理プラットフォーム）の開発手順です。

- **ブランチ運用・リリース手順** → [docs/branching.md](docs/branching.md)
- **設計方針・UI ポリシー・環境分離ポリシー** → [CLAUDE.md](CLAUDE.md)
- **アプリ構成・画面一覧** → [README.md](README.md)

---

## 1. 環境を作る

必要なもの: **Node.js 20** / **Docker**（検証用 Postgres 用）

```bash
git clone https://github.com/terai-takehiro/gmo-onair.git
cd gmo-onair
cp .env.example .env
npm ci --workspaces --include-workspace-root
```

`.env` は**絶対にコミットしない**（`.gitignore` 済み）。
`GOOGLE_CLIENT_ID` が未設定だと mockAuth（ユーザーカード選択式）で入れます。

### 動かす

```bash
npm run verify:up      # 検証用 Postgres を立てる (冷えた状態から約4秒・ポート5433)
npm run dev            # v4 対象3アプリ + server を同時起動
```

| アプリ | URL | v4.0.0 |
| --- | --- | --- |
| 案件管理・財務管理・カレンダー・設定 | http://localhost:5173/ | **対象** |
| 日常業務 | http://localhost:5180/daily/ | **対象** |
| 機材管理 | http://localhost:5175/equipment/ | **対象** |
| 制作資料 (Qシート) | http://localhost:5174/qsheet/ | 凍結 |
| 技術資料 | http://localhost:5177/techsheet/ | 凍結 |
| 計時LIVE | http://localhost:5178/live/ | 凍結 |
| リアルタイムCG | http://localhost:5179/awards/ | 凍結 |

`npm run dev` の既定が3アプリなのは**手元の速さのため**です。凍結アプリを触るときは
`npm run dev:frozen`、全部立てたいときは `npm run dev:all` を使ってください。

**凍結アプリの見た目は変えないこと。** 詳しくは各ディレクトリの `CLAUDE.md` と
[docs/v4-plan.md](docs/v4-plan.md) にあります。

---

## 2. 作業する

```bash
git switch main && git pull origin main
git switch -c feature/<Issue番号>-<短い名前>
```

ブランチの種類と命名は [docs/branching.md](docs/branching.md#ブランチの種類) にあります。

### 手元で必ず通すもの

```bash
npm run typecheck        # v4 対象3アプリ + server (CI は typecheck:all で全7アプリを見る)
npm run lint             # eslint
npm run check:version    # バージョン表記の整合 (3か所)
npm run build:changed    # 変更したワークスペースだけビルド (全部だと約2分)
npm run build            # 本番と同じビルド経路 (tsc が通っても Vite で落ちることがある)
```

**手元で通してから push**してください。デプロイしてからバグを見つけると、1往復に
「push → CI待ち → デプロイ待ち → 確認 → 修正」がかかります。手元なら数十秒です。

画面を変えたときは、実ブラウザで測る検査も回してください。

```bash
npm run verify:ui        # 書体・地の色・桁揃い・横はみ出し・タップ領域を実測
```

### 守るもの

**縦の整列・金額表記** は v4 の中核ルールです（[docs/v4-plan.md](docs/v4-plan.md)）。

| 種類 | 使うもの |
| --- | --- |
| 金額 | `<Money value={n} />` — **`¥` と数字を別要素に**分ける（1つの文字列にしない） |
| 数字・見出し | `<Num>` `<StatValue>` `<PageTitle>` |
| 期間 | `<DateRange start end />` — 開始／`〜`／終了を別要素に分ける |
| 一覧の行 | `<Row>` `<RowMain>` `<RowSlot>` — **伸びるのは名前列だけ** |
| バッジ・チップ | `<TableBadge col={n}>` — **固定幅の枠**に入れる（文字数で幅を変えない） |
| 知らせる・確認する | `notifySuccess` / `notifyApiError` / `confirmAction` |
| 読み込み中・空・エラー | `<SkeletonRows>` `<EmptyState>` `<ErrorPanel>` |
| 色 | `bg-card` `text-muted-foreground` 等の共通トークン |

`alert()` / `confirm()` / `¥{n.toLocaleString()}` / Tailwind の生パレット（`slate-800` 等）は**使いません**。

> **いまの状態**: これらを機械的に止める `npm run check:ui-tokens` は、上の部品が
> v4 の Phase 1 で入るまで**まだ `lint` に組み込んでいません**（部品が無い状態で有効にすると
> 全画面で落ちるため）。組み込むまでは人が気をつけてください。

### 1ファイルは400行まで（`npm run lint` が止めます）

超えると「1か所直すのに全部読む」ことになり、変更のコストが跳ね上がります。
画面を作り直すときに分割してください（例: 案件詳細は7タブ = 7ファイル）。

**いま超えているのは41本**（最大 `ProjectFormPage.tsx` 2,179行）。一度に直すのは無理なので、
現状を基準として記録し、**新しく超えたファイル**と**既存の超過ファイルが増えたとき**だけ止めます。

```bash
npm run check:file-size                        # 検査 (lint から自動で呼ばれる)
node scripts/check-file-size.mjs --list        # 超過ファイルを行数順に見る
node scripts/check-file-size.mjs --update      # 減ったら基準を締める
```

分割したら `--update` で基準を締めてください（減る方向にしか動きません）。
どうしても分けられない理由があるときは `--update` で基準に入れ、**PR に理由を書いて**ください。

### 画面を実装するときに読むもの

モックアップは1ファイル 122KB〜675KB（合計 2.3MB）あるので、**毎回検索しないでください**。
必要な情報は [`docs/design/v4/`](docs/design/v4/) に 39KB に抜き出してあります。

| 知りたいこと | 読む場所 |
| --- | --- |
| 守る規律（縦の整列・金額表記・スマホ） | `docs/design/v4/_rules.md` |
| 色・書体・角丸・寸法の確定値 | `docs/design/v4/_tokens.md` |
| その画面が扱うデータの項目名（= 列定義） | `docs/design/v4/<アプリ>.md` |
| **レイアウト・見た目** | `docs/design/v4/mockups/*.dc.html` を**ブラウザで開く** |
| v4 の画面 → 現行の実装ファイルの対応 | `docs/design/v4/mockups/github.md` |

アプリ別ファイルは生成物です。デザインが更新されたら `mockups/` を差し替えて
`npm run design:extract` を実行してください。

### スマホ対応は必須

全画面がモバイルファースト前提です。**375px 幅（iPhone SE 相当）で破綻しないこと**、
タップ領域は最低 44px。詳細は CLAUDE.md「レスポンシブデザイン必須」。

### AI 機能を触るとき

会社方針「**AI を使い捨てにしない**」があります。AI 機能・MCP ツール・自動化を
作る / 変えるときは `.claude/skills/ai-feedback-loop/` のスキルを使い、**5条件の充足表**を
PR に出してください。AI が関与しない UI 修正・CRUD・デプロイ作業には適用しません。

### DB マイグレーション

`server/src/shared/db/migrations/` に連番で足します。
**番号がぶつかっていないか必ず確認**してください（同じ番号のファイルが複数あると
どちらが当たるか読めません。過去に 087 が2つできています）。
マイグレーションの失敗はサーバーの起動シーケンスを止めます。

---

## 3. PR を出す

```bash
git push -u origin feature/<Issue番号>-<短い名前>
```

PR テンプレートが自動で出ます。

### PR タイトルは `種類(アプリ): 何をしたか`

Squash マージなので **1 PR = `main` の1コミット**になります。タイトルを揃えておくと
`git log --oneline` がそのまま「どの機能に何をしたか」の一覧になります。

```
feat(equipment): 機材台帳を v4 の見た目にした
fix(finance):    金額の桁がずれていたのを直した
chore(shared):   設計トークンを v4 の値に差し替えた
docs:            ブランチ運用の説明を実際の運用に合わせた
```

| 種類 | 意味 |
| --- | --- |
| `feat` | 足した |
| `fix` | 直した |
| `chore` | 設定・依存・CI などの雑務 |
| `docs` | ドキュメントだけ |
| `refactor` | 作り替えた（動きは同じ） |

アプリは `projects` / `finance` / `schedule` / `settings` / `gpm` / `equipment` / `daily` /
`shell` / `shared`。全体にかかるものは括弧を省いてよいです。

あとで追えるようになること:

```bash
git log --oneline v3.2.2..v4.0.0            # ある版から版までの全変更
git log --oneline --grep "(equipment)"      # 機材管理に加えた修正だけ
git log --oneline -- <ファイル>              # その画面がいつどの PR で変わったか
```

### そのほか

- **「検証したこと」は実際にやったものだけ**チェックする
- UI を変えたらスクリーンショット（before / after）
- `Closes #128` を書いておくと、マージで Issue が閉じます
- **1 PR = 1画面**を目安に小さく保つ（レビューできない PR は結局レビューされません）

CI が緑になったら **Squash and merge**。ブランチは自動で消えます。
マージすると**検証環境（dev.gmo-onair.jp）に自動デプロイ**されます。

---

## リリースの出し方

本番（gmo-onair.jp）に出るのは **GitHub で Release を公開したときだけ**です。

### 手順

**① バージョンを上げる PR を出す**

バージョンは**リリースのときだけ**上げます（PR ごとには上げません — 複数のブランチが
同時に `package.json` を触ると必ず衝突します）。

上げるのは**この3か所だけ**。`npm run check:version` が一致を検査します。

| # | 場所 | 形 |
| --- | --- | --- |
| 1 | ルート `package.json` の `"version"` | `"4.0.1"` ← **唯一の情報源** |
| 2 | `CLAUDE.md`「## 現在のバージョン」 | `v4.0.1 — **タイトル**。本文` |
| 3 | `README.md` | `**現在のバージョン**: v4.0.1 — ...` |

**各ワークスペースの `package.json` は更新しません。** どこからも読まれておらず、
更新すると Docker の全ビルドステージが無効化されてデプロイが 2〜3 分伸びます
（詳細: [docs/deploy-pipeline.md](docs/deploy-pipeline.md)）。

`CLAUDE.md` に残すのは**最新5件だけ**。6件目に押し出された版は
`docs/version-history.md` の「## 過去のバージョン」直下へ移してください
（CLAUDE.md はコーディング中に毎ターン全文が読まれるため、履歴を溜めると作業自体が遅くなります）。
画面の「バージョン履歴」は両方のファイルを連結して読むので、全件表示は保たれます。
**書式を崩すとパースに失敗する**ので、既存エントリに厳密に合わせてください。

**② Release を作る**

GitHub の **Releases → Draft a new release**

- タグ: `v4.0.1`（`package.json` の version に `v` を付けたもの）
- ターゲット: `main`
- 本文: そのバージョンの変更点

**③ Publish release** → 本番デプロイが走る（`production` 環境の承認待ちで一度止まります）

**④ 出たことを報告する** — バージョン番号とデプロイ先をチャットで伝えてください。

### バージョン番号の付け方

- パッチ（`4.0.1` → `4.0.2`）を1つずつ上げる。**大きくジャンプしない**
- メジャー・マイナー（先頭2つ）は**依頼があったときだけ**上げる

---

## やってはいけないこと

- `.env` や認証情報のコミット、API キー・JWT シークレットのハードコード
- 本番 DB への直接 SQL 操作（管理者パスワードリセット等の緊急時のみ）
- 本番 DB と検証 DB の相互参照・相互コピー（`onair_prod` / `onair_dev` は**完全分離**）
- 本番の秘密情報を検証環境で使うこと
- **利用者の明示的な指示なしに本番リリースを公開すること**
- `main` / `release/v3` への直接 push・force push、`v*` タグの打ち直し

---

## 困ったとき

| 症状 | 見るところ |
| --- | --- |
| CI が落ちた | Actions のログ。`checks` = 型/Lint/バージョン、`build` = Docker ビルド |
| 検証環境が 502 | Deploy ログの末尾に nginx / app_dev の診断が全部出ています |
| 本番に何が出ているか分からない | Releases の一番上のタグ。`curl -s https://gmo-onair.jp/health` |
| 戻したい | [docs/branching.md「戻したいとき」](docs/branching.md#戻したいとき) |
| GitHub 側の設定を変えたい | [docs/ops/github-repo-settings.md](docs/ops/github-repo-settings.md) |
