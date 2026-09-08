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
| 制作技術支援 (中の Qシート) | [`client-techops/`](client-techops/CLAUDE.md) | `/techops/`（旧`/qsheet/`も後方互換で生存） | 5174 | 凍結解除中 | 台本作成・本番進行 (進行/ランダウン/プロンプター/音声サポート)＋計時・視聴者のミニアプリ。旧「制作資料」を 2026-08-22 に改名・大アプリへ格上げ。qsheet→techops 改名は Phase 1〜4 済み（旧URL・旧MCPツール名はブリッジ/二重登録で互換維持。`permissionModule`・DBは `qsheet` のまま、詳細は[docs/reviews/qsheet-techops-migration-plan.md](docs/reviews/qsheet-techops-migration-plan.md)） |
| 計時・視聴者 | [`client-live/`](client-live/CLAUDE.md) | `/live/` | 5178 | **対象** | タイマー・視聴者カウンター。運用画面は共通シェル・v4トークン化済み。**表示画面 (`/live/display/`) だけ例外**（見た目を変えない） |
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | `/awards/`（URL到達不可） | — | **廃止** | 放送CG演出・送出。**後継の「テロップCG」（`client-techops/src/pages/graphics/`）へ機能を移し終え、2026-09-06 に段F（畳み込み）を実行して廃止した。** コードは参照用にリポジトリへ残すが、サーバーの配信・API・Socket.IO・ビルド対象・画面上の入口をすべて外し、Webサイトのどこからも到達できない。過去実績データ（`awards_events`等）はDBに残っており、テロップCG側の移行ツール（設定＞連携＞過去実績の移行。system_admin限定）が読む。経緯は [docs/v4-plan.md](docs/v4-plan.md) の「用語」 |
| 共通ライブラリ | [`shared/`](shared/CLAUDE.md) | — | — | **対象** | トークン・UI部品・共通シェル。**触ると全アプリに効く** |

**「凍結」「凍結解除中」「廃止」の定義と経緯は [docs/v4-plan.md](docs/v4-plan.md) の「用語」の節。**
制作技術支援の残作業（表本体・`EditorSidebar`・本番系画面の作り直し）は
[`client-techops/CLAUDE.md`](client-techops/CLAUDE.md)。

### 外部リンク (別 VPS / 別タブで開く)
| アプリ | URL | 概要 |
|---|---|---|
| インタラクティブ | https://interactive.gmo-onair.jp/ | EventStamp・リアルタイム演出 (別 VPS) |
| 翻訳 | https://gmo-translate.jp/ | GMO 翻訳ツール |

## Claude の応答言語ポリシー
- **作業中（ツール呼び出しの説明・思考過程など）は英語で処理してよい。**
- **チャットでユーザーに返す最後の返信は、必ず簡潔な日本語**にする
  (処理内容の垂れ流しではなく、結論・状態・次のアクションが分かる短い要約)。

## 技術構成
- **フロントエンド**: React 18 + Vite 6 + TailwindCSS 3 + shadcn/ui
- **バックエンド**: Express + PostgreSQL (pg)。1つのサーバーが配信中5アプリ（廃止済みのリアルタイムCGを除く）の静的ファイルを配信する**単一イメージ構成**
- **モノレポ**: npm workspaces (client, client-daily, client-equipment, client-techops, client-live, client-awards, server, shared)
- **リアルタイム**: Socket.IO (`/techops` ネームスペース: OnAir↔ランダウン同期。旧 `/qsheet` も
  ブリッジで生存中・詳細は[client-techops/CLAUDE.md](client-techops/CLAUDE.md), awards/quiz/liveops 各ネームスペース)
- **デプロイ先**: CoNoHa VPS (Docker Compose + PostgreSQL + Nginx)

### よく使うコマンド
```bash
npm run verify:up      # 検証用 Postgres を立てる (約4秒・ポート5433・本番とは完全分離)
npm run dev            # 既定3アプリ + server  (全アプリは dev:all)
npm run typecheck      # 既定3アプリ + server  (CI は typecheck:all = 廃止アプリを除く全ワークスペース)
npm run build:changed  # 変更したワークスペースだけビルド (全部だと2分)
npm run verify:ui      # 実ブラウザで書体・桁揃い・横はみ出しを実測
npm run fonts          # LINE Seed JP を同梱し直す (v4 対象アプリは Google Fonts を読まない)
npm run lint           # eslint ほか各種検査  /  npm run check:version  # バージョン表記の整合
npm run test           # shared の Vitest (**CI が回す。手元の gate にも必ず入れる**)
```
`build` / `typecheck` / `dev` の既定が3アプリなのは**手元の速さのため**。
本番は Dockerfile が**廃止アプリを除く全アプリ**をビルドする。

