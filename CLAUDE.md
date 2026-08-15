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
v4.0.30 — **案件台帳を足した**（ご要望）。案件を**表で網羅して見る・選んでまとめて直す**画面です（`/sales/projects/ledger`・左メニューの「全案件」）。機材台帳と同じ作りにしました。①**「案件一覧」とは役割が別です。** 案件一覧は**毎日開いて次の一手を決める画面**で、1行に4つしか置いていません — **そこに列を足すと毎日使う画面が読めなくなる**ので分けました。**名前も分けています**（メニューに同じ名前が2つ並ぶと、どちらを開けばよいか名前から分からない）。**引くのは案件一覧と同じ口**（`GET /projects`）です — 別の口を作ると2つの画面で違う数が出て、どちらが正しいか誰にも分かりません。②**列は 20 個。既定で出すのは 9 個**で、出し入れと並べ替えができ、**その端末に残ります**（`localStorage`・別の端末では既定に戻ることを画面に書いています）。列の幅は**寸法表の7段**しか使いません（この画面だけの幅を作ると金額の桁が他の一覧と揃わない）。③**まとめて直せるのは8項目**（案件分類・社内の担当・お客様・実施日の開始/終了・申込書・ロゴ・タグ）。**1回に1項目**で、押す前に「**選んだ N 件の〈項目〉を〈値〉にします。元に戻せません**」を出します。⚠️ **ステージは入れていません** — 段を動かすと履歴（`project_stage_changes`）が1行増え、失注なら理由が要り、受注なら GLS 発番の確認が挟まりますが、`PATCH /projects/bulk` はそのどれもしません。ここから変えられるようにすると**記録の残らない段の移動**が起きます。④⚠️ **サーバーの一括更新に地雷が2つありました。** `project_type`（旧「案件種類」）を**直接書いて**おり、いまの分類は2段（客入れの有無 × 案件分類）で**旧種類はサーバーが導く**決めごとなので、**分類と種類がずれた行**ができていました（ずれると一覧と詳細で違う分類が出て、画面からはどちらが正しいか分かりません）。**2段で来たら旧種類を導き、旧種類で来たら2段を埋め戻す**形にして、**どちらの道でも3つの列が揃う**ようにしました。**片方だけの2段は 400 で止めます**（通すと `resolveClassification` が導けず、選んだ値が黙って捨てられる）。**旧 GLS 取込の画面は今までどおり動きます**（`project_type` を受け続ける）。⑤**「分類が入っていないものだけ」の絞り込みを付けました。** v4.0.27 で分かった「移行で埋め戻せなかった案件」を**ここから拾ってまとめて埋められます**。⚠️ この絞りは**画面側**なので**そのページの中だけ**です（サーバーの口に画面固有の引数を足すと、`GET /projects` を読んでいる他の画面にも効く）。そのことを画面に書いています。⑥**PC 専用**（ご判断）。列が 20 あり、取り消せない一括更新を指で押すことになるためです。**読むのは `sales` があれば誰でも／まとめて直すのは manager 以上**（サーバーと同じ）。権限が無い人には**チェックボックスごと出さず、何の権限が要るかを書きます**。⑦**検証**: 実 Postgres ＋ 実サーバー ＋ 実ブラウザで — 左メニューから開けて**既定 9 列・13 件・横はみ出し 0px・JS エラー 0**、列を足すと表頭が増える、分類なしだけで **13 → 5 行**、**片方だけでは「3 件を直す」が押せない**（`disabled`）、2つ揃えると押せて**送るのは `audience`/`project_category` だけ**（`project_type` は送らない）→ **DB は3列とも揃う**（`hybrid_event`/`with_audience`/`recording`）。**旧種類だけで送ると2段が埋め戻される**（`live_broadcast` → 無観客/配信）、**片方だけを直接叩くと 400 で DB は不変**。375px は**表を出さず案内に差し替わり行き先も出る**、**editor はチェックが 0 個で理由が出る**。`shared/tests/projectLedger.test.ts` 14項目、`npm run test` 634項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings。⑧**DB 変更なし。`shared/src/` も触っていない**ので凍結4アプリの CSS は不変（足したのは `shared/tests/` だけ）。

