# GMO ONAiR - プロジェクトメモリ

## プロジェクト概要
GMO ONAiR = GMOグローバルスタジオの制作管理プラットフォーム（会社OS）の総称。
複数の「ブロックアプリ」を束ねるプラットフォームであり、特定の機能を指す名称ではない。
GLS番号を中核として全アプリのデータが紐づく。

### ブロックアプリ一覧

**アプリ固有のことは各ディレクトリの `CLAUDE.md` に書いてある。** ここには全体に効くことだけ置く
(この文書は毎ターン文脈に読み込まれるため、小さく保つ)。

| アプリ | ディレクトリ | ベースパス | ポート | v4.0.0 | 概要 |
|---|---|---|---|---|---|
| 案件管理・財務管理・カレンダー・設定 | [`client/`](client/CLAUDE.md) | `/` | 5173 | **対象** | 案件・見積・売上・仕入・損益・予定・権限。v4 でプロジェクト管理を追加 |
| 日常業務 | [`client-daily/`](client-daily/CLAUDE.md) | `/daily/` | 5180 | **対象** | 週報・ニュース・内覧会・受領書類・セキュリティカード |
| 機材管理 | [`client-equipment/`](client-equipment/CLAUDE.md) | `/equipment/` | 5175 | **対象** | 機材台帳・ラック図・貸出・棚卸し |
| 制作資料 (中の Qシート) | [`client-qsheet/`](client-qsheet/CLAUDE.md) | `/qsheet/` | 5174 | 凍結 | 台本作成・本番進行 (進行/ランダウン/プロンプター/音声サポート)。**v4 のアプリ名は「制作資料」**、Qシートはその中のミニアプリ |
| 技術資料 | [`client-techsheet/`](client-techsheet/CLAUDE.md) | `/techsheet/` | 5177 | 凍結 | カメラ・映像・音声・通信の仕様書 |
| 計時LIVE | [`client-live/`](client-live/CLAUDE.md) | `/live/` | 5178 | 凍結 | タイマー・視聴者カウンター |
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | `/awards/` | 5179 | 凍結 | 放送CG演出・送出 (内部識別子は `awards` のまま) |
| 共通ライブラリ | [`shared/`](shared/CLAUDE.md) | — | — | **対象** | トークン・UI部品・共通シェル。**触ると全アプリに効く** |

**「凍結」の意味**: v4.0.0 では作り直さない。**URL は生かし、見た目は今のまま**にする
(一覧・アプリ切替からは外す)。詳細は各アプリの `CLAUDE.md` と [docs/v4-plan.md](docs/v4-plan.md)。

### 外部リンク (別 VPS / 別タブで開く)
| アプリ | URL | 概要 |
|---|---|---|
| インタラクティブ | https://interactive.gmo-onair.jp/ | EventStamp・リアルタイム演出 (別 VPS) |
| 翻訳 | https://gmo-translate.jp/ | GMO 翻訳ツール |

### 共有ライブラリ (`shared/`)
全ブロックアプリの共通コードを集約。各アプリは設定値のみ渡すラッパーファイルで利用。
- `shared/src/client/createApi.ts` — axiosインスタンスのファクトリ (storageKey, loginPath)
- `shared/src/client/createAuthHook.ts` — useAuthフックのファクトリ (storageKey, api)
- `shared/src/client/queryClient.ts` — 共通QueryClient設定
- `shared/src/client/uiStore.ts` — 共通UIストア (Zustand)
- `shared/src/client/utils.ts` — cn()ユーティリティ
- ストレージキー: `qs_user` (qsheet), `ts_user` (techsheet), `is_user` (interactive), `eq_user` (equipment)

