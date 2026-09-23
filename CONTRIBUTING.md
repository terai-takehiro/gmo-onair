# 開発の始め方（CONTRIBUTING）

GMO ONAiR（GMOグローバルスタジオの制作管理プラットフォーム）を手元で動かし、PR を出すまでの手順です。

| 知りたいこと | 読む場所 |
| --- | --- |
| 設計方針・環境分離・セキュリティの決めごと | [CLAUDE.md](CLAUDE.md) |
| ブランチ・PR・リリースの決めごと（正） | [docs/branching.md](docs/branching.md) |
| アプリ構成・ポート・ベースパス | [CLAUDE.md](CLAUDE.md) の「ブロックアプリ一覧」（ここには写しを置かない） |
| docs/ 全体の目次 | [docs/README.md](docs/README.md) |

---

## 1. 環境を作る

必要なもの: **Node.js 22** / **Docker**（検証用 Postgres 用）。`.devcontainer/` を使えばコンテナの中で完結します。

```bash
git clone https://github.com/terai-takehiro/gmo-onair.git
cd gmo-onair
cp .env.example .env
npm ci --workspaces --include-workspace-root
```

- `.env` は**絶対にコミットしない**（`.gitignore` 済み）
- 手元の認証は `AUTH_MODE` 未指定なら mock（ユーザーカード選択式）。本番・検証環境は Email/Password です

### 動かす

```bash
npm run verify:up      # 検証用 Postgres（冷えた状態から約4秒・ポート5433・本番/検証とは別）
npm run dev            # 既定3アプリ（案件管理・日常業務・機材管理）+ server。全部は dev:all
```

開く URL は `http://localhost:<ポート><ベースパス>`。ポートとベースパスは [CLAUDE.md](CLAUDE.md) の表が正です。
`npm run dev` の既定が3アプリなのは手元の速さのためです。

検証用 Postgres の中身（DB 名・検証ユーザー4人・落とし穴）は [scripts/dev-verify/README.md](scripts/dev-verify/README.md)。

---

## 2. 作業する

```bash
git switch main && git pull origin main
git switch -c feature/<Issue番号>-<短い名前>      # fix/ chore/ docs/ も同じ形
```

ブランチの種類・寿命・Claude Code の `claude/*` の扱いは [docs/branching.md](docs/branching.md)。

### 手元で必ず通すもの

```bash
npm run typecheck        # 既定3アプリ + server（shared を触ったら typecheck:all = CI と同じ範囲）
npm run lint             # eslint ＋ 各種検査（下の表）
npm run test             # shared の Vitest ＋ server のレビュー試験（CI も回す）
npm run check:version    # バージョン表記の整合（3か所）
npm run build:changed    # 変更したワークスペースだけビルド（全部は build。tsc が通っても Vite で落ちることがある）
npm run verify:ui        # 画面を変えたとき。実ブラウザで書体・地の色・桁揃い・横はみ出し・タップ領域を実測
```

**手元で通してから push** してください。CI とデプロイを待つより手元の数十秒のほうが早く直せます。
`verify:ui` は最初に書体を `.cache/google-fonts/` に取り置きします（`npm run verify:font` だけでも作れます）。

### `npm run lint` が機械で止めているもの

| 検査 | 何を止めるか | 直し方 |
| --- | --- | --- |
| `check-changelog.mjs` | 作業 PR が版番号を触った／`docs/changelog.d/` に下書きを置いていない | [docs/changelog.d/README.md](docs/changelog.d/README.md) |
| `check-file-size.mjs` | 1ファイル 400 行超（既存の超過は基準ファイルで凍結。新しく超えたら止まる） | 分割する。減らしたら `node scripts/check-file-size.mjs --update` で基準を締める（`--list` で超過一覧） |
| `check-shared-wiring.mjs` | `shared` の参照経路（`import` / 型 / CSS / Tailwind preset）のずれ | [shared/CLAUDE.md](shared/CLAUDE.md) |
| `check-ui-tokens.mjs` `check-tokens.mjs` `check-contrast-tokens.mjs` | Tailwind の生パレット・独自の角丸・トークンの不整合（既存の違反は基準で凍結） | 共通トークン・役割名に置き換える |
| `check-mobile-declared.mjs` | PC 専用にした画面を `pcOnlyScreens.ts` に理由つきで宣言していない | 宣言するか、スマホ対応する |
| `check-form-submit.mjs` `check-env-passthrough.mjs` | フォーム送信の作法・環境変数の受け渡し漏れ | スクリプト冒頭の説明を読む |
| `check-links.mjs` `check-md-links.mjs` | 画面内リンク・文書の相対リンクの切れ | リンク先を直す |
| `check-migration-numbers.mjs` | DB マイグレーション番号の重複 | 採番し直す |
| `check-fonts-vendored.mjs` | 同梱書体（LINE Seed JP）の欠け | `npm run fonts` |

