# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・財務・カレンダー・日常業務・機材・
制作技術支援（Qシート）・計時を **GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v4.5.23 — **案件管理＞回を「削除できる」「ひとまとまりの見積」「回ごとのフェーズ」に作り直し、売上・仕入はフェーズを問わず登録できるようにした**。①一度登録した回を削除できるようにした（サーバーの `DELETE /episodes/:id` 自体は前からあったが画面にボタンが無かった。**売上・仕入がすでに紐づく回は 409 で削除を止める**ガードも新設）。②見積は「回ごと」の単数の紐づけ（`estimates.episode_id`）をやめ、**`estimate_episodes` 中間テーブルで多対多**にした——1日で複数本撮った日は、その日ぶんをまとめて1本の「ひとまとまりの見積」として作れる（見積タブに「複数の回をまとめて見積をつくる」を追加、「別の回として複製する」も複数選択に対応）。③**「回の単価」という概念そのものを廃止**した（`episodes.episode_unit_price` 列を削除）——複数本撮ると回あたりの単価が下がるため固定の単価は成立せず、回の一括登録3経路（話数指定・日付指定・頻度指定）が単価入力から確定売上を自動作成していた挙動もあわせて廃止（金額は見積・確定売上そのものが持つ）。④回ごとに**フェーズ**（`stage`。案件の受注ステージと同じ語彙・NULL可）を設定できるようにした。⑤売上・仕入の新規登録画面の案件プルダウンを、受注確定済み（A受注済以降）だけの絞り込みから**失注(E失注)以外の全ステージ**に広げた（`GET /projects/registerable-projects` を新設・精算PDF取込レビュー等ほかの4画面が使う「受注確定済みだけ」の絞り込みは変えていない）。検証: 新規マイグレーション（274番）を検証DBに適用、`server`/`client` の型チェック、`shared` の Vitest 1996件（列を落としたSQLが残っていないかを見る `droppedColumns.test.ts` を含む）全通過。

旧 v4.5.22 — **マルチエージェントで徹底調査し、財務・案件管理・カレンダーの9/3依頼9項目を実装した**。案件フェーズに「A受注済」と「完了」の間の中間ステージ「実施済（財務処理中）」を新設し、BOXの完了フォルダへの移動は財務処理後（完了）まで発火しないようにした。見積の値引き項目行の自動生成、「案件を直す」の保存ボタンが押せない不具合、案件概要のリロード反映漏れ（再発）、GLS発番への「リアルイベント」追加も合わせて直した。財務は取引先マスターに与信限度額・最新与信確認日を追加し、ダッシュボードの仕入・販管費を内訳行からそのまま編集できるようにした。カレンダーは仮抑えに「何番手か」を登録できるようにした。

旧 v4.5.21 — **新しく公開された脆弱性で CI の `npm audit` が落ち、検証環境も本番も出せなくなっていたのを直した**。⚠️ **これは誰かの変更が壊したのではなく、時間が経つと勝手に落ちる種類の失敗** — `fast-uri` に 2026-09-02 付で High の勧告が4本（ホスト混同・SSRF）出て、`npm audit --omit=dev --audit-level=high` が `1 high` で止まった。CI は `checks` が落ちると `staging` も `production` も**丸ごと skip** するため、v4.5.20 をマージしても**検証環境に出ず、Release を公開しても本番に出ない**状態だった（マージ後の Deploy 実行 #1951 で発覚）。`fast-uri` は MCP SDK → ajv の推移的依存で、ajv の要求は `^3.0.1` なので**破壊的変更なしに 3.1.5 → 3.1.7 へ上げられる**。`npm update fast-uri` だけを当て、道連れの更新を避けた（残る moderate/low 11 件は `--audit-level=high` の対象外なので触っていない）。あわせて `package-lock.json` の版が v4.5.17 のまま取り残されていたのも 4.5.20 に揃えた（`release:notes` はロックファイルを触らないため、リリースのたびにずれていた）。検証: `npm audit --omit=dev --audit-level=high` が exit 0・typecheck:all・lint・shared テスト1963件 全通過。

