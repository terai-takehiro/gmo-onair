# ブランチ運用とリリース

GitHub Flow に、リリースタグによる本番デプロイを足した形。社内独自のルールは無く、
**他のプロジェクトから来た人がそのまま働ける形**が目的。

- 経緯（2026-07-31 の整理・以前の運用との対応・実測の背景）は
  [archive/2026/branching-migration-2026-07-31.md](archive/2026/branching-migration-2026-07-31.md)
- エンジニアでない人向けの説明は [guide/how-changes-ship.md](guide/how-changes-ship.md)

---

## 覚えることは3つだけ

1. **長く残るブランチは `main` だけ。** ここが唯一の正。
2. **作業は `main` から短い枝を切り、PR で `main` に戻す。** 直接 push はできない。
3. **本番に出るのは、GitHub で Release を公開したときだけ。** `main` へのマージは検証環境
   （dev.gmo-onair.jp）に出る。

---

## ブランチの種類

| ブランチ | 役割 | 寿命 |
| --- | --- | --- |
| `main` | 唯一の正。常に「次に出せる状態」。**直接 push 禁止**（PR のみ・ruleset で止まる） | ずっと |
| `feature/<Issue番号>-<短い名前>` | 機能の追加・作り替え | 数日。マージで自動削除 |
| `fix/<Issue番号>-<短い名前>` | 不具合の修正 | 同上 |
| `chore/<短い名前>` | 設定・依存更新・CI などの雑務 | 同上 |
| `docs/<短い名前>` | 文書だけの変更 | 同上 |
| `release/<版>`（例 `release/4.6.10`） | リリースの版上げ PR 専用。`check-changelog.mjs` が版の変更を許す枝 | 数時間 |
| `claude/<内容>-<乱数>` | Claude Code の Web セッションが自動で付ける名前。そのまま PR にしてよい。リリース作業なら `claude/release-…` にする | 数日。放置しない |

- 名前より寿命。**数日以内に PR にして消す。**
- 命名例: `feature/128-quote-line-reorder`・`fix/141-calendar-duplicate`・`chore/155-dependabot`
- ⚠️ 要確認: `release/*` は ruleset `release-branches`（削除禁止・v3 保守枝のために作ったもの）の
  対象でもあり、マージ後の自動削除と衝突する。2026-09-08 時点でリモートに `release/4.4.9`・
  `release/4.6.5` が残っている。手で消すか ruleset の対象を見直すか、人の判断が要る。

---

## 全体の流れ

```
                                       ┌── PR (必須チェックが通らないとマージできない)
                                       │
  feature/128-xxx  ●───●───●───────────┤
                  ╱                    ▼
main ────────────●─────────────────────●──────────●───────────────●────────►
                                       │          │               │
                                       │          │             ● tag vX.Y.Z
                                       ▼          ▼               │
                              ┌─────────────────────────┐        ▼
                              │ 検証環境                │   ┌──────────────┐
                              │ dev.gmo-onair.jp        │   │ 本番          │
                              │ (main にマージ = 自動)  │   │ gmo-onair.jp │
                              └─────────────────────────┘   │ (Release 公開)│
                                                            └──────────────┘
```

「検証環境に出す」（`main` にマージ）と「本番に出す」（Release 公開）は別の操作。
どちらも `.github/workflows/deploy.yml` が `ci.yml` を `needs` で通してから出すので、検査に落ちた
コードはデプロイされない。仕組みの中身は [deploy-pipeline.md](deploy-pipeline.md)。

---

## 日々の手順

### 1. Issue を立てる

**1 Issue = 1 ブランチ = 1 PR。** 大きい話は親 Issue を立てて子 Issue（"Create sub-issue"）に割る。
テンプレートは `.github/ISSUE_TEMPLATE/`（不具合の報告・機能の追加・変更・利用者からの依頼）。

### 2. 枝を切る

```bash
git switch main && git pull origin main      # 必ず最新から切る
git switch -c feature/128-quote-line-reorder
```

### 3. 作る・手元で検査する