v4.0.29 — **スマホから古い未入金が見えず、上辺バーが違う画面の名前を出していたのを直した**（Codex のレビュー棚卸し #61・#82。P2 3件）。①⚠️ **スマホの「入金の確認」に、先月以前の未入金が1件も出ていませんでした**（P2）。今月の締め（`/billing/closing?month=`）を引いていたためで、**いちばん危ないのはその古い未入金**です（期日を過ぎたものは前の月のぶんから出ます）。しかも**スマホで入金を記録できるのはこの画面だけ**なので、**出てこない＝無いことにされます**。**実測: 未入金 39 件・期日超過 1 件のとき、前の版は 0 件**でした。月をまたぐ口（`/billing/invoices?state=unpaid`）に替え、合計もサーバーが絞り込み全体で数えたものを使います。②⚠️ **上辺バーのパンくずが、押した先と違う画面の名前を出していました**（P2）。項目は絞り込みつきの行き先（`/equipment/items?view=lend`）を持つのに、**クエリごと道と比べて**いたので一度も一致せず、**同じ道の別の項目（「機材台帳」）の名前**が出ます。**道とクエリを分けて見ます**。③⚠️ **権限で消した項目の名前がパンくずに出ていました**（P2）。左メニューは絞ってから現在地を決めるのに、上辺バーは**絞る前の並び**から名前を引いていたためで、**メニューには無い画面の名前が上辺バーに出ます**。**同じ関数（`visibleSections`）を両方が読む**ようにしました — 2か所で別々に判定していたのが原因なので、片方を直すだけでは同じ食い違いがまた起きます。④**この PR のレビューで3件指摘され、直しました**（Codex・P1×2/P2）。どれも**私がこの版で入れた変更の穴**です。(a)⚠️ **請求書を出す前の売上まで「入金待ち」に並べていました** — `unpaid` は「入金日が空」だけを見るので、**請求していないのに入金済みの行**を作れます（月次の締めは前から `invoice_issued` を要求していました）。**`unpaid_issued` を足します**（`unpaid` の意味は変えません — ⑤ の「入金前」チップが読んでいるため）。実測: `unpaid` は 40 件で未発行を含む、`unpaid_issued` は 3 件で含まない。(b)⚠️ **記録しても行が消えませんでした** — 画面の鍵を替えたのに、落とす鍵が締めのままでした。**「記録しました」の帯が出たあとに、もう一度押されます**（実測: 3件 → 3件のまま／直した版は 3件 → 2件）。(c)**300 件で切れたことを書いていませんでした** — 301 件目からはスマホから記録できないので、「ほか N 件・PC から記録してください」と出します。⑤**検証**: 実 Postgres ＋ 実ブラウザ（375px）で — **入金待ち 39 件・合計 47,003,076 円・期日超過 1 件**がスマホに出る（**反証: 今月締めの口に戻すと 0 件**）、6月・7月に計上した未入金が**先頭に並ぶ**（期日順）。パンくずと権限は純関数として `shared/tests/apps.test.ts` に 9 項目（**反証: クエリを見ない版は「機材台帳」を返す**）。`npm run test` 608項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings、**`build:all` ＋ `check:frozen` OK**（`shared/src/client/shell/` を触ったため。凍結4アプリの CSS は基準どおり）。⑥**DB 変更なし。**