### どこに何が書いてあるか
| 知りたいこと | 読む場所 |
| --- | --- |
| v4 の開発計画・スコープ・段取り | [docs/v4-plan.md](docs/v4-plan.md) |
| **2026年10月の事業再編（社名変更・計上会社の2社化・GLS→SCS/GSS/GMO の改番）の移行設計** | [docs/reorg-2026-10-plan.md](docs/reorg-2026-10-plan.md) — 設計下書き。分岐点（§9）が決まるまで実装しない |
| **v4 でどこまで出来たか (サイトツリー)** | [docs/v4-progress.md](docs/v4-progress.md) — `node scripts/v4-progress.mjs --write` で**画面のファイルを読んで作る生成物**。手で書くとずれるので、v4 の PR では毎回作り直して本文に貼る |
| **全画面を macOS/iOS ネイティブ級にする計画（2026-08〜）** | [docs/v4-native-ui-plan.md](docs/v4-native-ui-plan.md) — PC専用を原則廃止し全画面をマルチデバイス対応にする追加の取り組み。対象範囲の決定・監査結果・バックログ |
| ブランチ・PR・リリース手順 | [docs/branching.md](docs/branching.md) |
| 環境構築から PR まで | [CONTRIBUTING.md](CONTRIBUTING.md) |
| デプロイの仕組み (GHCR・キャッシュ・戻し方) | [docs/deploy-pipeline.md](docs/deploy-pipeline.md) |
| 版ごとの変更 (過去全件のアーカイブ) | [docs/version-history.md](docs/version-history.md) |
| v4 の画面ごとの仕様 (モックから切り出したもの) | `docs/design/v4/` |
| 用語の決めごと | [docs/wording.md](docs/wording.md) |
| **どの仕事にどのモデルを使うか** | [docs/ai-models.md](docs/ai-models.md) — 段は light / heavy の2つだけ。**基準は「間違いに気づけるか」で費用ではない** |
| MCP のツール一覧 | [docs/mcp-server.md](docs/mcp-server.md) |

## 現在のバージョン
v4.6.9 — **PR #654・#655のレビュー指摘を棚卸しに移した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#654（案件作成でスタジオ予約の登録失敗を黙って握りつぶしていた不具合の修正）は📝 Code ReviewがCodexのusage limitsで未実行、🔒 Security Reviewは完走してfindingsなし。#655（GLS-B006/B009/B010の3件を番号はそのまま案件扱いに直すDBマイグレーション）も📝 Code Reviewは未実行、🔒 Security ReviewはPRマージ時点で「Running」のまま完走しなかった（#652・#648と同じ、CI green確認後まもなくのマージ）。両PRとも`get_reviews`/`get_review_comments`で0件を確認し、`docs/reviews/codex-findings-v4.md`に記録した（**表に移す未対応の指摘は無い**）。検証: `node scripts/check-md-links.mjs` 相当のリンク確認（ドキュメントのみの変更）。 **案件台帳の整合性チェック「受注しているのに実施日が無い」が、GLS-B（工事・構築のプロジェクト）まで拾っていた不具合を直した**。利用者から「GMO-0001・GMO-0002はプロジェクトなのでそもそも実施日の概念がない」というご指摘を受けて調査。他の整合性チェック（「案件分類が入っていない」「リード経路が入っていない」）は`gls_category = 'A'`だけを対象にしているのに対し、この項目だけ絞り込みが無く、実施日（`event_start`/`event_end`）という概念自体を持たないGLS-Bの案件（開始日・終了日は`started_on`/`ends_on`に持つ）が、受注段階に上がった時点で毎回「実施日が無い」と数えられ続けていた。`project-integrity.ts`のSQLに`gls_category = 'A'`を足し、他の項目と同じ絞り込みに揃えた。検証: 実Postgres（検証用インスタンス）で空DBから全マイグレーションを適用し、実施日の無いGLS-A案件・GLS-B案件のテスト行をそれぞれ作って、修正後のSQLがGLS-A側だけを拾いGLS-B側を拾わないことを確認した。 **グループ会社の案件で、リード経路が「グループ案件」に固定されていなかった不具合を直した**。利用者から「グループ内案件はリード経路でグループ内としてロックされてるはず」というご指摘。`intake.ts`のコメント通りこの値は本来「お客様が取引先マスターでグループ会社になっているとき、案件作成が固定でこの値を入れます」という決めごとだったが、実際に固定していたのは案件作成画面（`useNewProjectForm.ts`）だけで、サーバー（`project.service.ts`の`createCore`/`update`）は渡された値をそのまま受けるだけだった。MCPの`create_project`/`update_project`はそもそも`group`を選択肢に持たず、Excel・決算取込もこの列を送らないため、画面の新規登録フォーム以外の経路（AI/MCP・取込・古いデータ）で作られたグループ会社の案件はリード経路が空のまま残り、案件台帳の整合性チェック「リード経路が入っていない」に引っかかり続けていた（GLS-B006「紹介動画撮影」・GLS-B009「ようが夏まつり」など）。`customer_type`と同じく`cType`（`companies.is_gmo_group`から解決）を使ってサーバー側で常に確定させるようにし、既存データも同じ規則（人が明示した値は上書きしない・空のものだけ埋める）で埋め戻すマイグレーションを追加した。検証: 実Postgresでグループ×NULL・外部×NULL・グループ×既存値の3パターンのテスト行を作り、マイグレーション適用後の挙動（埋まる・変化なし・上書きされない）を確認した。