| コマンド | 何を見るか |
| --- | --- |
| `npm run typecheck` | 既定3アプリ + server の型。`shared/` を触ったら `npm run typecheck:all`（CI と同じ範囲） |
| `npm run lint` | eslint ＋ 検査（changelog の下書き・トークン・リンク・migration 番号ほか） |
| `npm run test` | shared の Vitest とサーバーの review テスト（CI も回す） |
| `npm run build:changed` | 変更したワークスペースだけビルド。本番と同じ経路を全部通すなら `npm run build` |
| `npm run verify:up` | 検証用 Postgres（ポート 5433）。DB を触ったら保存 → 読み直しまで確かめる |
| `npm run verify:ui` | 画面を触ったら。実ブラウザで書体・桁揃い・横はみ出しを実測 |

CI（`.github/workflows/ci.yml`）の `checks` はこれに加えて `node scripts/check-collab-parity.mjs`・
`npm run check:version`・`npm run check:ui-tokens`・`npm audit --omit=dev --audit-level=high`・
Python のスクレイパー検査を回し、`build` が Docker イメージを本番と同じ経路で組む。落ち方ごとの読み方は
[pr-watch の ci-jobs.md](../.claude/skills/pr-watch/references/ci-jobs.md)。

### 4. 下書きを1つ置く

`docs/changelog.d/<枝の名前>.md`（`/` は `-`）に、版の履歴に載せる文を書く。
版の番号は触らない（下の「版の番号は、作業 PR では取らない」）。

### 5. PR を出す

```bash
git push -u origin feature/128-quote-line-reorder
```

- テンプレート（`.github/pull_request_template.md`）が出る。「検証したこと」は**実際にやったものだけ**チェックする。
- **タイトルは `種類(アプリ): 何をしたか`**。種類は `feat` / `fix` / `chore` / `docs` / `refactor`、
  括弧はアプリのディレクトリ名か領域名（`sales` `finance` `calendar` `settings` `gpm` `equipment`
  `daily` `techops` `live` `shell` `shared`）。全体にかかるものは括弧を省いてよい。
  例: `feat(equipment): 機材台帳を v4 の見た目にした`。
- 本文に `Closes #128` を書くと、マージで Issue が閉じる。
- ⚠️ **Claude が PR を出したら、その場で `pr-watch` スキル
  （[.claude/skills/pr-watch/SKILL.md](../.claude/skills/pr-watch/SKILL.md)）で見張りを始める。訊かない。**
  「見張りますか」と返事を待つ間は、CI 失敗もレビューも誰も見ない。
  見張りを外す（`unsubscribe_pr_activity`）のはマージかクローズのときだけ。

### 6. マージ

- 必須チェック `checks` / `build` が緑で、未解決のレビュースレッドが無く、`main` に追いついていれば
  マージできる（ruleset `main`。設定の正は [ops/github-repo-settings.md](ops/github-repo-settings.md)）。
- **マージ方法は Squash 固定**（1 PR = `main` の1コミット。途中の「typo 修正」が履歴に残らない）。
  ⚠️ 要確認: 直近の PR（#655〜#662）は2親のマージコミットで `main` に入っており、
  `scripts/github/apply-repo-settings.sh`（Squash のみ許可）と食い違う。設定を流し直すか、決めごとを変えるか。
- マージすると枝は自動で消える。
- マージした瞬間に検証環境へ自動デプロイされる（`deploy.yml` の `push: branches: [main]`）。
- ⚠️ Codex のレビューが「Running」のままならマージを待つ。**レビュー0件は「指摘なし」ではない**
  （判定は見た目ではなく `get_reviews` と要約表。[pr-watch](../.claude/skills/pr-watch/SKILL.md)）。

### 7. 検証環境で確かめる

```bash
curl -s https://dev.gmo-onair.jp/health
```

### 8. レビュー指摘を棚卸しに移す

下の「マージしたら、その PR のレビューを棚卸しに移す（必須）」。

---

## 昔の版を検証環境で見る（Preview）

Actions → **Preview** → Run workflow → `ref` にコミット / タグ / ブランチを1つ。
そのコードが検証環境（dev.gmo-onair.jp）に出る。

- **本番には出ない。** 出せる先は検証環境だけで、入力自体が無い
- **検査は通さない。** 古いコードには今の検査スクリプトが無い。出すのは一度リリースされたコードだけ
- **VPS の worktree は動かさない。** イメージを差し替えて `app_dev` を作り直すだけ
- **戻す**: Actions → **Deploy** → Run workflow → Branch `main` / target `staging`
  （`main` にマージがあれば自動でも戻る）

旧UI の最後（`c3607a94` = v2.9.250）など昔の版の位置は
[archive/2026/branching-migration-2026-07-31.md](archive/2026/branching-migration-2026-07-31.md)。