### 守るもの（v4 の中核ルール）

縦の整列・金額表記は v4 の中核です（[docs/design/v4/_rules.md](docs/design/v4/_rules.md)）。部品は `shared/src/client/` にあります。

| 種類 | 使うもの |
| --- | --- |
| 画面の枠 | `<PageShell>` / `<PageHeader>` |
| 金額 | `<Money value={n} />` — `¥` と数字を別要素に分ける |
| 数字 | `<Num>` `<StatValue>` |
| 期間 | `<DateRange start end />` — 開始／`〜`／終了を別要素に分ける |
| 一覧の行 | `<Row>` `<RowMain>` `<RowSlot>` — 伸びるのは名前列だけ |
| バッジ・チップ | `<TableBadge label w={n}>` — 固定幅の枠に入れる（文字数で幅を変えない） |
| 知らせる・確認する | `notifySuccess` / `notifyApiError` / `confirmAction` |
| 読み込み中・空・エラー | `<SkeletonRows>` `<EmptyState>` `<ErrorPanel>` |
| 色 | `bg-card` `text-muted-foreground` 等の共通トークン |
| 文字の大きさ | `text-h1` `text-list` `text-sub` 等の型スケール（サイズ・行間・ウェイトが一体） |
| 太さ | `font-medium` / `font-semibold` を書かない（LINE Seed JP は 400/700/800 しか無い） |
| 角丸 | `rounded-card` `rounded-control` 等の役割名（`rounded-[Npx]` は書かない） |

`alert()` / `confirm()` / `¥{n.toLocaleString()}` / Tailwind の生パレット（`slate-800` 等）は使いません。

### 共通ライブラリ（`shared`）の参照のしかた

`@gmo-onair/shared/src/...` と書きます。相対パス（`../../shared/...`）で参照しないでください。
参照経路が4つあり、ずれると `shared` が二重に読み込まれて zustand のストアや React の context が2つできます。
新しいアプリを足すときの配線（`dependencies` の `"@gmo-onair/shared": "*"`・`vite.config.ts` の alias・`tsconfig.json` の paths）は
[shared/CLAUDE.md](shared/CLAUDE.md)。バージョン範囲は書かないこと（本番のビルドが落ちます）。

### CSS を書く場所

`html` / `body` / `#root` をアプリの `index.css` で触らないでください。高さ・書体・行間・タップ領域・印刷は
`shared/src/client/base.css` にまとまっています。アプリの `index.css` は先頭で `base.css` を import し、その下にアプリ固有の CSS だけを書きます。
画面のスクロールはシェルの中（`<main class="overflow-y-auto">`）が持ち、シェルの根は `h-screen` ではなく `h-full` です（iOS の `100vh` は URL バーを含む）。

### 画面を実装するときに読むもの

モックが v4 の正です（[docs/v4-plan.md](docs/v4-plan.md) の「大前提」）。読む順番は [docs/design/v4/README.md](docs/design/v4/README.md):
守る規律 `_rules.md` → 確定値 `_tokens.md` → 画面の項目名 `<アプリ>.md`（生成物） → レイアウトは `mockups/*.dc.html` をブラウザで開く。
v4 の画面と実装ファイルの対応は `docs/design/v4/mockups/github.md`。

### スマホ対応は必須

全画面がモバイルファースト前提です。375px 幅（iPhone SE 相当）で破綻しないこと、タップ領域は最低 44px。
PC 専用にする画面は `pcOnlyScreens.ts` に理由つきで宣言します。詳細は [CLAUDE.md](CLAUDE.md) の「UI/UX ポリシー」。

### テスト

- **画面のテストは書きません。** 見た目は `npm run verify:ui` が実ブラウザで測ります
- `shared/tests/` には**画面を見ても間違いに気づけない計算**（金額の丸め・支払期日・祝日・レイアウト計算など）だけを置きます（[shared/tests/README.md](shared/tests/README.md)）
- `server/tests/*-review.test.mjs` は認証・データ・Socket のレビューで見つけた境界を固定する試験です。`npm test` が両方を回します

### AI 機能を触るとき

会社方針「AI を使い捨てにしない」があります。AI 機能・MCP ツール・自動化を作る／変えるときは
`.claude/skills/ai-feedback-loop/` のスキルを使い、5条件の充足表を PR に出してください。AI が関与しない UI 修正・CRUD・デプロイには適用しません。

