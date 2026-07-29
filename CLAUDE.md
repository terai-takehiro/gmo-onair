# GMO ONAiR - プロジェクトメモリ

## プロジェクト概要
GMO ONAiR = GMOグローバルスタジオの制作管理プラットフォーム（会社OS）の総称。
複数の「ブロックアプリ」を束ねるプラットフォームであり、特定の機能を指す名称ではない。
GLS番号を中核として全アプリのデータが紐づく。

### ブロックアプリ一覧
| アプリ | ディレクトリ | ベースパス | ポート | 概要 |
|---|---|---|---|---|
| 案件管理 | `client/` | `/` | 5173 | 案件・売上・仕入・損益管理 |
| Qシート | `client-qsheet/` | `/qsheet/` | 5174 | Qシート作成・OnAir・ランダウン |
| 機材管理 | `client-equipment/` | `/equipment/` | 5175 | 機材台帳・貸出管理 |
| 技術資料 | `client-techsheet/` | `/techsheet/` | 5177 | カメラ・映像・音声技術仕様書 |
| ライブ運用 | `client-live/` | `/live/` | 5178 | 本番オペ・進行管理 |
| リアルタイムCG | `client-awards/` | `/awards/` | 5179 | リアルタイム放送CG演出・送出管理 (内部識別子は `awards` のまま) |

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
- **バックエンド**: Express + PostgreSQL (pg)
- **モノレポ**: npm workspaces (client, client-qsheet, client-equipment, client-techsheet, client-live, client-awards, server, shared)
- **リアルタイム**: Socket.IO (`/qsheet` ネームスペース: OnAir↔ランダウン同期, awards/quiz/liveops 各ネームスペース)
- **デプロイ先**: CoNoHa VPS (Docker Compose + PostgreSQL + Nginx)