---

## 版の番号は、作業 PR では取らない

版の番号は**マージされた順**で決まる。着手時に取ると、先に入った PR と必ずぶつかる
（ぶつかるのは毎回 `package.json`・`CLAUDE.md`・`README.md` の3か所だけで、コードは競合しない）。

| | 作業 PR（`feature/` `fix/` `chore/` `docs/` `claude/`） | リリース（`release/<版>`、または `RELEASE=1`） |
| --- | --- | --- |
| `package.json` の `version` | **触らない** | 上げる |
| `CLAUDE.md`「現在のバージョン」 | **触らない** | 先頭に積む・4件目を `docs/version-history.md` へ |
| `README.md` の `**現在のバージョン**: vX.Y.Z — **タイトル**` | **触らない** | この1行だけ差し替える（本文・旧版の行は README に置かない） |
| 載せたい文 | **`docs/changelog.d/<枝の名前>.md` に1ファイル** | 集めて消す |

```bash
# 作業 PR
vi docs/changelog.d/fix-141-calendar-duplicate.md   # 先頭は **太字の見出し**。`vX.Y.Z —` は書かない

# リリース
npm run release:notes -- 4.6.11     # 集めて3か所を書き、4件目をアーカイブへ、下書きを消す
npm run check:version               # 3か所の一致
RELEASE=1 npm run lint              # 版の変更を許した状態で lint
```

- **機械で止める。** `npm run lint` の先頭で `scripts/check-changelog.mjs` が走る。
  ①作業 PR が版の3か所の番号を動かしていたら落ちる ②差分があるのに下書きを1つも足していなければ落ちる
  ③下書きが2つ以上は警告だけ（枝を作り直した回に増えることがある）
- **リリースの判定**は `RELEASE=1`、または枝の名前の**いずれかのセグメントの先頭が `release`**
  （`release/4.6.11`・`claude/release-version-update-xxxx` は通る。`feature/pre-release-notes` は通らない）。
  CI では枝の名前を `GITHUB_HEAD_REF` から取る（`git` に訊くと `HEAD` としか返らない）
- **比べる相手**は PR の base（`GITHUB_BASE_REF`）→ `origin/main` の順。CI で相手が作れなければ落とす
  （`ci.yml` の `checkout` の `fetch-depth: 0` を外さない）。手元で相手が無いときは飛ばす
- **並び順は git の履歴順**（下書きが追加されたコミットの時刻＝マージされた順）。ファイルの更新時刻ではない
- **版1件が 12,000 バイトを超えたら自動で分ける**（全文 → `docs/version-history.md`、要約 → `CLAUDE.md`）。
  要約は `docs/changelog.d/_summary.md` に人が書く。書き方の全部は [changelog.d/README.md](changelog.d/README.md)
- `docs/version-history.md` は追記しかしないので `.gitattributes` で `merge=union`。
  **`CLAUDE.md` には使わない**（文章なので両方残すと段落が混ざる）
- 画面の「バージョン履歴」は `scripts/generate-version-history.mjs`（client の `predev` / `prebuild` が呼ぶ）が
  `CLAUDE.md` の最新3件 ＋ `docs/version-history.md` の全件から作る。書式は
  `vX.Y.Z — **タイトル**。本文` の1行（アーカイブ側は `(…)` で包む）。崩すとパースに失敗する

---

## 本番に出す（リリース）

本番デプロイは**リリースを公開したときだけ**走る（`deploy.yml` の `release: types: [published]`）。

1. `main` が検証環境で問題ないことを確認する
2. `release/<版>` の枝で `npm run release:notes -- X.Y.Z` → `npm run check:version` →
   `RELEASE=1 npm run lint` → PR（タイトル `release: vX.Y.Z`）→ マージ
3. GitHub の **Releases → Draft a new release**
   - タグ: `vX.Y.Z`（`package.json` の `version` に `v` を付ける）
   - ターゲット: `main`
   - タイトル・本文: その版の変更点
4. **Publish release** → 本番デプロイが始まる。`production` 環境の承認で一度止まる
   （承認者は画面で設定する。[ops/github-repo-settings.md](ops/github-repo-settings.md)）
5. 出たことをチャットで報告する（版番号とデプロイ先）