## 技術構成
- **フロントエンド**: React 18 + Vite 6 + TailwindCSS 3 + shadcn/ui
- **バックエンド**: Express + PostgreSQL (pg)。1つのサーバーが7アプリの静的ファイルを配信する**単一イメージ構成**
- **モノレポ**: npm workspaces (client, client-daily, client-equipment, client-qsheet, client-techsheet, client-live, client-awards, server, shared)
- **リアルタイム**: Socket.IO (`/qsheet` ネームスペース: OnAir↔ランダウン同期, awards/quiz/liveops 各ネームスペース)
- **デプロイ先**: CoNoHa VPS (Docker Compose + PostgreSQL + Nginx)

### よく使うコマンド
```bash
npm run verify:up      # 検証用 Postgres を立てる (約4秒・ポート5433・本番とは完全分離)
npm run dev            # v4 対象3アプリ + server  (全7アプリは dev:all / 凍結分は dev:frozen)
npm run typecheck      # v4 対象3アプリ + server  (CI は全7アプリの typecheck:all を使う)
npm run build:changed  # 変更したワークスペースだけビルド (全部だと2分)
npm run verify:ui      # 実ブラウザで書体・桁揃い・横はみ出しを実測
npm run fonts          # LINE Seed JP を同梱し直す (v4の3アプリは Google Fonts を読まない)
npm run lint           # eslint    /  npm run check:version  # バージョン表記の整合
npm run check:frozen   # 凍結4アプリの CSS が変わっていないか (build:all のあとに回す)
npm run test           # shared の Vitest (**CI が回す。手元の gate にも必ず入れる**)
```
`build` / `typecheck` / `dev` の既定が3アプリなのは**手元の速さのため**。
本番は Dockerfile が7アプリすべてを個別ステージでビルドするので、凍結アプリも必ず作られる。

### どこに何が書いてあるか
| 知りたいこと | 読む場所 |
| --- | --- |
| v4 の開発計画・スコープ・段取り | [docs/v4-plan.md](docs/v4-plan.md) |
| **v4 でどこまで出来たか (サイトツリー)** | [docs/v4-progress.md](docs/v4-progress.md) — `node scripts/v4-progress.mjs --write` で**画面のファイルを読んで作る生成物**。手で書くとずれるので、v4 の PR では毎回作り直して本文に貼る |
| ブランチ・PR・リリース手順 | [docs/branching.md](docs/branching.md) |
| 環境構築から PR まで | [CONTRIBUTING.md](CONTRIBUTING.md) |
| デプロイの仕組み (GHCR・キャッシュ・戻し方) | [docs/deploy-pipeline.md](docs/deploy-pipeline.md) |
| 版ごとの変更 (全430件) | [docs/version-history.md](docs/version-history.md) |
| v4 の画面ごとの仕様 (モックから切り出したもの) | `docs/design/v4/` |
| 用語の決めごと | [docs/wording.md](docs/wording.md) |
| **どの仕事にどのモデルを使うか** | [docs/ai-models.md](docs/ai-models.md) — 段は light / heavy の2つだけ。**基準は「間違いに気づけるか」で費用ではない** |
| MCP のツール一覧 | [docs/mcp-server.md](docs/mcp-server.md) |