旧 v4.5.20 — **「v4.5.19 で直したはずが直っていない」と報告された11項目を原因から直し、財務の3台帳をスマホ対応にした**。⚠️ **未対応の大半は1つの取り違えから来ていた** — 前版の実装者が「グループ内案件」を**プロジェクト管理(GPM)**だと解釈し、定価の編集欄とカテゴリ別値引きを有効にする prop を GPM の見積タブからしか渡していなかった（部品は案件管理側にあるのに何も出ていなかった）。正しい定義は `projects.customer_type === 'internal'`。あわせて案件詳細に「回」タブを戻し（レギュラー案件だけ）、案件詳細・「案件を直す」が開くたびに読み直すようにして「リロードしないと正しいものが出ない」を解消し、GLS 発番できない案件（BLVCKOUT ＝ OPP-202609-0002）の原因を本番データで特定して C 見積提案から発番できるようにし、「9/7｜#17,18,19」のように日付と回番号をまとめて登録する経路を新設した。⚠️ **敵対的レビューで、自分たちが作り込んだお金の実害2件を出す前に潰した** — 発番を前倒しした結果、受注していない案件の概算見積が確定売上に化けていた件と、回の一括登録の「回の単価」が確定売上を作っていた件。財務では**3台帳（売上・仕入・販管費）をスマホで使えるように**し（カードでも金額の右端を固定レールで揃え、PC の金額列と同じ「揃った列」を作る）、ダッシュボード内訳の行クリックを3列とも「その台帳の明細一覧へ飛ぶ」に統一、売上の内訳にも状態（未請求／発行済／入金済）を出した。#544 がレビュー0件のままマージされたことも棚卸しに記録している。

> それより前の版の履歴（全件）は [docs/version-history.md](docs/version-history.md) にあります
> （画面ヘッダーの時計アイコンからも全件見られます。この節に残すのは旧3件だけ —
> リリース時に `npm run release:notes` が自動で古い分を落とします）。

---

## ブロックアプリ構成

アプリごとの決めごとは各ディレクトリの `CLAUDE.md` に、最新の一覧表はルート
[`CLAUDE.md`](CLAUDE.md)「ブロックアプリ一覧」にあります。要点だけ:

| アプリ | ディレクトリ | 公開パス | 状態 |
|---|---|---|---|
| 案件管理・財務管理・カレンダー・設定 | [`client/`](client/CLAUDE.md) | `/` | 稼働 |
| 日常業務 | [`client-daily/`](client-daily/CLAUDE.md) | `/daily/` | 稼働 |
| 機材管理 | [`client-equipment/`](client-equipment/CLAUDE.md) | `/equipment/` | 稼働 |
| 制作技術支援（Qシート） | [`client-techops/`](client-techops/CLAUDE.md) | `/techops/`（旧 `/qsheet/` も後方互換） | 稼働（表本体の v4 化が残） |
| 計時・視聴者 | [`client-live/`](client-live/CLAUDE.md) | `/live/` | 稼働（制作技術支援のミニアプリ） |
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | — | **廃止**（コードは保存・配信停止） |
| 共通ライブラリ | [`shared/`](shared/CLAUDE.md) | — | 全アプリの土台 |

