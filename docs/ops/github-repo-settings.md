# GitHub リポジトリの設定

**最終確認: 2026-09-08（v4.6.10）。** 一次情報は `scripts/github/apply-repo-settings.sh`・`.github/workflows/ci.yml`・`.github/workflows/deploy.yml`。

ファイルとして置ける設定（CI・PR/Issue テンプレート・CODEOWNERS・Dependabot）はリポジトリの `.github/` に入っている。
**ここに書くのは GitHub 側にしか置けない設定**で、`apply-repo-settings.sh` が1コマンドで適用する（冪等・何度でも流せる）:

```bash
gh auth login                                          # 一度だけ (admin 権限のあるアカウント)
bash scripts/github/apply-repo-settings.sh --dry-run   # 何をするか見る
bash scripts/github/apply-repo-settings.sh             # 適用
```

> 2026-07-31 の切り替え（デフォルトブランチ `dev` → `main`・旧ブランチ 41 本の整理・`Cleanup branches` ワークフロー）は実施済み。
> 当時の手順は [../archive/2026/github-repo-settings-migration-2026-07-31.md](../archive/2026/github-repo-settings-migration-2026-07-31.md)。

---

## 何を設定しているか（`apply-repo-settings.sh` の順）

### 0. デフォルトブランチ

`main`。スクリプトが最初に確かめて、違えば変える。ここが違うと `workflow_dispatch`（Deploy / Preview の手動実行）が
そのブランチのワークフローしか呼べず、PR の base の既定値も変わる。

### 1. マージ方法

| 設定 | 値 | 理由 |
| --- | --- | --- |
| Squash merge | **許可** | 1つの PR = `main` の1コミット。途中の「typo 修正」が履歴に残らない |
| Merge commit / Rebase merge | **禁止** | 3つ選べる状態だと人によって履歴の形が変わる |
| Squash 時のタイトル・本文 | PR のタイトル・本文（`PR_TITLE` / `PR_BODY`） | コミットメッセージを別に考えなくてよい |
| マージ後にブランチを削除 | **ON** | これが無くて `claude/*` が 41 本溜まった |
| Auto-merge | 許可 | CI が緑になった瞬間にマージできる |
| Issues / Projects | ON | — |

### 2. 分岐保護（ruleset）

旧来の branch protection ではなく **ruleset**（タグも同じ仕組みで守れるため）。

| ruleset | 対象 | 効果 |
| --- | --- | --- |
| `main` | `refs/heads/main`（`~DEFAULT_BRANCH` ではなく**明示**。既定ブランチがずれていても `main` が守られる） | 削除禁止 / force push 禁止 / **PR 必須** / **必須チェック `checks` `build`**（strict: 最新の `main` に追いついていないとマージ不可） / Squash のみ / 未解決のレビュースレッドがあるとマージ不可 / 新しい push で古い承認を無効化 |
| `release-branches` | `refs/heads/release/*` | 削除禁止 / force push 禁止 / PR 必須（Squash のみ）。`release/v3` は畳んだが ruleset は残している |
| `release-tags` | `refs/tags/v*` | 削除・更新・打ち直し禁止（「本番に何が出たか」の記録そのもの） |
| `archive-tags` | `refs/tags/archive/*` | 同上（消したブランチの退避先） |

**承認レビュー数は 0。** 実質1人体制で、自分の PR に自分で承認を付けられないため。人が増えたら
`apply-repo-settings.sh` の `required_approving_review_count` を `1` にして流し直す。

緊急時はリポジトリ管理者が ruleset をバイパスできる（PR 画面の「管理者としてマージ」）。使ったら PR に理由を残す。

#### 必須チェックの名前

必須チェックの `context` は `.github/workflows/ci.yml` の**ジョブ ID そのまま**:

| context | 中身 |
| --- | --- |
| `checks` | 型チェック / Lint / テスト / 共通コードの乖離 / バージョン表記 / UI トークン / npm audit / スクレイパーの Python 検査 |
| `build` | Docker イメージのビルド（本番と同じ経路） |

名前が食い違うと ruleset は「まだ来ていない」ではなく**「そんなチェックは無い」として静かに通す**。
ジョブに日本語の `name:` を付けていないのはこのため。