## 現在のバージョン
v4.0.22 — **投入口が「拾わなかったもの」を黙らないようにした**（Codex のレビュー棚卸し #77・#75。P2 2件。**migration 191**）。出ないと、投げた人は**「AI が読み落とした」と思ってもう一度投げます** — そして2回目も同じ行が落ちます。①⚠️ **録音から投げたときだけ、警告が1つも出ませんでした**（P2）。打ち込んだときは「拾わなかった行」も「規則ベースに落ちたこと」もその場の応答に載せて画面に出るのに、**録音は裏で解析する**ので（migration 180）応答は先に 202 で返り、**その場にしか無い警告は消えます**。同じ投入なのに「打つと出るのに録音だと出ない」でした。行に残す列を足しました（`task_intake.warnings`）。②⚠️ **読めない形式の添付が黙って捨てられていました**（P2）。**OpenAI も Anthropic も画像は4種類だけ**（jpeg / png / gif / webp）なので、**iPhone の写真（HEIC）**や SVG は読めません。落とすこと自体は変えません（渡して 400 にすると**解析まるごとが規則ベースへ落ち、下書きが全部タスクになる**）が、**落としたことを確認画面に並べます** — 名刺を貼ったのに会社名が入っていないのが「AI が下手」に見えていました。**AI につないでいない環境では添付は1つも読まれない**ので、そこでは全部を「読めなかった」として出します。⚠️ **最初の版は Anthropic だけを見ていて、主経路の OpenAI で同じ穴が残っていました**（同じ版の中でレビューに指摘され、直しました）。③**形は `{ line, reason }` の1つに揃えます** — 確認画面がすでに読んでいる形で、別にすると出す場所を2つ書くことになります。**画面は応答と行の両方を見ます**（片方だけだと、また「打つと出るのに録音だと出ない」に戻る）。④**検証**: 実 Postgres で — **OpenAI でも Anthropic でも `名刺.heic` と `図.svg` が落ち、`会場図.png` と `仕様.pdf` は通る**。**AI につないでいない環境では4つとも「読めなかった」**、録音の道で渡した警告が**行に残り、読み出しにも載る**（**反証: 渡さないと `null`** ＝ 前の版はすべての録音がこれ）。`shared/tests/intakeWarnings.test.ts` 5項目、`npm run test` 568項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings。⑤**DB 変更あり（migration 191・列を1つ足すだけ）。`shared/src/` は触っていない**ので凍結4アプリの CSS は不変。

v4.0.21 — **「直りました」と言いながら何も入っていなかった2つを直した**（Codex のレビュー棚卸し #81・#80。P2 2件＋すでに直っていた1件）。**P1 はすべて片づいたので、ここからは P2 を潰します。**この2つは**成功して見える**のが問題です。①⚠️ **MCP の `update_project` が、受け取った項目を黙って捨てて `updated: true` を返していました**（P2）。捨てていたのは**2段分類（客入れの有無・配信/収録/イベント）と登録の16項目**で、どれも `create_project` では受けているものです（**作るときは入るのに、直すと入らない**）。しかも `changed_fields` に**捨てた項目まで並べて**いたので、AI はそれを見て次に進みます（間違いが下流へ流れる）。**返すのは「渡した項目」ではなく「書き換えた項目」**にし、捨てたものは `ignored_fields` で出します。②⚠️ **日常業務の「案件の受付へ送る」から開くと、フォームが空でした**（P2）。`?inquiry=<id>` は**書き戻しに使うだけ**で、すでに記録してある会社名・要件・希望日を**もう一度打ち直す**ことになっていました。送った側は「向こうで案件になる」と思っているので、**打ち直しが起きていること自体が誰にも見えません**。**写す処理は増やさず**、レールで選んだときと同じ道（`useIntakeSeed`）を通します。③**すでに直っていた1件**: 「客入れなし」なら来場人数は落ちます（`create` / `update` とも）。④**検証**: 実 Postgres で — 分類を直すと **`with_audience`/`event`/`offline_event`/150名 → `no_audience`/`recording`/`recording`/（人数は落ちる）**、ご担当と案件内容も入る（**反証: 前の一覧に戻すと1文字も変わらない**）。実ブラウザで **`?inquiry=` から開くと引き合いの要件がフォームに入り、カードが選ばれた状態になる**（**反証: 前の版は空で、カードも選ばれない**）。`shared/tests/silentDrop.test.ts` 3項目、`npm run test` 563項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings。⑤**DB 変更なし。`shared/src/` は触っていない**ので凍結4アプリの CSS は不変。

