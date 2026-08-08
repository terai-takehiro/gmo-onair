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
| 版ごとの変更 (全423件) | [docs/version-history.md](docs/version-history.md) |
| v4 の画面ごとの仕様 (モックから切り出したもの) | `docs/design/v4/` |
| 用語の決めごと | [docs/wording.md](docs/wording.md) |
| MCP のツール一覧 | [docs/mcp-server.md](docs/mcp-server.md) |

## 現在のバージョン
v3.2.2 — **ロールバックで戻っていた「検索の権限漏れ」を塞ぎ、カレンダーの二重登録を止めた**。v3.2.1 までの内覧会に続き、**ロールバックで失われたものを 74 コミットぶん洗い出した**うえで、旧UIにも当てはまる 2 件を現行コードに合わせて実装し直した (残りは UI 刷新そのもの = v4 で作り直す分と、本番でまだ使われていなかった機能なので移植しない)。①**検索が権限を見ていなかった穴を塞いだ (セキュリティ)**。`GET /search` は `requireAuth` だけで、**ログインしてさえいれば権限が無くても** 案件名・GLS番号・お客様名・仕入先名が引けた (開くと 403 で止まるが、名前はもう見えている)。機材だけの権限の人にも見えていた。種類ごとに 案件・お客様=`sales` / 仕入先=`budget` の reader を要求し、**権限が無い種類は空で返す** (「N件あるが見せない」も漏れになるので件数も出さない)。判定は `requirePermission` と同じ `meetsPermissionLevel` を通す (写すと片方だけ緩くなる)。②**同じ ICS URL の2本目を弾く**。登録できてしまうと、以後その人の**すべての予定が2行**になる。`url_enc` は AES-GCM のランダム IV なので列に一意索引を張っても効かない。登録時に既存フィードを復号し、**保存する値とは別の「突合用の鍵」**に揃えて比べる (webcal→https・ホストの大小・末尾スラッシュだけ畳み、**パスとクエリの大小と資格情報は畳まない** — Google の非公開 URL はパスが秘密の文字列なので、小文字化すると別のフィードを同一と誤判定する)。③**ONAiR 自身のスタジオ ICS を弾く**。配る URL と入れる欄が同じダイアログに隣接しており実際に取り違えられる。取り込むとスタジオ予約が「自分の予定」に複製されて出る。④**書き戻した自分の予定を ICS 経由で取り込み直さないようにした**。Google / Outlook の取込には最初から除外があったのに **ICS 取込にだけ無く**、「書き込み連携あり + 同じカレンダーを ICS でも購読」の人はONAiR で作った予定が**すべて 2 行**になっていた。ICS の UID は提供元が `<イベントid>@google.com` の形で出すので、`@` の前が書き戻し先の id と一致するかで突合する (**列を足さずに済む**)。⑤**登録したのに画面に出ない経路を止めた**。同じ「案件の予約」を読む問い合わせが 2 つあるのに`StudioBookingDialog` はカレンダー側の鍵しか無効化しておらず、**案件詳細から登録しても予約一覧が増えず**リロードするまで古いままだった = 「登録できなかった」ように見えてもう一度入れることになっていた。カレンダーからの削除も同様に案件側を読み直す。⑥**保存できなかった理由を出すようにした**。`StudioBookingDialog` に `onError` が無く、失敗しても何も出ずに押し直されていた。実行ボタンが上辺にあるので、**理由はスクロール領域の外・ヘッダー直下**に固定する (本文末尾に置くと画面外で気づかれない)。案件詳細の予約削除が `console.error` だけで黙って失敗していたのも直した。⑦**`inview.service.ts` の `AppError` の引数が (状態, 本文, 符号) の順で書かれていた**のを、正しい (状態, 符号, 本文) に揃えた (8 箇所)。そのままだと利用者に `NOT_FOUND` と出て日本語の説明が届かない。符号で分岐している画面が無いことを確認済み。⑧**洗い出しの結果** (本番ダンプを実測): 読めなくなったのは `project_changes` 16 行 / 運営マニュアル 14 行 / `slack_dm_settings` 1 行だけで、**他の新規テーブル 17 個はすべて 0 行**。`projects.is_sandbox` も 0 行なので練習データの混入は無い。`revenues.is_estimate_origin` の 7 件だけ要注意 (旧コードは GLS 発番時に見積を確定売上へ変換するため。6 件が未発番・計 ¥18,185,000。ただし集計は全経路 `status=confirmed` で絞っているので発番するまで売上には混ざらない)。⑨**検証**: 検索の権限を実 DB + 実ルートで **12 項目** (権限なし / 機材だけ / sales / budget / system_admin / 未ログイン 401)。**修正前のコードで同じ試験を回して 権限なしに全部見えることを確認**してから修正版で塞がることを確かめた。突合鍵と ICS 除外を **18 項目** (webcal↔https / 末尾スラッシュ / ホストの大小を畳む、パスの大小・クエリ・資格情報・ポートは畳まない、`@` 前一致で自分の予定だけ除外し他人の予定は残す)。全9ワークスペースのビルド通過、server 型チェック exit 0、`eslint` 0 errors / 79 warnings (着手前と同数)。**DB 変更なし**。

