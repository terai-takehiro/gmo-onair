# GitHub リポジトリ設定の移行手順（2026-07-31 の切り替え / 一度だけ）

> **記録用（2026-09-08 に `docs/ops/github-repo-settings.md` から当時の文面をそのまま移した）。** デフォルトブランチを `dev` から `main` に切り替え、旧ブランチを整理し、分岐保護を入れた一度きりの手順。実施済みで、いまの設定の説明は [docs/ops/github-repo-settings.md](../../ops/github-repo-settings.md)。

## 移行手順（2026-07-31 の切り替え / 一度だけ）

**順番を守ってください。** 3 → 4 を先にやると検証環境へのデプロイ経路が無くなります。

| # | やること | コマンド / 場所 |
| --- | --- | --- |
| 0 | **デフォルトブランチを `main` にする** | [Settings → General → Default branch](https://github.com/terai-takehiro/gmo-onair/settings) |
| 1 | この変更（新しい CI・デプロイ・ドキュメント）を `main` にマージする | PR をマージ |
| 2 | 検証環境が新しい経路で出ることを確かめる | Actions の `Deploy` → `curl -s https://dev.gmo-onair.jp/health` |
| 3 | 旧ブランチを整理する（`archive/*` タグ + `v3.1.5` タグ + `claude/*` 40本 + `dev` の削除） | **Actions → Cleanup branches**（`mode = dry-run` → `execute` + `confirm = cleanup`）／手元からなら `bash scripts/github/cleanup-legacy-branches.sh --dry-run` → 本実行 |
| 4 | 分岐保護・環境・ラベルを入れる | `bash scripts/github/apply-repo-settings.sh` |
| 5 | `production` 環境の承認者を設定する | [Settings → Environments](https://github.com/terai-takehiro/gmo-onair/settings/environments) |
| 6 | VPS の worktree を確認する | 下記「VPS 側の確認」 |

`cleanup-legacy-branches.sh` は**`main` に `ci.yml` が入っているかを見てから** `dev` を消すので、
1 を飛ばして 3 を流しても `dev` は残ります（`claude/*` の整理とタグ付けだけ進みます）。
`dev` と `main` がずれている場合も `dev` は消しません。

> **タグを Releases 画面から作らないでください。** GitHub の画面でタグを作る入口は Releases だけで、
> Release を**公開**すると `deploy.yml` の `release: types: [published]` が発火し、
> **そのタグの中身が本番に出ます**。`v3.1.5`（本番未投入）や `archive/*`（古い作業ブランチ）を
> 本番に出すことになるので使えません。`Cleanup branches` ワークフローはタグを push するだけで
> Release を作らないため、本番は動きません。

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