v4.6.8 — **PR #650 が Codex のレビュー0件のままマージされたことを記録に残した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」／`.claude/skills/pr-watch/references/pitfalls.md` の決めごと）。①一次情報で確認したところ `get_reviews` は空・レビュースレッド0件・Codex の要約コメント（Code Review / Security Review の ✅ 表）も一度も出ておらず、**Code Review が1巡も走らないままマージされていた**（作成 08:18:09Z → マージ 08:36:43Z＝18分34秒）。**0件と「指摘なし」は画面上で見分けが付かない**ため、`docs/reviews/codex-findings-v4.md` の「レビューが0件のままマージされた PR」に記録した（表に移す指摘は無い＝レビュー自体が届いていないため）。②この PR に付いていた唯一のボットコメントは**エージェント風の作業報告**（「コミット `edbba2e` を作り、同名の新規 PR を作成した」）で、**その成果物はリポジトリのどこにも入っていなかった** — `git cat-file -t edbba2e` は `Not a valid object name`、open な PR は #650 と #647 のみ、該当するリモート枝も無し。提案の中身（`pr-watch` の教訓への相対リンク）だけは妥当だったので、こちらで実装して push した（`5a8a65d`・相対リンク 492 → 493 本）。**エージェント風のコメントが1件付いていると「レビューが付いた」と見えてしまう**ので、レビューの有無は見た目ではなく `get_reviews` と要約表で判定する、と `pr-watch` の `references/pitfalls.md` に3つ目の教訓として足した。③**この PR（#651）自身の状態も、マージ前に同じ節へ書いた** — 連鎖を止めるため。Code Review・Security Review とも ✅ だが対象は最初のコミット `956800b` で、P2 の指摘（在籍時間の誤り）を直した `ee6e839` を読ませようと `@codex review` を投げたところ **Codex の利用上限**（`You have reached your Codex usage limits for code reviews.`）で走らなかった＝**直しそのものは誰にも読まれていない**。**要約表の ✅ は「この PR が読まれた」ではなく「その行のコミットが読まれた」**なので、`Commit` 列が頭のコミットかを必ず見る、と記録した。検証: `node scripts/check-md-links.mjs`・`npm run lint` 通過。 **PR #652（リリース v4.6.7 の版上げ）のレビュー指摘を棚卸しに移した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。📝 Code Review は Codex の usage limits で一度も実行されず、🔒 Security Review は最初のコミットでのみ完了して findings なし。CI 修正で足した2つ目のコミットにはどちらのレビューも再実行されておらず、その旨を `docs/reviews/codex-findings-v4.md` に記録した（**表に移す未対応の指摘は無い**）。あわせて、#652 で直った `npm run lint` の `check-changelog.mjs` の不具合も記録する — リリースPRの版チェック除外が「枝の名前が `release/` で始まる」ときにしか効かず、Claude Code の Web セッションが作る `claude/release-version-update-<乱数>` のような固定形の枝ではリリースPRでも通常の作業PRと誤判定されて CI の `checks` が落ちていた。判定を「枝のいずれかのセグメントの先頭が `release`」に緩め、`claude/release-…` も拾うようにした。検証: `npm run check:version`・`RELEASE=1 npm run lint`・`npm run test`（shared Vitest 164ファイル/2269件）。 **案件作成の「スタジオの日程」で会場を選んでも、案件詳細が「会場・スタジオを押さえていません」のままになる不具合を直した**。案件を新規作成したとき、入力した本番日・部屋（例: 青山）から予約を作る処理（`createInitialBookings.ts`）が、予約の作成に失敗しても `catch` で何も出さず握りつぶしていた。案件そのものは先に保存が成功しており、保存後は即座に案件詳細へ遷移するため、利用者は「登録した」つもりのまま新しい案件詳細を開き、そこには予約が1件も無い（＝会場・スタジオが実際には押さえられていない）状態になっていた。エラーが一切表示されないため、原因を追う手がかりも無かった。本番日・リハーサルそれぞれの予約作成を個別に捕捉し、失敗したときは `notifyApiError` でサーバーの理由（分かる場合）とともに「案件は保存されています。案件詳細の『登録済みの予約』から入れ直してください」と案内するようにした。案件詳細の会場表示ロジック自体（`venue.ts`）は既存の修正で正しく動作している。 **GLS-B006・B009・B010の3件を、番号はそのまま案件（GLS-A）扱いに直した**。この3件（紹介動画撮影・ようが夏まつり・GMOインターネット キックオフMTG）は実際には通常の撮影・収録・イベント業務だが、`gls_category` が'B'（プロジェクト管理）のまま発番されていた。うちB006・B010はすでに見積書を発行済みで番号（BOXフォルダ名・回のコードも連動）を変えられないため、通常のA↔B切替（採番し直し）は使えない。この3件に限った特例のDBマイグレーションで、番号はそのまま`gls_category`のみ'A'に直した。B006・B010は既に2段分類（客入れの有無×案件分類）が正しく入っており、案件台帳の整合性チェック「GLS-Bなのに2段分類が入っている」に引っかかっていた状態を解消。B009は`gpm_kind='self_build'`（プロジェクト管理の印。制約上gls_categoryが'B'でないと持てない）を外し、実態（有観客・イベント）に合わせて2段分類と`project_type`を埋め、実施日（GPM側のstarted_on/ends_onに入っていた値）をevent_start/end へ引き継いだ。検証: 実Postgresで空DBから全マイグレーションを順に適用し、B006/B009相当のテスト行を作って本マイグレーションの前後の値・整合性チェックSQL（引っかからなくなること）を確認した。