(v3.2.1 — **内覧会 来場予約を、ロールバックで失われた「当日の受付が回る形」に戻した**。v3.2.0 は React error #31 (画面が真っ白) を止めるところまでで、**機能としては v2.9.250 相当の「回ごとの名簿を1枚に積む」形**に戻っていた。その後 v3.0.6 で入っていた ①同行者ごとの受付 ②日ごとの受付ページ ③受付のための検索 が無く、当日の運用が回らないため復元した。**main の実装をそのまま持ってきたのではなく、この版に無い依存 (`notify` / `states` / `aiAttribution` / `PageTitle` / `confirmAction`) を使わない形に置き換えて実装した**。①**同行者ごとの受付**: `POST /dailyops/inview/:id/companions/:companionId/check-in` を新設し、代表者の受付とは独立に1人ずつ切り替えられるようにした。当日は「代表だけ先に来て同行者は後から」が普通に起きるので、まとめて1つの状態にすると誰が来ているのか分からなくなる。`companions` (JSONB) の該当要素だけを書き換える。**編集フォームは氏名しか送れない**ので、v3.2.0 で入れた「氏名で突き合わせて受付記録を引き継ぐ」正規化がそのまま効く(実 DB で「受付済みの状態で登録内容を編集」「同行者を1名追加」「並べ替え」を通しても受付が消えないことを確認済み)。②**日ごとの受付ページ** (`/inview/:date`): 全部の回を1枚に積むと、当日の受付で目的の回に着くまでスクロールが要り来場者を待たせる。開催日ごとに URL を持たせ、受付端末でその日のページだけを開いておける形にした。`/inview` は**開催日を選ぶだけ**の画面 (日ごとの 組数/人数/受付済み と、その日にある回の内訳) に変えた。③**受付のための検索**: 受付は「田中さん」「GMO」程度の手掛かりで名簿を引くので、**カタカナ/ひらがな・全角/半角・電話のハイフンを区別せず** (NFKC → 小文字 → カタカナをひらがなへ → 区切り記号を落とす) 部分一致させる。空白区切りは AND。同行者の氏名も検索対象に入れ、氏名以外で当たったときは「検索が当たった項目」を出す (0 件の理由が分かるように)。**`/inview` 側の検索は全部の回をまたぐ** — 本人がどの回で申し込んだか覚えていないことが普通にあるため。そこから該当日の受付ページへ飛べる。日ページ側の検索もその日の全部の回を横断する (申し込んだ回を間違えて来る人がいる)。④**受付人数の数え方を是正**: 「受付 N / M名」の N を登録の件数ではなく**人数** (代表 + 受付済みの同行者) で数えるようにした。同行者ごとの受付を入れた以上、組数で数えると実際に何人来ているのか分からない。⑤**CSV の同行者行**: 従来は同行者行の来場状況に代表者の値を書いていた (同行者ごとの受付が無かった名残)。同行者自身の受付状況と受付者を出すようにした。⑥**画面を持たない部分を `inview/logic.ts` に分離**した。検索の当たり方は要件そのもの (打ち込みの揺れで空振りしない) なので、画面を立てずに素で試せるようにするため。⑦**検証**: `logic.ts` を Node から直接叩いて 22 項目(カタカナ↔ひらがな / 全角半角 + ハイフン / ふりがな / 同行者名 / AND 検索の成立と不成立 / 当たった項目 / 旧形式の文字列も読める / 受付人数 / 日キー / **CSV に `[object Object]` が出ない** / 同行者ごとの受付状況 / 並び替え)。実 Postgres 16 (migration 119 + 154 + 127 相当) に対してサーバーを 19 項目(同行者1人だけ受付 / 代表の受付が同行者に影響しない / **編集しても受付記録と id が残る** / 並べ替え + 追加でも追随 / 受付取消 / 存在しない同行者・予約は 404 / 旧形式 (文字列) は編集を通すと id が振られ受付できるようになる / companions 未指定の編集は同行者に触らない)。全9ワークスペースのビルド通過、server 型チェック exit 0、`eslint` 0 errors / 79 warnings (着手前と同数)。⑧**DB 変更なし** — migration 154 は本番で適用済みで、データは既に新しい形になっている。)

(v3.2.0 — **v3.1.5 から v2.9.250 相当の画面（UI/UX 刷新の直前）へロールバックした版**。v4 のリニューアルに向けて UI/UX を作り直すにあたり、いったん刷新前の画面に戻した。①**戻したのは画面と機能で、データベースは戻していない**（マイグレーションは前方向にしか進まないため、スキーマは 159 のまま）。そのため旧コードが知らない列・値が DB にある状態で動く。②**不課税（nontax）が 10% 課税として計算される不具合を直した**。この版の税率計算は三項演算子の連鎖で、`tc === 'exempt' ? 1 : 1.1` のように**知らない区分が 10% に落ちる**形だった。migration 156 で足した不課税がこれに当たり、税額 0 円であるべき請求書・見積書・Excel が 10% で出る。税率・税枝番・正規化を `tax-category.service` に一本化し、散っていた実装（帳票・税枝番4か所・決算取込・楽楽精算取込）を差し替えた。**`billing-key.service` だけ非課税を `1` にしており、同じ非課税の売上が作った入口によって `-1` と `-0` に分かれていた**のもここで揃う。画面側は税区分の `<SelectItem>` のハードコードを全廃して `TaxCategoryLabels` から描画するようにした（画面ごとに並べると足した区分が漏れる。実際に販管費だけ非課税が無かった）。③**売上明細を保存するたび、画面に無い列が消えるのを止めた**。`revenue_items` の保存は DELETE→INSERT の全置換で、この版の画面には単位・行ごとの仕入・仕入先・AI 由来かの入力欄が無いため、新しい版が入れた値が毎回既定値に戻っていた（本番の実データでは**単位が 68 行**入っていた）。DELETE の前に読んで品目名で突き合わせ、引き継ぐようにした。対応が取れない行は引き継がない（別の行に仕入額を付け替えるほうが危険なため）。④**内覧会の予約確認ページが真っ白になるのを直した**。migration 154 で `companions` が「氏名の文字列」から `{ id, name, checked_in_at, checked_in_by }` に変わっており、**オブジェクトをそのまま JSX に置いて React error #31 で画面全体が落ちていた**。描画・CSV 書き出し・編集欄を氏名の取り出しに通し、保存時はサーバーが氏名で突き合わせて**同行者ごとの受付記録を引き継ぐ**ようにした（そのまま文字列で上書きすると受付記録が消え、画面に受付欄が無いので誰も気づけない）。⑤**トップページのアプリ一覧を最上部に上げた**。以前は補助扱いで下から2番目にあり、Qシートや機材に行くだけで案件・お金の情報を全部スクロールする必要があった。⑥**検証環境に本番データを入れて確認した**（本番ダンプを投入し、検証側のログイン情報6名はid とメールで突き合わせて 5 名を追加・1 名は本番側を採用）。⑦**検証**: server 型チェック通過、全9ワークスペースのビルド通過、`eslint` 0 errors / 79 warnings（着手前と同数）。)

> **これより前の版は [docs/version-history.md](docs/version-history.md) にあります**（v3.1.0 以下・419件）。
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