### 3. 環境（Environments）

| 環境 | URL | 承認 |
| --- | --- | --- |
| `staging` | https://dev.gmo-onair.jp | なし（`main` にマージされたら自動で出る） |
| `production` | https://gmo-onair.jp | **Required reviewers を画面で設定する**（API からは入れられない）。設定してあれば Release を公開しても一度止まり、誰が本番に出したかが Deployments に残る |

### 4. ラベル

`type:*`（何の作業か）と `area:*`（どのブロックアプリか）の2軸に、`priority:*` と `ai-feedback-loop`。
`area:shared` だけ色を変えている（`shared/` は全アプリに効くため）。

| 種類 | ラベル |
| --- | --- |
| `type:` | `bug` `feature` `user-request` `chore` `docs` |
| `area:` | `projects` `qsheet` `equipment` `live` `awards` `daily` `server` `shared` `ci` `deps` |
| その他 | `priority:urgent` `priority:high` `ai-feedback-loop` |

> ⚠️ 要確認: スクリプトの説明文が `area:qsheet` = `client-qsheet/`（現 `client-techops/`）、`area:awards` = リアルタイムCG（廃止済み）のまま。ラベル名を変えるか説明だけ直すかは人の判断。

---

## 手で設定するもの（API から入れられない / 入れるべきでないもの）

| 場所 | 設定 |
| --- | --- |
| [Settings → Environments](https://github.com/terai-takehiro/gmo-onair/settings/environments) → `production` | **Required reviewers** に承認者を追加 |
| [Settings → Actions → General](https://github.com/terai-takehiro/gmo-onair/settings/actions) | Workflow permissions: `Read repository contents and packages permissions`（書き込みは必要なジョブが `permissions:` で個別に宣言する。`ci.yml` の `build` = `packages: write`、`cleanup-branches.yml` = `contents: write`）。**Allow GitHub Actions to create and approve pull requests: OFF**（ON だと CI 自身が PR を承認できる） |
| Settings → Secrets and variables → Actions | `VPS_HOST`（CoNoHa VPS のホスト）/ `VPS_USER`（SSH ユーザー）/ `VPS_SSH_KEY`（デプロイ用の秘密鍵）。`GITHUB_TOKEN` は実行中だけ有効な一時トークンで GHCR の認証に使う（追加の secret は不要） |
| [Settings → Code security](https://github.com/terai-takehiro/gmo-onair/settings/security_analysis) | Secret scanning: ON / Push protection: ON（API キーを含むコミットを push した時点で止める。`.env` は `.gitignore` 済みだが「うっかり別のファイルに書いた」を止める） |

---

## 変えたときの注意

設定は**リポジトリの中のファイルと連動**している。片方だけ変えると静かに壊れる。

| 変えたもの | 一緒に変えるもの |
| --- | --- |
| `ci.yml` のジョブ ID | `apply-repo-settings.sh` の `required_status_checks` |
| デプロイの引き金（`deploy.yml` の `on:`） | [../branching.md](../branching.md)・[../../CONTRIBUTING.md](../../CONTRIBUTING.md)・[../deploy-pipeline.md](../deploy-pipeline.md) |
| 環境名（`staging` / `production`） | `deploy.yml` と `preview.yml` の `environment:` |
| ブランチの命名規則 | [../branching.md](../branching.md)・`.github/ISSUE_TEMPLATE/config.yml` のリンク |
| secrets の名前（`VPS_*`） | `deploy.yml`・`preview.yml` の両方 |

## 関連ファイル

| ファイル | 役割 |
| --- | --- |
| `scripts/github/apply-repo-settings.sh` | 上記の適用（冪等） |
| `scripts/github/cleanup-legacy-branches.sh`・`.github/workflows/cleanup-branches.yml` | 2026-07-31 の旧ブランチ整理（実施済み。何を消したかが SHA まで読める） |
| `.github/CODEOWNERS`・`.github/dependabot.yml`・`.github/pull_request_template.md`・`.github/ISSUE_TEMPLATE/` | ファイルとして置ける設定 |
