# ブランチ運用とリリース

このリポジトリは **GitHub Flow**（GitHub が公開している最も一般的なブランチ運用）に、
リリースタグによる本番デプロイを足した形で回しています。
特別な流派も社内独自ルールもありません。**他のプロジェクトから来た人がそのまま働ける形**が目的です。

---

## 覚えることは3つだけ

1. **長く残るブランチは `main` だけ。** ここが唯一の正。
2. **作業は必ず `main` から短いブランチを切って、PR で `main` に戻す。** 直接 push はできません。
3. **本番に出るのは、GitHub で Release を公開したときだけ。** `main` にマージしても本番には出ません（検証環境に出ます）。

---

## ブランチの種類

| ブランチ | 役割 | 寿命 |
| --- | --- | --- |
| **`main`** | 唯一の正。常に「次に出せる状態」。**直接 push 禁止**（PR のみ） | ずっと |
| **`feature/<名前>`** | 機能の追加・作り替え | 数日。マージしたら自動で消える |
| **`fix/<名前>`** | 不具合の修正 | 同上 |
| **`chore/<名前>`** | 設定・依存更新・CI などの雑務 | 同上 |
| **`docs/<名前>`** | ドキュメントだけの変更 | 同上 |
| **`release/v3`** | v3 系の保守専用（**凍結済み**。本番を止めない緊急修正だけ） | v4 が本番に出るまで |

ブランチ名は **Issue 番号を頭に付ける**と、何のための作業か一覧で分かります。

```
feature/128-quote-line-reorder
fix/141-calendar-duplicate
chore/155-dependabot
```

> **`claude/*` について**: Claude Code の Web セッションが自動で作るブランチ名です。
> そのまま PR を出して構いません（マージ時に消えます）。
> **大事なのは名前より寿命** — 数日以内に PR にして、放置しないこと。
> 放置されたブランチが 41 本溜まって、どれが生きているか誰にも分からなくなったのが
> この運用を作り直した直接の理由です。

---

## 全体の流れ

```
                                       ┌── PR (検査が通らないとマージできない)
                                       │
  feature/128-xxx  ●───●───●───────────┤
                  ╱                    ▼
main ────────────●─────────────────────●──────────●───────────────●────────►
                                       │          │               │
                                       │          │             ● tag v4.0.1
                                       ▼          ▼               │
                              ┌─────────────────────────┐        ▼
                              │ 検証環境                │   ┌──────────────┐
                              │ dev.gmo-onair.jp        │   │ 本番          │
                              │ (main にマージ = 自動)  │   │ gmo-onair.jp │
                              └─────────────────────────┘   │ (Release 公開)│
                                                            └──────────────┘

release/v3 ──●──────────────────────────────────────────────────────────────►
             │  v3 の緊急修正だけ。タグ v3.x.y を打つと本番に出る
             ▼  (v4 が本番に出たら、このブランチは畳む)
```

**ポイント**: 「検証環境に出す」と「本番に出す」が**別の操作**になりました。
以前は本番に出すために `dev` ブランチを `main` にマージしていましたが、
その結果 `main` と `dev` の中身が常に同じになり、ブランチを2本持つ意味が無くなっていました。

---

## 日々の手順

### 1. Issue を立てる

作業の前に Issue を立てます。**1 Issue = 1 ブランチ = 1 PR**。
大きい話は親 Issue を立てて、中を子 Issue（"Create sub-issue"）に割ってください。

### 2. ブランチを切る

```bash
git switch main
git pull origin main            # 必ず最新から切る
git switch -c feature/128-quote-line-reorder
```

### 3. 作る・確かめる

```bash
npm run typecheck               # 7クライアント + server の型
npm run lint                    # UIトークン検査 + eslint
npm run build                   # 本番と同じビルド経路
npm run verify:up               # 検証用の Postgres を立てる (scripts/dev-verify/)
```

### 4. PR を出す

```bash
git push -u origin feature/128-quote-line-reorder
```

PR のテンプレートが自動で出ます。**検証したことのチェックは、実際にやったものだけ**付けてください。

### 5. マージ

CI（型チェック・Lint・バージョン整合・Docker ビルド）が緑になったらマージできます。

- **マージ方法は Squash 固定**。1つの PR が `main` の1コミットになります
  （途中の「typo 修正」「lint 直し」が履歴に残らない）。
- マージすると**ブランチは自動で消えます**。手で消す必要はありません。
- マージした瞬間に**検証環境（dev.gmo-onair.jp）へ自動デプロイ**されます。

### 6. 検証環境で確かめる

```bash
curl -s https://dev.gmo-onair.jp/health
```

---

## 昔の版を検証環境で見る

「あの頃の画面を実物で見たい」ときは **Actions → Preview → Run workflow**。
コミット / タグ / ブランチを1つ入れると、そのコードが検証環境
（dev.gmo-onair.jp）に出ます。

- **本番には出ません。** 出せる先は検証環境だけで、入力自体がありません
- **検査は通しません。** 古いコードには今の検査スクリプト（`typecheck` /
  `check:version` など）が存在せず、通しようがないためです。出るのは既に一度
  リリースされたコードなので、ここでは検査しません
- **VPS の worktree を動かしません。** イメージを差し替えて `app_dev` を作り直す
  だけなので、nginx やリバースプロキシに影響しません

**元に戻す**: Actions → Deploy → Run workflow → Branch `main` / target `staging`
（`main` にマージがあれば自動的にも戻ります）

### 覚えておくと便利な位置

