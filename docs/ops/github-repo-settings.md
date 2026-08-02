# GitHub リポジトリの設定

ファイルとして置ける設定（CI・PR/Issue テンプレート・CODEOWNERS・Dependabot）は
リポジトリの中に入っています。**ここに書くのは GitHub 側にしか置けない設定**です。

適用は1コマンド（冪等・何度でも流せる）:

```bash
gh auth login                                  # 一度だけ (admin 権限のあるアカウント)
bash scripts/github/apply-repo-settings.sh --dry-run   # 何をするか見る
bash scripts/github/apply-repo-settings.sh             # 適用
```

---

## 移行手順（2026-07-31 の切り替え / 一度だけ）

**順番を守ってください。** 3 → 4 を先にやると検証環境へのデプロイ経路が無くなります。

| # | やること | コマンド / 場所 |
| --- | --- | --- |
| 0 | **デフォルトブランチを `main` にする** | [Settings → General → Default branch](https://github.com/terai-takehiro/gmo-onair/settings) |
| 1 | この変更（新しい CI・デプロイ・ドキュメント）を `main` にマージする | PR をマージ |
| 2 | 検証環境が新しい経路で出ることを確かめる | Actions の `Deploy` → `curl -s https://dev.gmo-onair.jp/health` |
| 3 | 旧ブランチを整理する（`archive/*` タグ + `v3.1.5` タグ + `claude/*` 40本 + `dev` の削除） | `bash scripts/github/cleanup-legacy-branches.sh --dry-run` → 本実行 |
| 4 | 分岐保護・環境・ラベルを入れる | `bash scripts/github/apply-repo-settings.sh` |
| 5 | `production` 環境の承認者を設定する | [Settings → Environments](https://github.com/terai-takehiro/gmo-onair/settings/environments) |
| 6 | VPS の worktree を確認する | 下記「VPS 側の確認」 |

`cleanup-legacy-branches.sh` は**`main` に `ci.yml` が入っているかを見てから** `dev` を消すので、
1 を飛ばして 3 を流しても `dev` は残ります（`claude/*` の整理とタグ付けだけ進みます）。
`dev` と `main` がずれている場合も `dev` は消しません。

### なぜ 0 が最初なのか

**このリポジトリのデフォルトブランチは長らく `dev` でした。** `main` に切り替えないと、
気づきにくい形で3つ壊れます。

| 壊れるもの | どう壊れるか |
| --- | --- |
| **分岐保護** | ruleset の `~DEFAULT_BRANCH` が `main` ではなく **`dev` を保護**する。しかも「作成しました」と成功したように見える |
| **手動実行** | `workflow_dispatch` は**デフォルトブランチにあるワークフローしか呼べない**。`main` にしか無い Preview / 新 Deploy を Actions の画面から実行できない（実際に 404 になりました） |
| **ブランチ削除** | デフォルトブランチは削除できないので、`dev` を消せない |

このほか、PR を作るときの base の既定値も `dev` のままになります。

`apply-repo-settings.sh` は最初にデフォルトブランチを `main` に変えるので、
スクリプトを流せばここも一緒に直ります。ruleset の対象は `~DEFAULT_BRANCH` ではなく
**`refs/heads/main` と明示**してあるので、万一デフォルトが違っていても `main` が保護されます。

### VPS 側の確認

新しい `deploy.yml` は worktree を**ブランチではなくコミットで detached checkout** します
（タグからでもブランチからでも同じ手順で出せるようにするため）。初回のデプロイ後に:

```bash
ssh <VPS>
cd /root/gmo-onair-dev && git log --oneline -1 && git status | head -2   # detached HEAD になっているはず
cd /root/gmo-onair     && git log --oneline -1
docker compose -p gmo-onair ps
```

`dev` ブランチを消しても worktree は壊れません（ローカルの `dev` ブランチが残るだけで、
デプロイはそれを参照しなくなります）。

---

## 何を設定しているか

### 1. マージ方法

| 設定 | 値 | 理由 |
| --- | --- | --- |
| Squash merge | **許可** | 1つの PR = `main` の1コミット。途中の「typo 修正」が履歴に残らない |
| Merge commit | **禁止** | 3つ選べる状態だと人によって履歴の形が変わる |
| Rebase merge | **禁止** | 同上 |
| Squash 時のタイトル | PR のタイトル | コミットメッセージを別に考えなくてよい |
| マージ後にブランチを削除 | **ON** | **これが無かったので `claude/*` が 41 本溜まった** |
| Auto-merge | 許可 | CI が緑になった瞬間にマージできる（待たなくてよい） |

### 2. 分岐保護（ruleset）

旧来の branch protection ではなく **ruleset** を使っています（タグも同じ仕組みで守れるため）。

| ruleset | 対象 | 効果 |
| --- | --- | --- |
| `main` | デフォルトブランチ | 削除禁止 / force push 禁止 / **PR 必須** / **CI 必須**（`checks` `build`）/ Squash のみ / 未解決コメントがあるとマージ不可 / 最新の main に追いついていないとマージ不可 |
| `release-branches` | `release/*` | 削除禁止 / force push 禁止 / PR 必須 |
| `release-tags` | `v*` タグ | 削除・打ち直し禁止 |
| `archive-tags` | `archive/*` タグ | 削除・打ち直し禁止 |

**承認レビュー数は 0** にしています。いまは実質1人体制で、自分の PR には自分で承認を
付けられないため、1 以上にすると自分の PR がマージできなくなります。
**人が増えたら 1 に上げてください**（`apply-repo-settings.sh` の
`required_approving_review_count` を `1` にして流し直すだけ）。

> **緊急時**: リポジトリ管理者は ruleset をバイパスできます（PR 画面に
> 「管理者としてマージ」が出ます）。使ったら PR に理由を残してください。

#### 必須チェックの名前について

必須チェックの `context` は `.github/workflows/ci.yml` の**ジョブ ID そのまま**です。

```
checks   → 型チェック / Lint / 整合性検査 / バージョン表記の整合
build    → Docker イメージのビルド (本番と同じ経路)
```

**ci.yml のジョブ ID を変えたら、このスクリプトも同時に変えてください。**
名前が食い違うと ruleset は「そのチェックがまだ来ていない」ではなく
**「そんなチェックは無い」として静かに通してしまいます**。
ジョブに日本語の `name:` を付けていないのはこのためです。

### 3. 環境（Environments）

| 環境 | URL | 承認 |
| --- | --- | --- |
| `staging` | https://dev.gmo-onair.jp | なし（`main` にマージされたら自動で出る） |
| `production` | https://gmo-onair.jp | **必須**（Release を公開しても一度止まる） |

`production` の承認者（Required reviewers）は **API から設定できないので画面で**指定します:

<https://github.com/terai-takehiro/gmo-onair/settings/environments> → `production` →
**Required reviewers** に自分を追加。

これで「誰がいつ本番に出したか」が GitHub の Deployments に残ります。
CLAUDE.md の「利用者の明示的な指示なしに本番へ出さない」を、口約束ではなく
**仕組みで**担保するのがこの設定の目的です。

### 4. ラベル

`type:*`（何の作業か）と `area:*`（どのブロックアプリか）の2軸。
`area:` があると「Qシートの残作業」を一覧で出せます。

`area:shared` だけ色を変えています（`shared/` は**全アプリに効く**ため）。

---

## 手で設定するもの（API から入れられない / 入れるべきでないもの）

### Actions の権限

<https://github.com/terai-takehiro/gmo-onair/settings/actions>

- **Workflow permissions**: `Read repository contents and packages permissions`
  （書き込みは必要なジョブが `permissions:` で個別に宣言しています）
- **Allow GitHub Actions to create and approve pull requests**: **OFF**
  （ON だと CI 自身が PR を承認できてしまい、必須レビューの意味が消えます）

### Secrets

デプロイに必要な secret（既に設定済み）:

| 名前 | 用途 |
| --- | --- |
| `VPS_HOST` | CoNoHa VPS のホスト |
| `VPS_USER` | SSH ユーザー |
| `VPS_SSH_KEY` | デプロイ用の秘密鍵 |

`GITHUB_TOKEN` はワークフロー実行中だけ有効な一時トークンで、GHCR の認証に使っています
（追加の secret は不要）。

### Secret scanning / Push protection

<https://github.com/terai-takehiro/gmo-onair/settings/security_analysis>

- **Secret scanning**: ON
- **Push protection**: ON — API キーを含むコミットを push した時点で止めます

`.env` は `.gitignore` 済みですが、これは「うっかり別のファイルに書いた」を止めるためです。

---

## 変えたときの注意

このリポジトリの設定は**リポジトリの中のファイルと連動**しています。
片方だけ変えると静かに壊れます。

| 変えたもの | 一緒に変えるもの |
| --- | --- |
| `ci.yml` のジョブ ID | `apply-repo-settings.sh` の `required_status_checks` |
| デプロイの引き金（`deploy.yml` の `on:`） | `docs/branching.md`、`CONTRIBUTING.md` |
| 環境名（`staging` / `production`） | `deploy.yml` の `environment:` |
| ブランチの命名規則 | `docs/branching.md`、`ISSUE_TEMPLATE/config.yml` のリンク |