### DB マイグレーション

`server/src/shared/db/migrations/` に連番で足します。番号の重複は `npm run lint` が止めます。
マイグレーションの失敗はサーバーの起動を止める（本番も同じ）ので、`npm run verify:up` の実 Postgres で空 DB から通ることを確かめてください。

---

## 3. PR を出す

```bash
git push -u origin feature/<Issue番号>-<短い名前>
```

PR テンプレート（`.github/pull_request_template.md`）が自動で出ます。

- **タイトルは `種類(アプリ): 何をしたか`。** Squash マージで `main` の1コミットになるので、`git log --oneline` がそのまま機能の一覧になります
  - 種類: `feat`（足した）／`fix`（直した）／`chore`（設定・依存・CI）／`docs`（文書だけ）／`refactor`（作り替えた・動きは同じ）
  - 括弧: アプリのディレクトリ名か領域名（`sales` `finance` `calendar` `settings` `gpm` `equipment` `daily` `techops` `live` `shell` `shared`）。全体にかかるものは省略可
- **`docs/changelog.d/<枝の名前>.md` に載せたい文を1つ置く**（版番号は触らない。`npm run lint` が両方を見ます）
- 「検証したこと」は**実際にやったものだけ**チェックする。UI を変えたらスクリーンショット（before / after）
- `Closes #128` を書いておくと、マージで Issue が閉じます。1 PR = 1画面を目安に小さく保つ
- **Claude が PR を出したら、その場で `.claude/skills/pr-watch` で見張りを始める**（CI の失敗とレビュー指摘をマージまで片づける）

CI（`checks` = 型・Lint・テスト・版の整合／`build` = Docker ビルド）が緑になったら **Squash and merge**。
マージすると検証環境（dev.gmo-onair.jp）に自動デプロイされ、ブランチは自動で消えます。
**マージしたら `npm run reviews:debt` でレビュー指摘を棚卸しへ移します**（[docs/branching.md](docs/branching.md)）。

---

## 4. リリース（本番に出す）

本番（gmo-onair.jp）に出るのは **GitHub で Release を公開したときだけ**です。利用者の明示的な指示があるときだけ行います。

1. `main` が検証環境で問題ないことを確かめる
2. `release/<版>` の枝で `npm run release:notes -- X.Y.Z` を実行し、PR を出してマージする（`package.json`・`CLAUDE.md`・`README.md` の版はこのコマンドが更新し、`npm run check:version` が一致を検査します。各ワークスペースの `package.json` は触りません）
3. GitHub の **Releases → Draft a new release**（タグ `vX.Y.Z`・ターゲット `main`・本文はその版の変更点）→ **Publish release**
4. `production` 環境の承認を通すと本番デプロイが走る。出たらバージョン番号とデプロイ先を報告する

版はパッチ（`4.6.10` → `4.6.11`）を1つずつ上げます。メジャー・マイナーは依頼があったときだけ。
手順の全部と戻し方は [docs/branching.md](docs/branching.md)、仕組みは [docs/deploy-pipeline.md](docs/deploy-pipeline.md)。

---

## やってはいけないこと

- `.env` や認証情報のコミット、API キー・JWT シークレットのハードコード
- 本番 DB への直接 SQL 操作（管理者パスワードリセット等の緊急時のみ）
- 本番 DB と検証 DB の相互参照・相互コピー（`onair_prod` / `onair_dev` は完全分離）。本番の秘密情報を検証環境で使うこと
- 利用者の明示的な指示なしに本番リリースを公開すること
- `main` への直接 push・force push、`v*` タグの打ち直し
- 作業 PR で版番号を上げること

---

## 困ったとき

| 症状 | 見るところ |
| --- | --- |
| CI が落ちた | Actions のログ。`checks` = 型／Lint／テスト／版の整合、`build` = Docker ビルド。読み方は [pr-watch の ci-jobs.md](.claude/skills/pr-watch/references/ci-jobs.md) |
| 検証環境が 502 | Deploy ログの末尾に nginx / app_dev の診断が出ます |
| 本番に何が出ているか分からない | Releases の一番上のタグ。`curl -s https://gmo-onair.jp/health` |
| 戻したい | [docs/deploy-pipeline.md](docs/deploy-pipeline.md) の「戻し方」 |
| GitHub 側の設定を変えたい | [docs/ops/github-repo-settings.md](docs/ops/github-repo-settings.md) |
| VPS の中を見たい | [docs/ops/vps-setup.md](docs/ops/vps-setup.md) |