v4.0.20 — **支払期日が設定どおりに入るようにし、同じ引き合いから案件が2件できるのを止めた**（Codex のレビュー棚卸し #63・#62。P1 2件、＋作業中に見つけた1件）。**これで ❓（読んだだけ）の P1 は残っていません**（残る 69 件はすべて P2）。①⚠️ **「支払日が休業日のとき」の設定が、どこからも読まれていませんでした**（P1）。「前の営業日へ」を選んでも**日曜のままの期日**が入り、しかも隣の欄には「休業日のときの寄せ方は下で決めます」と書いてあります（**設定したのに効かない** — 振り込みの日が来るまで気づけません）。土日・祝日・**全社の休業日**（`closed_days` の `location_id IS NULL`）を見て寄せます。⚠️ **拠点ごとの休業日は見ません** — あれは「その部屋が使えない」で、会社が休みという意味ではない。⚠️ **祝日の `availability` も見ません** — 祝日の行は「スタジオは稼働する」の意味で既定が `open` ですが、銀行はそれとは関係なく閉まります。**60 日で打ち切って元の日を返す**（表を間違えても止まらない）。②⚠️ **`computeDueDate` を呼んでいる場所が1つもありませんでした**（**この作業中に見つけたもの**）。下見の画面が使うだけで、**保存される行の支払期日はずっと空**でした — つまり締め日も支払日も、設定しても台帳には入っていません（「遅れているもの」も数えられない）。売上を作るときに**空のときだけ**埋めます（**人が入れた期日は上書きしません**）。③⚠️ **同じ引き合いから案件が2件できました**（P1）。ボタンの `disabled` は描き直しが1回入ってから効くので、**同じ瞬間に2回押すと2回とも通ります**（スマホは通信が返るまで無反応に見えるので、二度押しが普通に起きます）。しかも出来てしまうと**印を書き戻せるのは片方だけ**で、もう1件は未仕分けのまま残り、翌日また案件になります。`idempotency_key`（`inquiry:<id>:project`）を渡し、**DB の一意索引で止めて、先に出来たほうを返します** — エラーにすると**出来ているのに失敗したと思って、もう一度作られます**。④**検証**: 実 Postgres ＋ 実サーバーで — 支払日 2026-11-15（日）は**前＝11/13（金）・次＝11/16（月）・寄せない＝11/15**、祝日 11/23（月・勤労感謝の日）は**前＝11/20**、全社の休業日（年末年始）を入れた 12/31 は**前＝12/28**（**反証: 「寄せない」＝前の版の挙動はどれも動かない**）。売上を作ると**支払期日 2026-11-13 が入る**（**それまでは常に空**）、**人が入れた 2026-12-01 はそのまま**。案件は**同時に2回投げても同じ id が返り DB は1件**（**反証: 鍵を渡さないと 2件**）。`shared/tests/dueDateShift.test.ts` 10項目、`npm run test` 560項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings。⑤**DB 変更なし**（`idempotency_key` と一意索引は migration 126 にすでにあるものを使いました）。**`shared/src/` は触っていない**ので凍結4アプリの CSS は不変。


> **これより前の版は [docs/version-history.md](docs/version-history.md) にあります**（v4.0.2 以下・427件）。
> 画面の「バージョン履歴」は **CLAUDE.md ＋ アーカイブの両方**から作られるので、表示は全件のままです。
>
> **ここに残すのは最新3件だけ。** リリースのたびに4件目をアーカイブの「## 過去のバージョン」直下へ移してください。
> この節は毎セッションの文脈に必ず載るため、履歴を貯めると全作業のコストが上がります
> （v3.2.2 時点で **680KB＝この文書の96%** が履歴で、切り出して 707KB → 35KB になりました）。

## 開発の絶対原則: AIを使い捨てにしない (必須チェック)

会社方針。**AI 機能を作る・変えるときは必ず**フィードバックループを設計に組み込む。
AI を一度使って終わりにすると人間の修正コストが永久に減らず、直した労力が資産にならない。

**回すループ**: ①AIが業務を実行 → ②4つのフィードバックを回収 (業務結果 / 人間の修正差分 / 顧客反応 / 成果指標) → ③AI改善に反映 (プロンプト・ナレッジ・学習データ) → ①に戻す