## 現在のバージョン
v3.0.6 — **投入欄「AIに投げる」を要約止まりからONAiR全機能の実行提案に広げ、ヨミ変更とGLS発番ができなかった2つのバグを直した（ユーザー指摘3件）**。①**AI がタスクしか作れなかったのを ONAiR の操作 11 種に広げた**。従来の投入欄 (`/dailyops/tasks/intake`) は「誰に / 何を / いつまでに」だけを読み取っていたため、実際に投げられる文（新規の引き合い・見積の相談・スタジオを押さえたい）のうち**タスクに見える部分だけが残り、残りは要約すら残らずに落ちていた**。行動カタログ (`action-catalog.ts`) を正として、案件をつくる / お客様を登録する / ヨミを動かす / GLS発番 / 見積の下書き / スタジオ仮押さえ / 営業活動の記録 / 問い合わせ / 議事録 / 案件メモ / タスク・依頼 の 11 種から AI に選ばせる。**カタログを1ファイルに置いた**のは、プロンプト・実行器・画面の3か所が同じ一覧を必要とし、分けて書くと「提案できるのに実行できない操作」が必ずできるため。②**実行は既存 service を呼ぶ**（`projectService` / `saveEstimate` / `studioBookingService` / `activityLogService` / `keepReportService` / `inquiryService` / `appendNotes` / `myTasksService`）。ここで SQL を書き直すと BOX フォルダ生成・ステージの必須チェック・粗利計算が片方だけ抜け「画面から作った案件」と「AIが作った案件」で中身が変わる。ステージ変更は画面と同じ `assertStageRequirements` を通すので、日付や部屋が無い仮押さえは AI 経路でも止まる。③**AI を通しても権限は増えない**。実行は1件ずつ**押した人**の権限 (`meetsPermissionLevel`) で確かめ、足りない1件だけ止めて残りは実行する（権限なしの人が案件を作れないことを実 DB で確認）。④**押すまで1件も登録されない**。既定チェックは「足りないものが無く・取り消せない操作でもなく・確からしさ0.6以上」のときだけ ON。**GLS発番は確からしさ0.95でも既定OFF**（番号を1本消費して取り消せない）。⑤**フィードバックループを最初から満たした**（会社方針「AIを使い捨てにしない」5条件）。`ai_action_plans` (migration 155) に投入文と行動案を凍結し、**実行結果は別カラム (`results`) に持って下書きを上書きしない**（上書きすると教師データが実行のたびに消える）。差分は `action_key` で突合して `ai_corrections` へ `fix`/`reject`/`none` の3種で積み、`getFeedbackDigest('ai_action_plan')` の助言を**次の解析のプロンプトに載せる**（助言を載せた回は `prompt_version` を `+fb` で分け、効果を比較できるようにした）。**実行して落ちたものも `reject` + 理由で残す**（AI が前提の不足を見落としたケースは人の修正とは意味が違う）。⑥**「これから作るもの」を「読み取れなかった」と数えない**。「A社から相談 → 案件をつくる」では案件側の `customer_id` は AI に知りようがなく必ず空になる。これを不足として扱うと**まだ存在しないお客様を人に選ばせる**ことになり一番普通の使い方が毎回止まるため、**id が空のときだけ**「先に作るものを使う」と解釈する。id が入っていて解決できなかった場合は取り違えなので繋がない（繋ぐと「B社の件」の提案がいま作った A社の案件に当たる）。⑦**AI 未設定の環境ではできるふりをしない**。「どの操作にするか」は規則では決められないので、画面は従来のタスク投入欄に自動で戻る（タスクの投入は規則ベースで動き続ける）。⑧**案件のヨミ（ステージ）が変更できなかったバグを修正**。案件詳細の JourneyPanel → 確認ダイアログは `{stage}` だけを送っていたため、仮押さえ・見積提案・受注はサーバーの必須チェックで**必ず 400 になっていた**（実 API で再現: 「仮押さえに進めるには 本番日 と 使用する部屋 が要ります」）。しかも `stageMutation` に `onError` が無く画面に何も出ないため「押しても変わらない」ように見えていた。一覧（ボード）が前から使っていた `StageAskDialog` を案件詳細でも通し、足りない1〜2問をその場で聞くようにした上で、両方に `onError` を追加した。あわせて `STAGE_ASKS.a_won.auto` が「GLS番号の採番」を自動と書いていた（実際には起きない）のを実態に直した。⑨**GLS発番ができなかったバグを修正**。`glsDialog.open` を true にする箇所が**どこにも存在せず**、発番ダイアログを開く入口が落ちていた（v2.9.258 の案件ワークスペース再構成で消え、ダイアログ本体と発番処理だけが残っていた）。未発番の案件に「GLS発番」のカードを戻し、発番・紐づけの mutation にも `onError` を追加した。⑩**検証**: 全9ワークスペースの型チェック・ビルド通過、`eslint` 0 errors / 77 warnings（着手前と同数）、`check-ui-tokens.mjs` 禁止パターン違反0（710ファイル）。**実 Postgres で 49項目** — 存在しない id を落とす / 壊れた期限を落とす / 知らない操作を捨てる / 不足を「聞くこと」に上げる / GLS発番が既定OFF / お客様→案件→見積→予約→活動記録→タスク→ステージ→メモ→議事録→問い合わせ→発番の11件連鎖が全部成功 / 先に作ったお客様が案件に引き継がれる / 明細に AI の印が付く / 権限なしは実行されず実際に作られない / 持っている権限の操作だけ実行される / 無修正は none・直したら fix・外したら reject / 実行時エラーも差分に残る / 下書きが実行後も凍結されている / ステージの必須が AI 経路でも止まる。**構造化出力のスキーマ変換 10項目**（strict モードの required 25/25・nullable を作っていない）。**HTTP 経路**はモックの provider を立てて投入→提案→実行→二重実行の拒否まで通した。

(v3.0.5 — **予定ページのスマホ用リスト表示で、長い予定名がある行だけ表がまだ画面より広がっていたのを直した**（v3.0.4 で main の横スクロールは塞いだが、原因の列そのものは直っていなかった）。FullCalendar のリスト表示 (`.fc-list-table`) は `table-layout: auto` で、タイトル列に幅指定が無い。予定名の表示には `truncate`（`white-space: nowrap` を含む）を使っているが、折り返さない文字列の**自然な全文の幅**がそのまま列の最小幅として扱われるため、「GMO-I , GMO-AIR 内覧, SHOTOKUペデスタル…」のような長い予定名がある行では、表そのものが画面幅を超えて広がっていた（省略記号は効かず、はみ出た分がそのまま見えていた）。タイトル列に `max-width: 0; width: 100%` を指定してこの列だけ伸縮可能にし、`truncate` の省略記号が正しく効くようにした（`client/src/index.css`）。あわせて、原因を1つに絞れなかった場合の保険として、カレンダーの外枠にも `overflow-x-auto` を追加（ページ全体ではなくカレンダーの中だけでスクロールする形にする、`client/src/contexts/production/pages/SchedulePage.tsx`）。Playwright で同じ列構造を再現し、修正前は表が390pxの枠に対して790px（超過）、修正後は390px（超過なし）であることを確認した。検証: 全9ワークスペースの型チェック・ビルド通過、`eslint` 0 errors / 77 warnings（着手前と同数）、`check-ui-tokens.mjs` 禁止パターン違反0（704ファイル）。)

