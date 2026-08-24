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
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | ~~`/awards/`~~ | ~~5179~~ | **廃止** | 放送CG演出・送出 (内部識別子は `awards` のまま)。**コードは保存・配信は停止**（2026-08〜） |
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
- **バックエンド**: Express + PostgreSQL (pg)。1つのサーバーが配信中5アプリの静的ファイルを配信する**単一イメージ構成**（廃止したリアルタイムCGは配信しない）
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
v4.4.3 — **PR #403（スケジュール表の時間刻みを選択式にし既定を15分にした）のマージ後の棚卸しを記録した**（コード変更なし）。作成から約2分37秒（CI green から約48秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。この開発セッションは実ブラウザでのPC/スマホ確認を行っていない旨も併記した。 **制作技術支援（techops）のスケジュール表 PC グリッドで、項目をクリックすると別の項目が開いてしまうことがある不具合を直した**（ユーザー指摘「クリック時に別のスケジュールが開くことが度々ある」）。同じ列に重なる項目があるとき横に割って並べる `assignLanes`（`scheduleLanes.ts`）は、実際は「重なりグループ」ごとに区切って幅を数えるべきなのに、**表（1日ぶん）全体を通した最大同時レーン数を全項目に一律適用していた**（コード内のコメントには「グループごとに」と書いてありながら実装が食い違っていた）。このため、たとえば午前に3件重なる瞬間が1回あるだけで、それとは無関係な午後の単独項目（本来なら列いっぱいの幅で描けるはず）まで幅1/3に押し縮められ、隣のレーン分の空白と紛らわしくなって隣の項目を誤クリックしやすくなっていた。重なりが途切れた（＝それまで置いた項目が全部終わった）ところで「重なりグループ」を区切り、レーンの空き状況・最大レーン数をグループごとにリセットするよう修正した。単独項目は常に幅いっぱいで描かれるようになる。検証: `npx tsc -b client-techops`・`npm run build -w client-techops`・`npm run lint`・`npm run test`（1454件）を確認済み。手元のNode スクリプトでアルゴリズムの挙動（無関係な単独項目が1/3幅にならないこと・複数の重なりグループが互いに影響しないこと）を検算済みだが、実ブラウザでのクリック再現はこのセッションから行っていない。 **制作技術支援（techops）のスケジュール表 PC グリッドの縦軸を、固定刻みの均等割りから「時間の区切りごとに表示」する方式に作り直した**（ユーザー提案「デフォルト表示は〇分刻みのものではなく、時間の区切りごとに表が表示されるようなしくみだとスペースに無駄がなくいい」）。これまで縦軸は `slot_min`（5/10/15/30/60分）の固定刻みで均等割りしており、何も予定が無い時間帯もびっしり予定がある時間帯も同じ高さを取っていたため、空白の多い日ほど縦スクロールが無駄に伸びていた。新設の `shared/src/schedule/timeline.ts`（`buildTimeline`）が、項目の開始・終了時刻そのものを目盛りにして縦軸を作る — 項目がある区間はほぼ実際の長さに比例した高さ（15分の項目が旧デザインの15分刻みとだいたい同じ高さになるよう調整）、何も無い区間は短くても長くても帯に圧縮し、最大150pxで頭打ちにする（「差はある程度つけつつ、無駄にスペースを取らない」というユーザー指示の塩梅）。作りたての（項目が1件も無い）表は比べる相手が無いので圧縮せず、押しやすい広さのまま出す。あわせて、直近追加した「表示間隔」セレクタ（5/10/15/30/60分を選ぶプルダウン）はこの新方式で意味を持たなくなったため削除した（`slot_min` フィールド自体・REST/MCPの `update_schedule` は後方互換のため残したまま）。`ScheduleGrid.tsx` の重なり項目のレーン幅計算（直近修正した誤クリックの不具合対応）はそのまま流用し、影響しない。検証: `shared/tests/scheduleTimeline.test.ts`（新設・7件）を含む `npm run test`（110ファイル/1461件）・`npx tsc -b client-techops`・`npm run lint`・`npm run build -w client-techops` を確認済み。実ブラウザでのPC確認はこのセッションから行っていない（このバグ・変更はPCグリッド専用で、モバイルのカード積み表示 `MobileTimeline` は対象外）。 **PR #409（スケジュール表グリッドの誤クリックを修正）のマージ後の棚卸しを記録した**（コード変更なし）。作成から約21分23秒（CI green から約19分17秒）で terai-takehiro 本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。 **レンタル機材検索（TOC・レスター）の価格取得漏れとレスターのジャンル分けを直し、機材管理にも検索専用の新画面を足した**（ユーザー指摘「レンタル費用がかなり取得できていない」「レスターはジャンル分けが効いていない」「機材管理にも借りる前段の検索を入れたい」）。① **レスターの価格取得**: `restar_scraper.py` の価格正規表現は「￥12,000-(税込)」という1パターンにしか一致せず、実ページがこの書式からわずかでも外れる（「(税込)」の注記が無い・円表記・半角¥ 等）と price_net が **診断ログすら残さず**静かに None のまま失われていた（TOC 側にはあった「価格取得不可」ログがレスター側には無かった）。TOC の `_extract_price_from_specs` と同じ考え方で、厳密な書式にまず当て、駄目なら緩いフォールバック（¥表記／円表記のどちらか）を試し、それでも取れなければ診断ログを残すよう直した。② **レスターのジャンル分け**: これまで category はパンくず内の `/service/solutions/rental` を含むリンクの**最後の1つ**を機械的に採っていたため、パンくずの大分類「レンタル」自体や無関係な同ドメインリンクを拾ってしまい、実質ほぼ全商品が同じカテゴリに潰れていた（画面の「カテゴリで絞り込む」チップは DB の `category` 列を distinct しているだけなので、この潰れがそのままジャンル分けの機能不全になっていた）。商品ページのスペック表に「カテゴリ」「ジャンル」等の行があればそちらを優先するようにし（TOC の価格フォールバックと同じ形）、無ければ従来のパンくずへ倒す（診断ログ付き）。この機会に TOC・レスター共通で使うテーブル抽出（`_extract_tables_as_dict`）を `common_db.py` に集約した。⚠️ 開発セッションのサンドボックスは対象2社サイトへの外部接続ができず、実際の HTML 構造に対する検証はできていない（README「未検証であることについて」と同じ制約）。デプロイ後のログ（`価格取得不可` / `カテゴリはパンくずのフォールバックを使用`）を見て、実際の見出し名と `PRICE_FALLBACK_RE`・`CATEGORY_KEYS` が合っているか確認すること。③ **機材管理に「レンタル機材検索」を新設**（貸出セクション。`/equipment/rental-search`）。借りる前段でTOC・レスターの機材を検索・閲覧できる、検索専用の読み取り画面（予約リスト・「今すぐ取得」トリガーは引き続き制作技術支援側だけに残す — 案件/番組の文脈を持たないこのアプリでは予約は行わない）。サーバー側は新規 `equipment/rental-catalog` ルート（`equipment` の reader 権限）を追加し、データの二重実装を避けるため制作技術支援側の `rental.service.ts` をそのまま再利用した。検証: `npm run typecheck`・`npm run test`（1454件）・`npm run lint`（新規ファイルにエラーなし）・`rental-scraper` の単体テスト（51件、新規テスト14件を含む）を確認済み。実サイト・実DBでの動作確認はこのセッションから行っていない。 **PR #412（レスターの価格・ジャンル取得を修正し、機材管理にレンタル機材検索を新設）のマージ後の棚卸しを記録した**（コード変更なし）。作成から約5分13秒（CI green から約2分56秒）で terai-takehiro 本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。