v4.0.28 — **数字が嘘になっていた4つと、記録が別のものに付いていた2つを直した**（Codex のレビュー棚卸し #90・#97・#101・#52・#87。P2 8件）。この一群は**それらしい数字が出ます** — だから誰も報告しません（合わないことに気づくのは、台帳と突き合わせたときか、置いたはずのものが無いときです）。①⚠️ **やり取りの件数が、どの案件も「20件」でした**（P2）。引いているのが 20 件までなのに、**並んだ行を数えて**いました（実測: 46 件の案件が **20 件**）。「すべて見る（N件）」は**押す前に量を知るための数字**なので、頭打ちだと「もう全部見た」と思って開かなくなります。`pagination.total` を読みます。②⚠️ **「次にやること」にぶら下がる ①②③ が、概要から丸ごと消えていました**（P2）。帯に出るのは言い切りの1文だけで、**数も出していなかった**ので、読む人には**やることは1つ**に見えます（実データは1件の記録に3〜5件ぶら下がります）。「ほか N 件（全部読む）」を置きました。③⚠️ **改行のある記録では、行の中の丸数字を拾えていませんでした**（P2）。「改行があれば行で分ける」で打ち切っていたので、**`①②③` が1行に並んだ回はまるごと1件**になります（本番データはこの形です。実測 **1 件 → 3 件**）。④⚠️ **`-10万円` の頭のマイナスが、行頭の印として食われていました**（P2）。**「-10万円で調整」が「10万円で調整」**になり、**符号が逆の金額**が画面に出ます（原文には残っているので、読んだ人はそれが正しいと思います）。⑤⚠️ **鉤括弧で始まる文が、あとの行を全部飲み込んでいました**（P2）。「至急」対応をお願いします… のように**行の途中で閉じている**文が引用の始まりと読まれ、**閉じる行が現れるまで（ふつうは本文の最後まで）引用の帯**になります。開いた数を数えて、**行の終わりでまだ開いているときだけ**引用にします。⑥⚠️ **別の拠点にある同じ名前の部屋が、1つ消えていました**（P2）。重複を**画面に出す名前**で除いていたためで、略称を決めていない拠点どうしだと名前が完全に一致します（実測: 2室 → **「ほか1室」が出ない**）。**部屋の id と名前の両方**が一致したときだけ同じものと見なします（**多く出るほうに倒す** — 消えたことは画面に出ません）。⑦⚠️ **AI が起こした案件の受注額が、同じ金額のぶんだけ小さく出ていました**（P2）。`SUM(DISTINCT 金額)` で足していたので、**50万円の受注が3件なら 50万円**です（実測: 3件で **50万円 → 180万円**）。**先に案件を1行に畳んでから**足します。⑧**受注額は確定した売上で数えます**（P2 #87）。`expected_amount` は**起票のときの見込み**で、受注しても更新されません — ⚠️ **更新しないのが正しい**（上書きすると「AI がいくらと見込んだか」が消え、比べる相手そのものを失います）ので、**確定売上があればそれを使い、見込みで数えた件数を添えます**。⑨⚠️ **短くできなかった印が、一度も試していない本文に付いていました**（P2 #101）。成功の側にだけ「本文が変わっていないこと」の確認が付いており、**引いてから失敗するまでに人が直すと、新しい本文に失敗の印**が残ります。印のある行は待ち行列から外れるので、**その本文は二度と短くされません**（画面には長い原文が出たままで、失敗したことも出ません）。⑩**やり取りの日付が読み上げから外れていました**（この作業中に実測）— 枠ごと `aria-hidden` にしていたので、**いつのやり取りか分からないまま本文だけ**が読まれます（やり取りは時系列がすべてです）。⑪**この PR のレビューで2件指摘され、直しました**（Codex・P1/P2）— どちらも**受注額の数え方**です。(a)⚠️ **分け合う請求（グループ請求）で、代表の案件が全額を受け取っていました**。`revenues.project_id` は**グループの代表1件**しか指さないので、**ほかの案件は「売上が無い」ことになって見込みに落ちます**。財務の台帳と同じく `revenue_allocations.allocated_amount` で数えます。(b)⚠️ **0 円で計上した売上**（無償対応・相殺）を「売上が無い」と見なして見込みに差し替えていました — **実績 0 円の案件が見込みの金額で受注額に入り**ます。**行数**で分けます。**実測**: 分け合う請求のある3案件で **2,299,999 円 → 1,000,000 円**（実際に請求した額）。⑫**検証**: 実 Postgres ＋ 実ブラウザで — 概要の「すべて見る」**46 件**（**反証: 行を数える版は 20 件**）、「ほか3件（全部読む）」（**反証: 前の版は何も出ない**）、会場「第1スタジオ ほか1室」（**反証: 名前で除く版は「ほか1室」が消える**）、日付は**読み上げに届く 5 件**（**反証: 前の版は 0 件**）。AI の成果は **3件 50万円 → 3件 180万円**（うち2件は見込みで数えたと明記）。失敗の印は**本文が変わっていれば付かない**（**反証: id だけで書く版は付いて、待ち行列から外れる**）。`shared/tests/wrongNumbers.test.ts` 17項目、`npm run test` 614項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings、**`build:all` ＋ `check:frozen` OK**（`shared/src/client-v4/` を触ったため。凍結4アプリの CSS は基準どおり）。⑬**DB 変更なし。**


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

⚠️ **作業 PR では版を上げない。** 番号は「枝を切った時刻」ではなく**マージされた順**で
決まるので、着手時に取ると**先に入った PR と必ず取り合い**になります。実測: 直近2週間で
`CLAUDE.md` 55 コミット・`README.md` 42・`package.json` 45 — **ぶつかったのは毎回この3か所だけで、
コードは1度も競合していません**。

- **作業 PR**: `docs/changelog.d/<枝の名前>.md` に**載せたい文を1つ置くだけ**
  （新しいファイルなので衝突しません）。**版の3か所は触らない** —
  触ると `npm run lint`（`check-changelog.mjs`）が止めます
- **リリース**: `npm run release:notes -- X.Y.Z` が下書きを**マージされた順**に集めて
  下の3か所を全部やります（4件目のアーカイブ移動まで）。通すのは `RELEASE=1` か `release/` の枝

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