(v3.0.4 — **スマホで画面全体が横にずれて左端の文字が欠ける崩れを直した（予定ページで発見）**。共通シェル `AppShell` の `<main>` は `overflow-y-auto` だけを指定し `overflow-x` を指定していなかった。CSS の仕様では、`overflow-y` が `visible` 以外のとき `overflow-x` が `visible` のままだと**暗黙に `auto` 扱いに昇格する**ため、中の要素（この画面ではスマホ用カレンダー = FullCalendar の日表示）が画面幅を一瞬でも超えると `<main>` ごと横スクロール可能になっていた。ヘッダー（検索・通知ベル・アバター）は `<main>` の外にあるため無事なまま、`<main>` の中身（凡例・カレンダー等）だけが横にずれ、「メンテナンス」が「ンテナンス」に見えるなど左側の文字が一律に欠けて見えていた。`<main>` に `overflow-x-hidden` を明示して昇格を止め、横スクロールの入口自体を塞いだ（個別の表を `overflow-x-auto` で囲む既存ルールとは別に、シェル側で二重に防ぐ形）。Playwright でホイールスクロールを模した再現テストを行い、修正前は `scrollLeft` が動いてしまう（`overflow-x: auto`）のに対し、修正後は `scrollLeft` が 0 のまま動かない（`overflow-x: hidden`）ことを確認した。共通シェルの修正のため全9アプリに反映される。検証: 全9ワークスペースの型チェック・ビルド通過、`eslint` 0 errors / 77 warnings（着手前と同数）、`check-ui-tokens.mjs` 禁止パターン違反0（704ファイル）。)

(v3.0.3 — **スマホで通知ベルのパネルが左端から欠けて見える崩れを直した**。通知ベルは上辺の最右端の要素ではなく、その右にユーザーメニューが続く。パネル (`w-[min(92vw,420px)]`、ほぼ画面幅) をベルの親要素に `absolute right-0` で相対配置していたため、パネルの右端はベルの右端に揃うが、ベルは画面の真の右端より内側にあるぶん、ほぼ画面幅のパネルの左端が画面外（負の座標）にはみ出し、`AppShell` 直下の `overflow-hidden` に切り取られていた（スマホの実機で確認: 文字が左から30px前後欠けて見えていたのはこれが原因）。同じ上辺にある「⋯」メニュー・ユーザーメニューは既に `createPortal` で `document.body` に描画し実測位置で `fixed` 配置する方式で、この問題を回避できていたため、通知ベルのパネルも同じ方式に揃えた（`shared/src/client/notifications/NotificationBell.tsx`）。ベルの実測位置から右余白を計算しつつ、画面幅ぶん近いパネル幅でも左端が画面外に出ないよう余白の上限をクランプする処理も追加。Playwright で「ベルの右にアバターがある」状態を再現し、修正前は `left: -32.8px`（切り取られる）、修正後は `left: 8px`（画面内に収まる）であることを確認した。検証: 全9ワークスペースの型チェック・ビルド通過、`eslint` 0 errors / 77 warnings（着手前と同数）、`check-ui-tokens.mjs` 禁止パターン違反0（704ファイル）。)

(v3.0.2 — **配信媒体トグルで「ネットメディア」等が2行に折り返れる崩れが v3.0.1 でも一部残っていたのを直した**。v3.0.1 で `cols={{ base: 2, sm: 3 }}` → `cols={{ base: 2 }}` に固定したが、2列でも「ネットメディア」（7文字）は枠に収まりきらず「ネットメ」「ディア」に折り返れたままだった。折り返し自体をやめ、`ToggleCard` の共通ラベル部品 (`shared/src/client/ui/toggle-button-group.tsx`) に**枠の実幅に収まる比率へ横方向だけ縮める(長体)処理**を追加。外枠 (overflow-hidden) と中身 (scaleX) を同じ要素にかけると縮める前の幅で先に切り取られ「YouTub」のように末尾が欠けるため、外枠と中身を別要素にする2重構造にした。下限を設けて縮小を打ち切ると下限を超えた分だけ欠けて表示されるため、下限は設けず常に枠にぴったり収まる比率で縮める（極端に狭い枠では文字が小さくなるが、欠けたり折り返したりはしない）。この部品は `ToggleButtonGroup`/`ToggleCard` 全使用箇所（顧客区分・所属案件・機材印刷列など）に共通適用されるため、Playwright で複数の枠幅（32px〜142px）を模した検証を行い、どの幅でも1行に収まり文字が欠けないことを確認した。検証: 全9ワークスペースの型チェック・ビルド通過、`eslint` 0 errors / 77 warnings（着手前と同数）、`check-ui-tokens.mjs` 禁止パターン違反0（704ファイル）。)