v4.4.2 — **制作技術支援のハブ画面（案件・番組のトップ）で、「スケジュール表」タイルの件数バッジがスケジュール表を作っても常に「0件」のまま変わらなかった不具合を直した**（ユーザー指摘）。`MiniAppTiles.tsx` の `scheduleCount` はジャーニー（`getJourneyForProject`/`getJourneyForProgram`）が返す `days[].docs` を `app === "schedule"` で数える設計だったが、サーバー側（`journey.service.ts`）は `docs` に**進行台本（`app: "sheet"`）しか積んでおらず、スケジュール表そのものを1件も入れていなかった**ため、スケジュール表を何本作っても常に0件のままだった（スケジュール表の項目＝枠は `frames[]` に別枠で入るが、`frames` は `qsheet_schedule_items` からしか埋まらないため、作った直後の項目が0件のスケジュール表はそちらでも数えられない）。`qsheet_schedules` を「資料」として同じ `docs` の形（`app: "schedule"`）で返すよう `fetchSchedulesForProject`/`fetchSchedulesForProgram` を追加し、案件・番組どちらのジャーニーにも組み込んだ（アクセス範囲は既存の枠取得と同じ：作成者本人／共有先／system_admin）。あわせて `JourneyDayCard.tsx` の「進行台本」見出しの一覧が `day.docs` をそのまま台本として描画しており、このままだとスケジュール表まで台本の一覧に混ざって出てしまうため、`app === "sheet"` で絞り込むよう直した（`MiniAppTiles.tsx` 側は元から `app` で絞り込んでいたため変更不要）。**同じ原因の関連不具合も1件見つけて直した** — 「次に決めること」の提案 `no_schedule`（「スケジュール表がまだありません」）が、枠（項目）の有無だけで判定しており、表そのものは既にあるが項目がまだ0件（作った直後）のときも「まだありません」と事実に反した案内を出していたため、表の有無も見るよう条件を直した。検証: `npm run typecheck`（client-techops 含む）・`npm run test`（1454件）・`npm run lint` を確認済み。実DBでの実機確認はこのセッションから行っていない。 **制作技術支援・スケジュール表（PC グリッド）の時間刻みを5分固定→選択式にし、既定を15分にした**（ユーザー指摘「5分刻みは見づらい」）。これまで `qsheet_schedules.slot_min` は DB の既定値が5分のまま画面から変える手段が無く、サーバー側（`update_schedule` の REST／MCP ツール）は既に対応していたのに使う入口が無かった。① migration で既定値を 5→15 分に上げ、CHECK 制約に 60 分も追加した（従来 5/10/15/30 のみ）。② スケジュール表詳細画面（PC のグリッド表示のときだけ・スマホのカード積み表示には出ない）に「表示間隔」セレクタを新設し、5/10/15/30/60分をいつでも選び直せるようにした。`slot_min` はグリッド描画の刻みでしかなく項目の開始・終了時刻（`start_min`/`end_min`）には影響しないため、既存のスケジュール表データはそのまま・見た目だけが変わる。 **制作技術支援（techops）のスケジュール表で、項目をクリックしたときに新規作成のような空欄フォームが開いてしまう不具合を直した。**「項目を編集」ダイアログ（`ScheduleItemDialog`）は`SchedulePage` に常駐（表示は `open` の真偽だけで切り替わる）しており、フォームの中身（`draft`）は初回マウント時に一度だけ `useState` の初期化関数で作っていた。そのため、最初に開いたとき以降は `item`（クリックした項目）が変わっても中身が作り直されず、2件目以降は見出しこそ「項目を編集」・削除ボタンも出るのに、区分「その他」・09:00〜10:00 といった新規作成の既定値のまま何も埋まっていないフォームが出ていた（保存すると、その既定値でクリックした項目を上書きしてしまう状態だった）。ダイアログが開くたび（`open` が false→true になるたび）に、そのときの `item`/`initial` からフォームを作り直すよう修正した。 **PR #401（スケジュール表タイル件数0件の不具合を修正）・#402（項目クリックが新規作成の空欄になる不具合を修正）のマージ後の棚卸しを記録した**（コード変更なし）。2本とも `terai-takehiro` 本人がCI green後すぐ（約14秒〜約1分41秒）に手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。PR #403 分は別セッションの PR #404 が並行して記録しているため、重複を避けてここでは対象外とした。 **制作技術支援のトップ・一覧系画面が、案件管理など他アプリと比べてページ幅が狭かったのを直した**（ユーザー指摘）。`ProductionTopPage.tsx`（アプリのトップ）・`TopPage.tsx`（進行台本の案件選択）・`JourneyPage.tsx`（案件・番組のハブ画面）・`schedule/ScheduleListPage.tsx`（スケジュール表一覧）のルート要素が揃って `mx-auto max-w-4xl`（896px）で自ら幅を絞っていたのが原因で、案件管理側（例: `ProjectListPage.tsx`）は max-width 指定を持たずシェルの幅いっぱいに広がる設計だったため、techops だけ見た目が狭くなっていた。4画面から `mx-auto max-w-4xl` を外し、他の余白（`px-4 py-6 sm:px-6 sm:py-8` 等）はそのまま残した。本番中に使う4画面（`OnAirPage.tsx`・`RundownPage.tsx`・`PrompterPage.tsx`・`AudioSupportPage.tsx`）は対象外（`client-techops/CLAUDE.md` の禁止事項）。同じ `max-w-4xl` パターンを持つ計時・視聴者の運用画面（`LiveDashboardPage.tsx`・`LiveTimerAdminPage.tsx`）も今回は対象外とした（ユーザーへの確認時にトップ・一覧系4画面のみと明示したため）。 **PR #407（制作技術支援のページ幅修正）のマージ後の棚卸しを記録した**（コード変更なし）。作成から約3分17秒（CI green から約1分17秒）で terai-takehiro 本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した。なお本PRは並行していた別セッションのリリースPR（#406）が7秒早くマージされたため通常の `release:notes` 収集には乗らず、ユーザーの明示的な指示（「v4.4.2のリリースにマージ」）によりこのv4.4.2のエントリへ直接追記して揃えた。