**設計時に必ず満たす5条件**: 1) AI出力を記録・保存 2) 人間の修正を差分として残す 3) 顧客反応と成果指標を出力に紐づける 4) 貯めたデータをAI改善に戻す経路 5) レビュー頻度と担当を決める

**運用**: AI/MCP/スキル/自動化の設計・変更時は `.claude/skills/ai-feedback-loop/` のスキルを使い、
5条件の充足表を出して**抜けを明示**する。経路が作れない要素は「できない」で止めず必ず代替案を添える。
ONAiR の現状 (何が既にあり、どこが穴か) は同スキルの `references/onair-current-state.md` に集約済み。
AI が関与しない UI 修正・CRUD・デプロイ作業には適用しない。

## ブランチ運用とリリース

**正は [docs/branching.md](docs/branching.md)。** ここには要点だけ置く (二重に書くと必ず片方が古くなる)。

- **長く残るブランチは `main` だけ。** 直接 push 禁止 (PR のみ・Squash マージ固定)
- **`main` は本番ではない。** `main` にマージ = **検証環境** (dev.gmo-onair.jp) に自動デプロイ
- **本番に出るのは GitHub で Release (タグ `vX.Y.Z`) を公開したときだけ。** ユーザーの明示的な指示なしに公開しない
- 作業ブランチは `feature/<Issue番号>-<短い名前>` (`fix/` `chore/` `docs/`)。数日で PR にして消す
- **ブランチ単位で検証環境に出したいとき**は Actions → Preview → ref を入力 (本番には出せない)
- **PR タイトルは `種類(アプリ): 何をしたか`** 例 `feat(equipment): 機材台帳を v4 の見た目にした`
  → Squash マージで `main` の1コミットになるため、`git log --oneline` がそのまま機能の一覧になる

### バージョンを上げるとき
**リリース時だけ**上げる (以前の「毎 push でパッチを上げる」は廃止)。更新するのは**3か所だけ**:
1. ルート `package.json` の `"version"` ← **唯一の情報源**
2. `CLAUDE.md`「## 現在のバージョン」の先頭に1行追記
3. `README.md` の「現在のバージョン」

**各ワークスペースの `package.json` は更新しない。** どこからも読まれておらず (画面表示はルート
`package.json` → `vite.config.ts` の `__APP_VERSION__`)、更新すると Docker の全ビルドステージが
無効化されて「変更のないアプリはビルドをスキップ」が効かなくなる (詳細: `docs/deploy-pipeline.md`)。
整合は `npm run check:version` が検査する。

### バージョン履歴 (ヘッダーの時計アイコン)
`scripts/generate-version-history.mjs` が **`CLAUDE.md`「## 現在のバージョン」(最新3件) ＋
`docs/version-history.md`「## 過去のバージョン」(それ以前の全件)** を連結して
`client/public/version-history.json` を生成する (`client` の `predev`/`prebuild` で自動実行)。

- **`CLAUDE.md` に履歴を貯めないこと。** この節は毎ターン文脈に載るため、
  貯めると全作業のコストが上がる (v3.2.2 時点で 680KB＝この文書の96%が履歴だった)。
  リリースのたびに4件目をアーカイブへ移す。目安を超えると生成時に警告が出る
- **書式を崩すとパースに失敗する**: `vX.Y.Z — **タイトル**。本文` /
  アーカイブ側は全体を `(...)` で包み1エントリ1行

## 環境分離ポリシー (最重要)

### 本番環境と検証環境は絶対に干渉させない
- **本番**: `https://gmo-onair.jp`
  - コンテナ: `app-prod`
  - DB: `onair_prod`
  - 認証: Email/Password + SMS 2FA
  - `SKIP_SEED=true` (シードデータ投入しない)
  - マスター管理者のみ自動作成