**v2.9.283 以前の履歴は [`docs/version-history.md`](docs/version-history.md) にあります** (CLAUDE.md が毎ターン読み込まれるため、最新5件だけをここに置く。画面の「バージョン履歴」は両方を読むので全件表示のまま)。

## 開発の絶対原則: AIを使い捨てにしない (必須チェック)

会社方針。**AI 機能を作る・変えるときは必ず**フィードバックループを設計に組み込む。
AI を一度使って終わりにすると人間の修正コストが永久に減らず、直した労力が資産にならない。

**回すループ**: ①AIが業務を実行 → ②4つのフィードバックを回収 (業務結果 / 人間の修正差分 / 顧客反応 / 成果指標) → ③AI改善に反映 (プロンプト・ナレッジ・学習データ) → ①に戻す

**設計時に必ず満たす5条件**: 1) AI出力を記録・保存 2) 人間の修正を差分として残す 3) 顧客反応と成果指標を出力に紐づける 4) 貯めたデータをAI改善に戻す経路 5) レビュー頻度と担当を決める

**運用**: AI/MCP/スキル/自動化の設計・変更時は `.claude/skills/ai-feedback-loop/` のスキルを使い、
5条件の充足表を出して**抜けを明示**する。経路が作れない要素は「できない」で止めず必ず代替案を添える。
ONAiR の現状 (何が既にあり、どこが穴か) は同スキルの `references/onair-current-state.md` に集約済み。
AI が関与しない UI 修正・CRUD・デプロイ作業には適用しない。