v4.4.1 — **制作技術支援（techops）のスケジュール表 MCP に、枠（項目）だけでなく表そのもの・列の書き込みツールを追加した。**これまで `create_schedule_item`/`update_schedule_item`/`delete_schedule_item`（2026-08 新設）で枠は作れたが、スケジュール表そのもの（`qsheet_schedules`）と列（`qsheet_schedule_columns`、会場/支度/運営の3グループ）は画面で先に用意しておく必要があった。`create_schedule`/`update_schedule`（表そのもの）と `create_schedule_column`/`update_schedule_column`/`delete_schedule_column`/`reorder_schedule_columns`（列の追加・更新・削除・並べ替え）を追加し、表・列・枠の3段が揃ったので、新しい日のスケジュール表を1本まるごと（列も含めて自由に）MCP だけで組み立てられる。既存の HTTP ルート（`schedules.routes.ts`/`schedule-columns.routes.ts`）と同じ粒度の単純な CRUDのため台本と違い「提案まで」ではなく直接書き込む。表そのものの削除（`delete_schedule`）は共有先がいる資料への影響が大きいため対象外（引き続き画面から行う）。`gate.ts` の権限ゲートは既存の枠 CRUD と揃え、`qsheet` の editor 以上を要求する。`docs/mcp-server.md` を実装に合わせて更新済み（111 種 / 21 カテゴリ、production 22 種）。


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