v4.6.7 — **機材メンテナンス記録の拡張・制作技術支援の一覧再設計とUI統一・「タスク・依頼」の作り直し・画面表記「GLS番号」の「管理番号」への統一など、マージ済みPR7件をまとめた**。①機材管理のメンテナンス記録に種別「記録」と修理引取／受取日を追加し、財務明細から案件詳細への遷移リンク、GLS発番可能なヨミ段階を「D 仮押さえ」まで前倒しした。②機材メンテナンスの修理日編集ダイアログで、保存中に他の操作と競合すると入力が消える不具合を直した（マージ後のレビュー指摘の追加修正含む）。③制作技術支援トップの番組・イベント一覧を本番日順に組み直し、工事・構築案件や失注案件を除外、案件台帳の絞り込みに新しい発番（SCS／GSS／GMO）を追加した。④画面表記の「GLS番号」を「管理番号」に統一した（内部識別子・DB列・発番操作の名称は変更なし）。⑤「タスク・依頼」画面をモックから設計し直し、依頼タブからの依頼作成・一覧と詳細の分離・状態での絞り込みなどを追加した。⑥制作技術支援131ファイルのUIを共通部品`<PageShell>`等で統一した。⑦マージ後に届いたレビュー指摘の棚卸し2件（PR #644・#648）を記録した。検証は各PRで実施済み（詳細はアーカイブの全文）。


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
- ⚠️ **Claude が PR を出したら、確認を待たずにその場で `.claude/skills/pr-watch` を使って見張る（マスト）。**
  「見張りますか」と訊いて返事を待つのも不可 — その間 CI 失敗もレビューも誰も見ない
