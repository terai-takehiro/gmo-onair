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
npm run verify:up      # 検証用 Postgres を立てる (冷えた状態から約4秒)
npm run dev            # 7クライアント + server を同時起動
```

| アプリ | URL |
| --- | --- |
| 案件管理 | http://localhost:5173/ |
| Qシート | http://localhost:5174/qsheet/ |
| 機材管理 | http://localhost:5175/equipment/ |
| 技術資料 | http://localhost:5177/techsheet/ |
| ライブ運用 | http://localhost:5178/live/ |
| リアルタイムCG | http://localhost:5179/awards/ |

---

## 2. 作業する

```bash
git switch main && git pull origin main
git switch -c feature/<Issue番号>-<短い名前>
```

ブランチの種類と命名は [docs/branching.md](docs/branching.md#ブランチの種類) にあります。

### 手元で必ず通すもの

```bash
npm run typecheck        # 7クライアント + server
npm run lint             # UIトークン検査 + eslint
npm run check:version    # バージョン表記の整合 (3か所)
npm run build            # 本番と同じビルド経路 (tsc が通っても Vite で落ちることがある)
```

この4つは PR の必須チェックと同じものです。**手元で通してから push**してください。

### 守るもの（`npm run lint` が機械的に止めます）

| 種類 | 使うもの | 詳しくは |
| --- | --- | --- |
| 金額・数字・見出し | `<Money>` `<Num>` `<StatValue>` `<PageTitle>` | CLAUDE.md「数字と見出しは部品から選ぶ」 |
| 知らせる・確認する | `notifySuccess` / `notifyApiError` / `confirmAction` | CLAUDE.md「知らせる・確認するは部品から選ぶ」 |
| 読み込み中・空・エラー | `<SkeletonRows>` `<EmptyState>` `<ErrorPanel>` | CLAUDE.md「読み込み中・空・エラー…」 |
| 色 | `bg-card` `text-muted-foreground` 等の共通トークン | CLAUDE.md「色は共通トークンから選ぶ」 |

`alert()` / `confirm()` / `¥{n.toLocaleString()}` / Tailwind の生パレット（`slate-800` 等）は**使えません**。
どうしてもその場で書く必要があるときは、その行に `ui-tokens-ok` と**理由**を書いてください。

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

- **「検証したこと」は実際にやったものだけ**チェックする
- UI を変えたらスクリーンショット（before / after）
- `Closes #128` を書いておくと、マージで Issue が閉じます

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