外部リンク（別 VPS・別タブ）: [インタラクティブ](https://interactive.gmo-onair.jp/)・[翻訳](https://gmo-translate.jp/)

全アプリは同一ドメインで配信され、Nginx のパスルーティング + Express の静的配信で分岐します。
認証と API は共通（`/api/v1/internal/*`）です。

---

## 技術スタック

- **フロントエンド**: React 18 + Vite 6 + TypeScript + TailwindCSS 3 + shadcn/ui +
  TanStack Query + Zustand + React Router v6
- **バックエンド**: Node.js + Express + TypeScript + PostgreSQL 16（`pg`）
- **リアルタイム**: Socket.IO（`/techops` — 旧 `/qsheet` とは常時相互中継のブリッジ構成 — ほか各名前空間）
- **認証**: `AUTH_MODE`（環境変数 > `NODE_ENV` 既定）で切替 — 本番は Email/Password + SMS 2FA、
  検証・開発は mockAuth（ユーザーカード選択式）。Google 連携はカレンダー用
- **インフラ**: Docker Compose + Nginx + Let's Encrypt / CoNoHa VPS（本番・検証を単一 VPS で並走）
- **モノレポ**: npm workspaces / ローカル開発は Dev Containers

---

## 開発の始め方

環境構築から PR までの詳しい手順は [CONTRIBUTING.md](CONTRIBUTING.md)。

```bash
npm install
npm run verify:up      # 検証用 Postgres（ポート5433・本番と完全分離）
npm run dev            # 主要アプリ + server（全アプリは dev:all）
```

```bash
npm run typecheck      # 型チェック（CI は typecheck:all）
npm run lint           # eslint + 文書リンク・changelog 等の検査
npm run test           # shared の Vitest（CI が回す・手元の gate にも入れる）
npm run build:changed  # 変更したワークスペースだけビルド
npm run verify:ui      # 実ブラウザで書体・桁揃い・横はみ出しを実測
```

---

## デプロイ

手順は [docs/branching.md](docs/branching.md)、仕組みは [docs/deploy-pipeline.md](docs/deploy-pipeline.md)。要点:

| やりたいこと | 操作 |
| --- | --- |
| 検証環境 (dev.gmo-onair.jp) に出す | **`main` に PR をマージする**（自動デプロイ） |
| 特定ブランチだけ検証環境で見る | Actions → **Preview** → ref を入力（本番には出せない） |
| **本番 (gmo-onair.jp) に出す** | GitHub で **Release（タグ `vX.Y.Z`）を公開する** |
| 本番を戻す | Releases から**1つ前のタグの Deploy を再実行** |

ビルドは GitHub Actions 上で行い、イメージを GHCR (`ghcr.io/terai-takehiro/gmo-onair`) に
push、VPS は pull してコンテナを差し替えるだけです（VPS 上ではビルドしません）。

---

## ブランチ運用

**正は [docs/branching.md](docs/branching.md)。** GitHub Flow ＋ リリースタグです。

- **長く残るブランチは `main` だけ。** 直接 push 禁止（PR のみ・**Squash マージ固定**）
- **`main` は本番ではありません。** `main` = 検証環境／本番はタグが指すコード
- 作業ブランチは `feature/<Issue番号>-<短い名前>`（`fix/` `chore/` `docs/`）。数日で PR にして消す
- PR タイトルは `種類(アプリ): 何をしたか`（例 `feat(equipment): 機材台帳を v4 の見た目にした`）

### バージョン管理

**リリースするときだけ**上げます。作業 PR は版番号を触らず、`docs/changelog.d/` に
載せたい文を1つ置きます（`npm run lint` が強制）。リリース時は
`npm run release:notes -- X.Y.Z` が次の3か所を更新し、`npm run check:version` が整合を検査します:

1. ルート `package.json` の `version` ← **唯一の情報源**
2. `CLAUDE.md`「## 現在のバージョン」の先頭に1行追記（4件目はアーカイブへ）
3. `README.md` の「現在のバージョン」（この文書の冒頭・旧3件までに自動整理）

**各ワークスペースの `package.json` は更新しません**（どこからも読まれず、更新すると
Docker のビルドキャッシュが無効化されます）。

---

## ドキュメント

- **docs/ の目次**: [docs/README.md](docs/README.md) — 現役の正・生成物・作業場・archive の4分類
- **プロジェクトメモリ**: [CLAUDE.md](CLAUDE.md) — 開発方針・環境分離・セキュリティの決めごと
- **環境構築から PR まで**: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## セキュリティ

- `.env` や認証情報は**絶対に Git にコミットしない**
- API キー・JWT シークレットをソースにハードコードしない
- 本番 DB と検証 DB は**完全分離**（相互参照・相互コピー禁止）
- 本番 DB への直接 SQL 操作は**最小限**（緊急時のみ）

詳細は [CLAUDE.md](CLAUDE.md) の「セキュリティポリシー」「環境分離ポリシー」。

---

## ライセンス

本プロジェクトは GMOグローバルスタジオ社内で利用するクローズドソースです。