- 番号はパッチ（`4.6.10` → `4.6.11`）を1つずつ上げる。メジャー・マイナーは依頼があったときだけ
- 各ワークスペースの `package.json` は触らない（Docker のビルドスキップが無効になる。[deploy-pipeline.md](deploy-pipeline.md)）
- ⚠️ **Release の公開はユーザーの明示的な指示があるときだけ。** Claude は自分の判断で公開しない
- `v*` タグは打ち直し・削除できない（ruleset `release-tags`）。本番に何が出たかの記録そのもの

### 戻したいとき

Releases に過去のタグが全部並んでいるので、**1つ前のタグの Deploy を再実行**すれば戻る。
イメージだけ差し替える急ぎの手順（`ghcr.io/terai-takehiro/gmo-onair:vX.Y.Z` / `:sha-<commit>`）は
[deploy-pipeline.md](deploy-pipeline.md) の「ロールバック」。

---

## マージしたら、その PR のレビューを棚卸しに移す（必須）

マージすると、レビューの指摘は GitHub の画面から消える。**書かなければ存在ごと消える**
（実測: 143 件が埋もれ、それを潰す作業に付いた 26 件のうち 24 件も記録されていなかった）。

```bash
GITHUB_TOKEN=<token> npm run reviews:debt          # 直近 20 本のマージ済み PR
GITHUB_TOKEN=<token> npm run reviews:debt -- 50    # 本数を変える
```

- **マージしたら走らせる**（自分の PR だけでなく、その回にマージされたぶん）。返していない指摘を
  [reviews/codex-findings-v4.md](reviews/codex-findings-v4.md) の表に足す。**直すのが先ではない — まず書く**
- 直したら状態を ⭕️ にして、**直した PR 番号を書く**
- **「直さない」と決めたものも表から消さない。** ❌ のまま、理由と「何が変われば直すか」を書く
- ❌ / ❓ は段落ではなく**表の行**で残す（残数は `grep -c '^| .* | ❌'` で数える。段落に書くと数から消える）
- **件数を文章に書かない。** 表を数える（数え方は同文書の「数え方」）
- 束に分けたら、合計が元の数と合うか数え直す
- 並行開発中は棚卸し文書への**行追加だけ**。並べ替え・節の再構成は静穏時に単独 PR で
- 棚卸しの記録は**必ず `main` へマージする**（作業枝に置いたままだと、枝の削除で記録ごと消える）
- **レビューが0件のままマージした PR** も同文書の「レビューが0件のままマージされた PR」に記録する。
  判定は見た目ではなく `get_reviews` と Codex の要約表（`Commit` 列が頭のコミットか）
- `npm run lint` の門にはしない。外の API に依存するものを門にすると GitHub が重い日にビルドが止まる。
  **人がマージのあとに見る**

---

## やってはいけないこと

- **`main` への直接 push・force push**（ruleset で止まる）
- **`v*`・`archive/*` タグの打ち直し・削除**（ruleset で止まる）
- **ユーザーの明示的な指示なしに Release を公開すること**
- **作業 PR で版の3か所を触ること**（`check-changelog.mjs` が止める）
- **PR を出さずに検査を飛ばすこと**（型エラーが検証環境に出てから気づく形に戻る）
- **マージしたレビューの指摘を、棚卸しに移さずに放置すること**
- **Claude が PR を出したのに `pr-watch` を始めないこと**（「見張りますか」と訊いて待つのも同じ）
- **Codex が Running のままマージすること／レビュー0件を「指摘なし」と読むこと**

---

## 関連

- [CONTRIBUTING.md](../CONTRIBUTING.md) — 環境構築から PR まで
- [changelog.d/README.md](changelog.d/README.md) — 版の下書きの書き方
- [deploy-pipeline.md](deploy-pipeline.md) — デプロイの中身（GHCR・キャッシュ・ロールバック）
- [ops/github-repo-settings.md](ops/github-repo-settings.md) — GitHub 側の設定（ruleset・環境・ラベル）。
  適用は `scripts/github/apply-repo-settings.sh`
- [.claude/skills/pr-watch/SKILL.md](../.claude/skills/pr-watch/SKILL.md) — PR を出したあとの見張り
- [reviews/codex-findings-v4.md](reviews/codex-findings-v4.md) — レビュー指摘の棚卸し
- [guide/how-changes-ship.md](guide/how-changes-ship.md) — エンジニアでない人向けの説明
- [archive/2026/branching-migration-2026-07-31.md](archive/2026/branching-migration-2026-07-31.md) — 経緯