- **検証**: `https://dev.gmo-onair.jp`
  - コンテナ: `app-dev`
  - DB: `onair_dev`
  - 認証: mockAuth (ユーザーカード選択式)
  - シードデータ投入あり (全テーブル網羅のダミーデータ)
  - 自由に壊せる環境

### 絶対厳守
- 本番DBと検証DBは**完全分離**。相互参照・相互コピー禁止
- 本番DBに対する直接SQL操作は**最小限**（管理者パスワードリセット等の緊急時のみ）
- 検証環境のデータが本番に流れ込まないこと
- 本番環境の秘密情報（JWT_SECRET等）を検証環境で使わないこと
- **Claudeは必ず `dev` に先行プッシュし、ユーザーが「本番に入れて」と明示するまで `main` には絶対にプッシュしない**

### デプロイワークフロー
1. **開発 → 検証**: `dev` ブランチへpush → GitHub Actions が検証環境 (`dev.gmo-onair.jp`) に自動デプロイ
2. **検証で動作確認**: 検証環境で全機能テスト → OKならユーザーに通知して承認を待つ
3. **本番リリース**: ユーザーがチャットで「本番に入れて」と明示的に指示してから、`dev` を `main` にマージ＆push
4. **緊急ロールバック**: 以前のコミットに戻してpush → 本番が旧バージョンに戻る

> ⚠️ Claudeへの注意: ユーザーの明示的な本番指示なしに `main` へpushすることは**いかなる理由があっても禁止**。

### バージョン確認コマンド (VPS)
```bash
cd /root/gmo-onair && git log --oneline -1                    # 現在のコード
curl -sk https://dev.gmo-onair.jp/health                       # 検証稼働確認
curl -sk https://gmo-onair.jp/health                            # 本番稼働確認
```

### DB バックアップ運用 (v2.7.12+)
PostgreSQL の `onair_prod` / `onair_dev` を 3 時間ごとに pg_dump + gzip → BOX「社内限り」親フォルダ配下の `00_DB_Backup/{prod|dev}/` に自動アップロード。30 日経過したファイルは自動削除。

- **スクリプト本体**: `server/scripts/backup-db-to-box.mjs` (各コンテナ内で実行)
- **cron 一括設定**: `sudo bash /root/gmo-onair/scripts/setup-backup-cron.sh` (1 度だけ実行、冪等)
- **ログ**: `/var/log/gmo-onair-backup.log`
- **手動実行 (動作確認用)**:
  ```bash
  docker exec gmo-onair-app_prod-1 node /app/server/scripts/backup-db-to-box.mjs
  docker exec gmo-onair-app_dev-1  node /app/server/scripts/backup-db-to-box.mjs
  ```
- **必須環境変数** (.env): `BOX_CONFIG_JSON` + `BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL`
- **保存先**: BOX 社内限り親 / `00_DB_Backup/` / `prod` または `dev` / `{db_name}_YYYYMMDD_HHMMSS.sql.gz`

### DB 復元運用 (v2.8.2+)
バックアップから DB を復元するための CLI スクリプト。**破壊的操作なので慎重に**:

- **管理 UI**: `/admin/db-backups` (system_admin のみ) でバックアップ一覧 + 復元コマンドコピー機能
- **CLI 復元**:
  ```bash
  # 一覧表示
  docker exec gmo-onair-app_prod-1 node /app/server/scripts/restore-db-from-box.mjs --list
  # 復元 (対話確認あり、"yes" 全文入力で実行)
  docker exec -it gmo-onair-app_prod-1 node /app/server/scripts/restore-db-from-box.mjs onair_prod_YYYYMMDD_HHMMSS.sql.gz
  ```
- **5 層の安全策**:
  1. 環境チェック (prod ファイル → prod のみ、クロス禁止)
  2. 自動スナップショット (`/tmp/before-restore_*.sql.gz` に退避)
  3. "yes" 全文タイプ確認 (`y` だけでは続行不可)
  4. 監査ログ (`[restore] AUDIT:` で stdout)
  5. エラー時に復旧手順を表示