| ref | 何の版か |
| --- | --- |
| `c3607a94` | **v2.9.250** — UI/UX 刷新が始まる直前。いわゆる「旧UI」の最後 |
| `0a9d86f0` | v2.9.248 — 改革 Phase 3（AI改善ループが閉じた） |
| `v3.1.5` | v3 の凍結時点（本番で動いていたコード） |

> 旧UI を検証環境で動かすと、検証 DB は**現行のスキーマのまま**（マイグレーションは
> 前方向にしか進まないため）。旧コードは知らない列を無視するだけなので起動は通りますが、
> **旧コードで保存すると新しい列の値は落ちます**。検証環境なので問題ありませんが、
> 本番で同じことをする場合の注意点でもあります。

---

## 本番に出す（リリース）

本番デプロイは**リリースを公開したときだけ**走ります。

1. `main` が検証環境で問題ないことを確認する
2. バージョンを上げる PR を出す（[CONTRIBUTING.md「リリースの出し方」](../CONTRIBUTING.md#リリースの出し方) の3か所）
3. その PR をマージする
4. GitHub の **Releases → Draft a new release**
   - タグ: `v4.0.1`（`package.json` の version と同じ番号に `v` を付ける）
   - ターゲット: `main`
   - タイトル・本文: そのバージョンの変更点
5. **Publish release** を押す → 本番デプロイが始まる
   - `production` 環境に承認を設定していれば、ここで一度止まって承認待ちになります

### 戻したいとき

Releases に過去のタグが全部並んでいるので、**1つ前のタグの Deploy を再実行**すれば戻ります。
コンテナイメージも `ghcr.io/terai-takehiro/gmo-onair:v4.0.0` のように
タグごとに残っているので、VPS 側で直接差し替えることもできます
（[docs/deploy-pipeline.md](deploy-pipeline.md) 参照）。

---

## v3 の緊急修正

v3 は **`release/v3` ブランチ + `v3.1.5` タグ**で凍結しました。
本番が止まるような不具合が出たときだけ触ります。

```bash
git switch -c fix/v3-なにか origin/release/v3
# 直す
git push -u origin fix/v3-なにか
# → PR の base を release/v3 にする
```

マージしたら `release/v3` に `v3.1.6` のタグでリリースを作れば本番に出ます。

**同じ不具合が v4 にもあるなら、`main` 向けに別の PR を出してください。**
`release/v3` を `main` にマージしてはいけません（v3 のコードが v4 に混ざります）。

---

## やってはいけないこと

- **`main` への直接 push**（ruleset で止まります）
- **`main` / `release/v3` への force push**（履歴が消えます。ruleset で止まります）
- **`v*` タグの打ち直し・削除**（本番に何が出たかの記録そのもの。ruleset で止まります）
- **ユーザーの明示的な指示なしに本番リリースを公開すること**
- **PR を出さずに検査を飛ばすこと**（型エラーが検証環境に出てから気づく形に戻ります）

---

## 以前の運用との対応

| 以前 | いま |
| --- | --- |
| `dev` ブランチに push → 検証環境 | `main` に PR がマージされる → 検証環境 |
| `dev` を `main` にマージ → 本番 | GitHub で Release を公開（タグ `vX.Y.Z`）→ 本番 |
| `main` = 本番のコード | `main` = 次に出せるコード。**本番はタグが指す** |
| `master`（ミラー） | 廃止（v2.5.3 で実体は消えていたがドキュメントに残っていた） |
| `claude/*` を消さずに溜める | マージ時に自動削除 |
| タグ・リリースなし | リリースごとに `vX.Y.Z` タグ + GitHub Release |
| 検査は push した後 | 検査は PR のマージ前（必須チェック） |

### 2026-07-31 に整理したブランチ

`claude/*` 40 本と `dev` を削除しました。うち **`main` に入っていない作業を持つ 7 本は
`archive/2026-07-31/*` タグに退避**してあるので、いつでもブランチに戻せます。

```bash
git fetch origin --tags
git tag -n99 -l 'archive/*'                              # 何が退避されているか読む
git switch -c feature/accounting-import \
  archive/2026-07-31/accounting-import-phase1            # 戻す
```

| タグ | 中身 | `main` に入っているか |
| --- | --- | --- |
| `accounting-import-phase1` | 経理データ取込 Phase 0/1（旧 PR #28） | **入っていない**。migration 087 が現在の `main` と番号衝突するので付け替えが必要 |
| `presentation-deck` | 社長プレゼン資料（pptx 25枚 + 画面画像） | **入っていない** |
| `vps-bootstrap-scripts` | VPS 構築スクリプト3本 + DEPLOY_CONOHA.md 全面版 | **入っていない** |
| `interactive-awards-link` | インタラクティブ ↔ 表彰CG 連携 API | 別 VPS に切り出したため当時のコードは無い |
| `interactive-split-out` | 切り出し当時の `client-interactive` | 切り出し自体は反映済み |
| `qsheet-csv-import-v2.9.166` | Qシート CSV インポート | `main` がより新しい形で含む |
| `calendar-relink-hotfix` | カレンダー再連携の修正 | `main` が同内容を含む |

整理そのものは `scripts/github/cleanup-legacy-branches.sh` に残してあります（何を消したかが
SHA まで読める形になっています）。

---

## 関連

- [CONTRIBUTING.md](../CONTRIBUTING.md) — 環境構築から PR までの手順、リリースの出し方
- [docs/deploy-pipeline.md](deploy-pipeline.md) — デプロイの中身（GHCR・キャッシュ・ロールバック）
- [docs/ops/github-repo-settings.md](ops/github-repo-settings.md) — GitHub 側の設定（分岐保護・環境・ラベル）