- ⚠️ **マージしたら、その PR のレビュー指摘を棚卸しに移す**（`npm run reviews:debt` →
  [docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md) の表）。
  **マージすると指摘は画面から消えるので、書かなければ存在ごと消えます** —
  実測で **143 件が埋もれ、それを潰す作業にも 26 件付き、24 件が記録されていません**でした
  （うち1件は**リリースが出せなくなる P1**）。**直さないと決めたものも表から消さない。**
  手順は [docs/branching.md](docs/branching.md#マージしたらその-pr-のレビューを棚卸しに移す必須)

### バージョンと履歴

**手順の正は [docs/branching.md](docs/branching.md)。** ここは要点のみ:

- **作業 PR では版を触らない。** 代わりに `docs/changelog.d/<枝の名前>.md` に載せたい文を
  1つ置く（`npm run lint` の `check-changelog.mjs` が**両方**を強制する）
- **リリース時**に `npm run release:notes -- X.Y.Z` が3か所（ルート `package.json` /
  この文書の「現在のバージョン」/ `README.md`）とアーカイブ移動を全部やる。
  整合は `npm run check:version`。各ワークスペースの `package.json` は触らない
  （Docker のビルドスキップが無効化される）
- 画面の「バージョン履歴」は `scripts/generate-version-history.mjs` が
  **この文書（最新3件）＋ [docs/version-history.md](docs/version-history.md)（それ以前の全件）**
  から生成する。**書式を崩すとパースに失敗する**（この文書は `vX.Y.Z — **タイトル**。本文` の
  1行・アーカイブ側は全体を `(...)` で包んだ1行）
- **「現在のバージョン」は最新3件だけ・1エントリ＝タイトル＋2〜3文まで。** 長い経緯は
  該当のレビュー文書に書いてリンクする。詳細を残したい版は**全文をアーカイブ側に置けば
  画面は長いほうを表示する**（この節は毎ターン文脈に載るため、貯めると全作業のコストが上がる）

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
- **本番へ出す（GitHub Release の公開）は、ユーザーの明示的な指示があるときだけ。**
  いかなる理由があっても Claude が自分の判断で公開しない。`main` への直接 push も禁止（PR のみ）

デプロイの流れ: PR を `main` にマージ → 検証環境に自動デプロイ。本番はユーザーが
Release（タグ `vX.Y.Z`）を公開したときだけ。手順・戻し方は
[docs/branching.md](docs/branching.md) と [docs/deploy-pipeline.md](docs/deploy-pipeline.md)。

### バージョン確認コマンド (VPS)
```bash
cd /root/gmo-onair && git log --oneline -1                    # 現在のコード
curl -sk https://dev.gmo-onair.jp/health                       # 検証稼働確認
curl -sk https://gmo-onair.jp/health                            # 本番稼働確認
```

### DB バックアップ・復元運用
3時間ごとの自動バックアップ（BOX保存）と復元CLIがある。手順は
[docs/ops/db-backup-restore.md](docs/ops/db-backup-restore.md)。

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

## コード健全性ポリシー

依存関係のバージョン整合性・ビルド設定の同期・Lint基盤・TODO管理・定期セルフレビューの
方針は [docs/reviews/2026-04-28-code-health.md](docs/reviews/2026-04-28-code-health.md)
（2026-04-28 codex フルレビューからの学び）。

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
- **切替は `AUTH_MODE` 環境変数**（`server/src/config.ts`）: `password` = Email/Password + SMS 2FA ／
  `mock` = ユーザーカード選択式。未指定なら本番（`NODE_ENV=production`）は `password`・開発は `mock`
- JWT: HTTP-only cookie + Authorization Bearerヘッダーの二重送信
- Google の資格情報（`GOOGLE_CLIENT_ID` 等）は**カレンダー連携専用**。ログインには使わない

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
未実装の将来設計。[docs/architecture/box-folder-structure.md](docs/architecture/box-folder-structure.md)。

VPS構成・ブロックアプリのパス対応は先頭の「ブロックアプリ一覧」表を参照
（重複するASCII図はここでは持たない）。