## UI/UX ポリシー

### レスポンシブデザイン必須
- **全ての画面はスマホ対応を前提**で設計・実装する（モバイルファースト）
- 新規UI追加・既存UI修正時は、375px幅（iPhone SE相当）でも破綻しないこと
- 具体的には以下を遵守:
  - Tailwind のブレイクポイント `sm:` `md:` `lg:` を適切に使用
  - 横スクロールが発生しうるテーブルは `overflow-x-auto` で囲む
  - フォームは1カラム縦積みを基本、広い画面で `sm:grid-cols-2` 等に展開
  - ボタン・タップ領域は最低 44px（iOS HIG基準）を確保
  - ダイアログ/モーダルは `max-h-[90vh] overflow-y-auto` で画面外はみ出し回避
  - 固定ヘッダー/フッターは `position: fixed` + `safe-area-inset` を考慮
- 実装後は DevTools のモバイルエミュレーションで動作確認
- 既存画面もレスポンシブ不備を見つけたら随時修正すること

## コード健全性ポリシー（2026-04-28 codex フルレビューからの学び）

### 依存関係のバージョン整合性
- **`package.json` の宣言と `package-lock.json` の解決を必ず一致させる**。codex レビューで `tailwindcss` を `^3.4.16` と宣言したまま lockfile 上は `4.x` 系が解決されており、`npm ls tailwindcss` が `invalid` を返す状態が放置されていた。
- ライブラリのメジャーバージョンを上げる際は **workspace 全体（7 クライアント + server + shared）で同時に更新** し、関連設定（PostCSS / Vite plugin / Tailwind preset 等）も同じコミット内で揃える。中途半端な更新を残さない。
- **CI/手元で `npm ls <主要パッケージ> --depth=2` を定期確認**し、`invalid` / `extraneous` を検知したらその場で潰す。

### ビルド関連設定の同期
- Tailwind v3 → v4 のように **PostCSS API が変わるメジャー更新では `postcss.config.js` を必ず同時更新**する。v4 系は `@tailwindcss/postcss` を経由する形式で、v3 形式（`tailwindcss: {}` 直指定）のまま放置するとフロントエンド build が停止する。
- 「ローカルでは動いた」だけで push しない。**`npm run build`（ルート、全 workspace 一括）が通ること**を最低ラインの確認項目とする。サーバー単体ビルドが通ってもフロントが落ちている可能性がある。

### Lint 基盤の維持
- ESLint 9（flat config = `eslint.config.js`）に統一するか 8 系で揃えるかをまず決め、**`shared/` 配下に共通プリセットを置いて全 workspace から参照**する形に集約する。
- `npm run lint -w client` のような workspace 単位 lint コマンドが**設定ファイル不在で即落ちしている状態を放置しない**。ESLint を導入する以上、CI で確実に走らせる。

### TODO / FIXME の管理
- ソースに `TODO` / `FIXME` を残す場合は **必ず GitHub Issue 番号（または期限）を併記**する（例: `// TODO(#123): 実サーバースペック判定`）。
- 残置 TODO（`server/src/contexts/interactive/services/scaling.service.ts:38` の `currentPlan: 'minimum'` 固定、`client-interactive/src/pages/AudiencePage.tsx:123` の言語固定 `ja` 等）は **issue 化して解消時期を明確に**する。
- ハードコード値（プラン名・言語コード等）はコメントだけでなく**設定ファイル / 環境変数 / DB マスター化**して根本的に外出しする方針を優先。

### 定期セルフレビュー
- 大きめのリリース（マイナー以上、または機能盛りだくさんなパッチ）の前後で **`docs/reviews/` に簡潔なレビューメモを残す**運用を継続する（codex / Claude いずれも同じフォーマットで蓄積）。
- レビューで検出した High/Medium 課題は **README の「コード健全性 / 既知の課題」セクションに反映**し、未解消であることを可視化する（隠さない）。