## ブランチ運用
- **ブランチは `main` (本番) と `dev` (検証) の 2 本のみ** (v2.5.3 で master / claude/* / *-reference を全廃止)
- **本番デプロイ**: `main` ブランチへの push で GitHub Actions が auto-deploy
- **検証デプロイ**: `dev` ブランチへの push で GitHub Actions が auto-deploy
- **バージョン管理**: インクリメンタル（v1.1.93, v1.1.94...）、大きくジャンプしない
- **バージョン更新ルール**: プッシュする際は必ずパッチバージョンを上げる（例: v1.1.94 → v1.1.95）。
  **メジャー/マイナー番号 (先頭2つ) はユーザーが明示的に指示したときだけ上げる**
  （例: v3.0.0 は「現場の道具の共通基盤統合＋UI刷新」という節目をユーザーが指定した版。
  以降は v3.0.1, v3.0.2 … とパッチ単位に戻る。大きくジャンプしない原則は変わらない）。
  以下の全箇所を同時に更新すること:
  1. `CLAUDE.md` の「現在のバージョン」
  2. ルート `package.json` の `"version"` ← **バージョンの唯一の情報源**
  3. ~~各ワークスペース `package.json`~~ → **更新しない (v2.9.238 で方針変更)**。
     各ワークスペースの `version` は**どこからも読まれていない** (画面表示はルート
     `package.json` → `vite.config.ts` の `__APP_VERSION__` に一本化済み)。一方これを
     更新すると Docker の全ビルドステージが無効化され「変更のないアプリはビルドを
     スキップ」が効かず、デプロイが 2〜3 分伸びる (詳細: `docs/deploy-pipeline.md`)。
     ワークスペース側は固定値のままにすること。
  4. `README.md` の「現在のバージョン」＋「バージョン履歴（抜粋）」に新バージョン行を追記（本番プッシュ時は GitHub 上の README も同期更新される）
  5. コミットメッセージに `vX.X.X` を明記
  6. **プッシュ完了後、チャットでバージョン番号とデプロイ先（dev/main）をユーザーに必ず報告すること**
- **バージョン履歴 (ヘッダーの「バージョン履歴」ボタン)**: 情報源は 2 ファイル — `CLAUDE.md`「現在のバージョン」節 (**最新5件だけ**) と `docs/version-history.md`「過去のバージョン」節 (それ以前の全件)。`scripts/generate-version-history.mjs` が **この順で連結してパース**し `client/public/version-history.json` を生成 (`client` の `predev`/`prebuild` で自動実行、手動更新不要)、`shared/src/client/versionHistory/VersionHistoryModal.tsx` が fetch して一覧表示 + JSON ダウンロードを提供する。**「現在のバージョン」節のフォーマット (`vX.X.X — **タイトル**。本文` / 履歴化した過去バージョンは全体を `(...)` で包む) を崩すとパースに失敗するため、直接編集する際は既存エントリの書式に厳密に合わせること。**
- **履歴を CLAUDE.md に溜めない (重要)**: CLAUDE.md は**コーディング中に毎ターン全文が読み込まれる**。履歴を全部ここに置いていた時期は本文 828KB のうち 96% が履歴になり、1ターンごとの読み込み量が膨れて作業そのものが遅くなっていた (v2.9.278 で切り出し、58KB に)。**新しい版を足したら、6件目に押し出された版を `docs/version-history.md` の「## 過去のバージョン」直下へ移すこと。** CLAUDE.md に残すのは常に最新5件。

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

### 数字と見出しは部品から選ぶ (6章 / v2.9.288)

**画面ごとに手で書かない。`npm run lint` の先頭で `scripts/check-ui-tokens.mjs` が止める。**

| 出したいもの | 使うもの | 置き場所 |
| --- | --- | --- |
| 金額 (表・並べて比べる) | `<Money value={n} />` / `<MoneyCell />` | `shared/src/client/ui/money.tsx` |
| 金額 (文の中) | `formatCurrency(n)` | `shared/src/client/format.ts` |
| 万円に丸めた金額 | `manYen(n)` / `<ManYen value={n} />` | `shared/src/client/ui/numbers.tsx` |
| 金額でない数字 (件・本・%) | `<Num value={n} unit="件" />` | 同上 |
| 大きく見せる数字 | `<StatValue size="lg\|md\|sm">` | 同上 (`KpiCard` と同じ段) |
| ページの見出し | `<PageTitle>` | 同上 |

**手で書くと何が起きるか** (実際に起きていたこと):
`¥{n.toLocaleString()}` を手で書くと桁が揃わない。万円の丸めが `Math.round(v/10000)` と
`(v/10000).toFixed(0)` の2種類あり、**負の数で結果が違った**。大きい数字の `text-*` が
その場書きなので同じ数字が画面ごとに違う大きさで出ていた。

どうしてもその場で書く必要があるときは、その行に `ui-tokens-ok` のコメントを付ける
(理由も一緒に書く)。

### 知らせる・確認するは部品から選ぶ (v2.9.290)

**`alert()` / `confirm()` は使わない。`npm run lint` で落ちる。**

| したいこと | 使うもの | 置き場所 |
| --- | --- | --- |
| 結果を知らせる | `notifySuccess` / `notifyError` / `notifyWarning` / `notifyInfo` | `@/lib/notify` (実体は `shared/src/client/notify.ts`) |
| サーバーのエラーを知らせる | `notifyApiError(何をしようとしたか, err)` | 同上 |
| 実行してよいか訊く | `await confirmAction({ title, description, confirmLabel, tone })` | `shared/src/client/ui/confirm.tsx` |

- **取り消せない操作は `tone: 'danger'`**。赤で強調し、最初から「やめる」にフォーカスが当たる。
- **`description` に「一緒に何が起きるか」を書く**（「削除しますか？」だけでは判断できない）。
- 出る場所は各アプリの `main.tsx` に `<NoticeBar />` と `<ConfirmHost />` を**ルート直下に1組**。
  **AppShell の中に置いてはいけない** — OnAir・ランダウン・プロンプターは AppShell を通らない
  全画面ページなので、本番中に確認が出せず「停止してリセット」が黙って何もしなくなる。
- 通知は**トーストにしない**（流れて消えると「保存に失敗した」ことに気づけない）。人が閉じるまで残す。

### 読み込み中・空・エラー・権限なしは部品から選ぶ (v2.9.291)

**画面ごとに自作しない。`npm run lint` で落ちる。**

| 状態 | 使うもの | 決めごと |
| --- | --- | --- |
| 読み込み中 | `<Delayed><SkeletonRows />` / `<SkeletonCard />` | **1秒未満はスピナーを出さない**（点滅させない）。**画面の骨格は出したまま**中身だけ骨組みにする |
| 空 | `<EmptyState title description action />` | **「データがありません」で終わらせない**。何が無いのかと**次にやること**を書く |
| 検索0件 | `<NoSearchResults keyword activeFilters />` | **外すと出るかもしれない絞り込みを名指しする** |
| エラー | `<ErrorPanel title error onRetry />` | 原因1文 + 次の一手1文。**HTTPコード・スタックは画面に出さない**（console に留める） |
| 権限なし | `<NoPermissionPanel modules level target />` | 白紙にしない。**必要な権限を名前で出す** |

すべて `@gmo-onair/shared/src/client/states` から使う。**`EmptyState` はここにしかない**
（`shared/dashboard/` にもう1つあったが v2.9.291 で消した）。

**枠付きパネルにしない方がよい場所もある**: カードの中の1行の状態表示（「待たせているものは
ありません」= 良い知らせ）、検索欄の注記、高さの小さい選択リストの中。そこは1行のまま
「何が無いか + 次にどうするか」を書く。検査に引っかかったら `ui-tokens-ok` と**理由**を同じ行に書く。

### 色は共通トークンから選ぶ / 土台は 1 ファイル (v2.9.297)

**Tailwind の生パレット (`slate-800` `amber-500` …) を画面に書かない。`npm run lint` で落ちる。**

| 出したいもの | 使うもの |
| --- | --- |
| 面 | `bg-background`（アプリの地）/ `bg-card`（カード）/ `bg-muted`（操作の面）/ `bg-accent`（hover） |
| 文字 | `text-foreground`（主）/ `text-muted-foreground`（副） |
| 状態 | `success` / `warning` / `destructive` / `info`。**帯の背景は `-surface`、帯の上の文字は `-strong`** |
| AI | `ai` (#6d28d9)。**AI が作ったもの・AI に投げるものだけ**。種別の色分けに使わない |
| 見分けるための色 | `cat-1`〜`cat-8`。話者・ブロック種別・権限レベルなど**意味を持たない色分け** |

- **状態の色を色分けに流用しない。**「話者3が赤」なのか「話者3に異常がある」のか区別が付かなくなる。
- **文字色に透明度を掛けない。** 補助テキストは **#5d6470 以上の濃さ**（`#8b929c` は白地で 3.08:1 で AA 不成立）。
- **`bg-warning` の上は `text-warning-foreground`（濃い文字）。** 白は 2.3:1 で読めない。
  明るい下地の上に山吹の文字を置くときは `text-warning-strong` (#b45309)。
- **放送に出る絵と紙に出る絵は対象外**（CG本体・プロンプター・計時の表示機・技術資料の印刷・ラック図）。
  検査の `NOT_A_SCREEN` に列挙してある。

**各アプリの土台は `shared/src/client/base.css` 1本。** `index.css` はこれを import してから
アプリ固有の CSS だけを書く。`tailwind.config.ts` は `presets: [preset]` を継承し、`content` に
`'../shared/src/client/**/*.{js,ts,jsx,tsx}'` を必ず入れる（**入れないと共通部品のクラスが1つも
生成されず画面が崩れる**）。3つとも `npm run lint` が見ている（`app-foundation`）。

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

## デプロイフロー（必須手順）
1. **検証環境 (dev.gmo-onair.jp)** — `dev` ブランチにプッシュ → 自動デプロイ
   - デプロイ前にバージョン番号を必ず更新すること（package.json + 各サブアプリ）
   - デプロイ完了後、チャットでユーザーに通知すること
2. **本番環境 (gmo-onair.jp)** — ユーザーからチャットで承認を受けてから `main` にマージ・プッシュ
   - 勝手に本番デプロイしない。必ずユーザーの明示的な指示を待つ
   - デプロイ前にバージョン番号を必ず更新すること
   - デプロイ完了後、チャットでユーザーに通知すること
- **VPS構成**: CoNoHa VPS (133.117.74.239) — Docker Compose で本番(`app_prod:3000`)と開発(`app_dev:3001`)を並走
- **VPSリポジトリ**: `/root/gmo-onair` (main), `/root/gmo-onair-dev` (dev worktree)
- **DB**: 単一PostgreSQL、DB名で分離 (`onair_prod` / `onair_dev`)

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

## 統合プロジェクトライフサイクル (Phase A完了)
- 旧: `opportunities`テーブル + `projects`テーブル → 統合: 単一`projects`テーブル
- `stage`フィールド: neta → d_hold → c_proposal → b_verbal → a_won → s_completed / e_lost
- `gls_number IS NULL` = ヨミ段階, `IS NOT NULL` = GLS発番済み
- GLS発番は別エンドポイント: `POST /projects/:id/issue-gls`
- タグベースの案件分類 + `project_groups`テーブルによる費用按分グループ（売上・仕入の按分配分に使用）

---

## ロードマップ

### NOW: CoNoHa VPS移行
ONAiRをRenderからCoNoHa VPSに移行し、本番運用可能な状態にする。
- [x] PostgreSQLへのDB切り替え (sql.js → PostgreSQL)
- [x] Docker/Docker Compose対応
- [x] Nginx設定 (リバースプロキシ)
- [x] CoNoHa VPSにデプロイ (http://133.117.74.239)
- [x] 環境変数管理 (.env)
- [x] master (v0.5.3) と main (PostgreSQL) のブランチ統合
- [ ] HTTPS対応 (ドメイン取得後に SSL/Let's Encrypt)
- [ ] VPSに統合版 v0.6.0 を再デプロイ

### NOW: 3アプリ並走 (v0.6.x)
ONAiR + Qsheet + EventStamp をDocker Compose + Nginxで同一VPS上に並走。
- [x] docker-compose.yml に3サービス追加 (onair:3000, qsheet:3456, eventstamp:3001)
- [x] Nginx リバースプロキシ設定 (path-based routing + WebSocket upgrade)
- [x] PostgreSQL複数DB初期化スクリプト (onair_db + qsheet_db)
- [x] ONAiRホーム画面からQsheet/EventStampへの外部リンク
- [ ] VPSにデプロイ・動作確認
- [ ] HTTPS対応 (ドメイン取得後に SSL/Let's Encrypt)

### DONE: Qシートサブアプリ統合 (v0.7.x)
QsheetのReactクライアントをONAiRモノレポにサブアプリとして組み込む。
- [x] client-qsheet/ ワークスペース追加 (equipment方式)
- [x] Qsheet DB マイグレーション (012_qsheet_schema.sql)
- [x] qsheet サーバーコンテキスト追加 (routes + services)
- [ ] episode_id でONAiR案件と連携
- [ ] ONAiR案件画面に「Qシート」リンク追加

### DONE: EventStampサブアプリ統合 (v0.8.x)
EventStampをReact化してONAiRに統合。
- [x] EventStamp React化 (client-interactive/)
- [x] PostgreSQL マイグレーション (013_interactive_schema.sql)
- [x] Socket.IO統合 (server/src/index.ts)
- [x] インタラクティブ演出サーバーコンテキスト (routes + socket)

### DONE: UI/UX全面リニューアル
- [x] GMO Blue (#005bac) + Warm Neutrals デザインシステム導入
- [x] Noto Serif JP 見出しフォント + 全4アプリ統一CSS変数
- [x] コンポーネント warm化 (card ring shadow, input rounded-xl)
- [x] レイアウト統一 (bg-card header/sidebar)
- [x] 不要コード整理 (sql.js型, render.yaml, Opportunity型, CSVバグ修正)

### DONE: 技術資料アプリ (TechSheet) プロトタイプ
- [x] techsheet_documents テーブル (014_techsheet_schema.sql)
- [x] サーバーコンテキスト (CRUD + auth)
- [x] エディタ画面 (タブ式: ヘッダー/カメラ/映像/音声/通信)
- [x] 印刷画面 (A4 per-section, @media print)
- [ ] 機材管理DB連携 (equipment_items → techsheet内で参照)
- [ ] PDF出力

### DONE: 共有ライブラリ集約
- [x] shared/src/client/ にファクトリ関数集約
- [x] 4クライアントアプリのリファクタリング (576行削減)
- [x] 全アプリ型チェック通過

### DONE: v2.1.0 — 全アプリダッシュボードをデジタル庁ダッシュボードガイドブック準拠に刷新
「ダッシュボードデザインの実践ガイドブック」の4原則(目的に則する / 違いに気づける / 分解できる / 鮮度が高い)に沿い、全 9 ダッシュボードを再設計。
- [x] 共通パターンライブラリ `shared/src/client/dashboard/` を新設
  - `DashboardHeader` (タイトル + 期間 + 最終更新 + コントロール)
  - `KpiCard` (大きな数字 + 単位 + トレンド記号 + emphasis: default/success/warning/negative/info)
  - `SectionCard` (アイコン + タイトル + 説明 + actions + footnote)
  - `EmptyState` (icon + title + description + action)
  - `chartColors` / `chartDefaults` — DADS 準拠のニュートラル中心パレット (brand/positive/negative/warning/info/neutral + categorical 8色)
- [x] 9 ダッシュボード刷新:
  - 案件管理 (platform Dashboard, BudgetDashboard, SalesReview)
  - Qシート / 機材 / インタラクティブ / 技術資料 / ライブ (Session + Dashboard)
- [x] コントラスト比 3:1 以上・WCAG 2.2 AA focus ring・aria-*/role 強化
- [x] 全 6 client + server ビルド通過

### DONE: v2.0.0 — デジタル庁デザインシステム (DADS) 全面リニューアル
GMO ONAiR 全アプリを DADS v2.13 相当の設計思想・トークン・アクセシビリティ水準 (WCAG 2.2 AA) に統合。
- [x] `@digital-go-jp/design-tokens` + `@digital-go-jp/tailwind-theme-plugin` (MIT) を導入
- [x] `shared/src/client/tokens.css` を新設。DADS プリミティブ + GMO Blue (#005bac) セマンティック層
- [x] `shared/tailwind.preset.ts` に共通プリセット。全 6 アプリが継承
- [x] `shared/src/client/ui/` に UI プリミティブ 12 種を集約 (Button/Input/Label/Card/Badge/Dialog/Select/Checkbox/Switch/Tabs/Textarea/Separator)
- [x] 6 アプリの `components/ui/` を shared 再エクスポートに置換
- [x] `client-qsheet` の primary 上書き (#2563eb) を撤廃
- [x] ファビコン / GMO ONAiR ロゴは継続利用 (ブランド資産は保持)
- [x] 全アプリ型チェック & ビルド通過

### LATER: 制作支援アプリ (ProdSheet) — 未着手
スケジュール・スタッフ配置・ケータリング・連絡先等の制作進行支援。TechSheetと連携。
- [ ] 設計・DB設計
- [ ] client-prodsheet/ ワークスペース追加
- [ ] TechSheet ↔ ProdSheet 相互参照API

### LATER: 認証統一 (v0.9.x+)
全アプリの認証をGoogle OAuthに統一。
- [ ] mockAuth廃止 → Google OAuth 2.0 + Passport.js
- [ ] 認証統合 (全クライアントをBearer tokenに移行)

### LATER: BOX連携
御社契約のBOXをドキュメントハブとして活用。
- [ ] BOX JWT認証セットアップ
- [ ] GLS発番時にBOX案件フォルダ自動生成
- [ ] 見積書・請求書PDF → BOX自動保存
- [ ] Qシート確定PDF → BOX自動保存
- [ ] ONAiR画面にBOXドキュメント一覧表示
- [ ] 承認フロー + 外部共有 + Box Sign電子署名

### LATER: その他機能
- [ ] 見積書・請求書PDF生成機能
- [ ] マルチテナント対応

---

## Qシートアプリ情報
- リポジトリ: terai-takehiro/GMO-Qsheet-Editor (旧)、現在はモノレポ内 `client-qsheet/`
- **技術構成**: React 18 + Vite 6 + TailwindCSS 3 + shadcn/ui
- **認証**: mockAuth (dev) / Google OAuth (prod) 自動切替
- **データ**: documents テーブルに JSONB でQシート全体を保存
- **PDF出力**: pdfkit サーバーサイド生成 (A4/A3, Noto Sans JP)
- **ポート**: 5174 (dev) / 3456 (prod)
- **連携キー**: GLS番号 + エピソードコード (例: GLS002-003)
- **画面**: Dashboard, Editor, OnAir, Rundown, Login
- **Socket.IO**: `/qsheet` ネームスペース — OnAir↔ランダウンのリアルタイム同期 (cue:update/sync/next/prev/jump/play/pause/reset)

## EventStampアプリ情報
- リポジトリ: terai-takehiro/gmo_eventstamp
- **技術構成**: Express + Socket.IO + SQLite (sql.js) + Vanilla JS
- **認証**: セッションベース + Google OAuth 2.0 + TOTP 2FA
- **マルチテナント**: tenants/admins (master/admin)
- **リアルタイム**: Socket.IO 200ms集約ブロードキャスト
- **機能**: スタンプ連打、透過出力(OBS/NDI/SDI)、QRコード生成、マルチチャンネル
- **ポート**: 3001
- **CoNoHaスケーリング**: 同時接続数に応じたVPSリサイズ (512MB〜16GB)
- **ONAiR連携先**: interactiveブロックアプリ (インタラクティブ演出支援)

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

## 完了済み
- [x] Phase A: ヨミと案件の統合（サーバー+クライアント全て完了）
- [x] ダッシュボード モバイル最適化 (v0.2.1)
- [x] シードデータのリアル化（プロジェクト名・タグ・失注理由・販管費）
- [x] Qシートサブアプリ統合 (v0.7.x)
- [x] セキュリティ脆弱性修正 (SQLインジェクション・認証・CSP)
- [x] EventStampサブアプリ統合 (v0.8.x)
- [x] UI/UX全面リニューアル (GMO Blue + Warm Neutrals)
- [x] 不要コード・DB整理 (sql.js型, render.yaml, Opportunity型削除, CSVバグ修正)
- [x] Qシート ディレクター用ランダウン画面 (Socket.IO同期, 押し/巻き表示)
- [x] 技術資料アプリ (TechSheet) プロトタイプ (カメラ/映像/音声/通信シート)
- [x] 共有ライブラリ集約 (shared/src/client/) — 40+重複ファイル → ファクトリ関数化