## デプロイ先の構成

手順は [docs/branching.md](docs/branching.md)、仕組みの中身は [docs/deploy-pipeline.md](docs/deploy-pipeline.md)。

- **VPS**: CoNoHa VPS — Docker Compose で本番 (`app_prod:3000`) と検証 (`app_dev:3001`) を並走
- **VPS のリポジトリ**: `/root/gmo-onair` (本番), `/root/gmo-onair-dev` (検証の worktree)
- **DB**: 単一 PostgreSQL を DB 名で分離 (`onair_prod` / `onair_dev`)
- **イメージ**: `ghcr.io/terai-takehiro/gmo-onair` の `:prod` / `:dev` / `:sha-<SHA>` / `:vX.Y.Z`

## セキュリティポリシー

### 絶対にやってはいけないこと
- `.env` や認証情報をGitにコミットしない（.gitignore済み）
- APIキー・パスワード・JWTシークレットをソースコードにハードコードしない
- 本番DBの接続情報を開発環境のコードやログに出力しない
- `JWT_SECRET` にデフォルト値(`dev-jwt-secret-do-not-use-in-production`)を本番で使わない

### 認証
- **開発**: `GOOGLE_CLIENT_ID` 未設定 → mockAuth自動有効（ユーザーカード選択式）
- **本番**: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` 設定 → Google OAuth自動有効
- JWT: HTTP-only cookie + Authorization Bearerヘッダーの二重送信
- 招待制: Googleログインは `users` テーブルに登録済みのメールアドレスのみ許可

### 環境変数の管理
- `.env.example` をテンプレートとして使用（`cp .env.example .env`）
- 本番の `JWT_SECRET` は `openssl rand -hex 32` で生成
- 本番の `DB_PASSWORD` は十分な長さのランダム文字列を使用
- Docker Compose は `.env` ファイルから自動読み込み

### 開発環境
- ローカル開発は `.devcontainer/` (Dev Containers) を使用して隔離
- コンテナ内で `npm install` + `npm run dev` が完結する構成
- ホストマシンの認証情報やSSHキーはコンテナに渡さない

## BOXフォルダ構造 (将来: 案件ごと)
```
📁 GMO_Studio/
├── 📁 GLS001_案件名/
│   ├── 📁 01_見積・提案/      ← ONAiRが書く
│   ├── 📁 02_発注・契約/      ← ONAiRが書く
│   ├── 📁 03_請求/            ← ONAiRが書く
│   ├── 📁 04_Qシート/         ← Qシートアプリが書く
│   ├── 📁 05_台本・進行表/
│   └── 📁 06_納品物/
```

## CoNoHa VPS構成 (6ブロックアプリ)
```
CoNoHa VPS (2GB RAM)
├── Nginx (リバースプロキシ + SSL)
│   ├── /              → 案件管理 (client/)
│   ├── /qsheet/       → Qシート (client-qsheet/)
│   ├── /equipment/    → 機材管理 (client-equipment/)
│   ├── /techsheet/    → 技術資料 (client-techsheet/)
│   ├── /live/         → 計時LIVE (client-live/)
│   └── /awards/       → リアルタイムCG (client-awards/)
├── Express サーバー (port 3000)
│   ├── /api/v1/internal/* — 全ブロックアプリ共通API
│   ├── Socket.IO: /qsheet, /awards, liveops, quiz
│   └── 各ブロックアプリの静的ファイル配信
├── PostgreSQL 16
│   └── 単一DB: projects, qsheet_documents, equipment_items, techsheet_documents, liveops_*, awards_*, ...
└── Volume: pgdata

## 別 VPS (外部リンク)
- https://interactive.gmo-onair.jp/ — インタラクティブ演出 (EventStamp / リアルタイム)
- https://gmo-translate.jp/ — GMO 翻訳ツール
```
