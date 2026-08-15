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
v4.0.15 — **お金の二重計上を3つ止め、消えていたグループ請求を出した**（Codex のレビュー棚卸し #87・#56・#57・#53。P1 4件＋P2 2件）。この一群は**画面を見ても気づけません** — 二重計上は「同時に押したとき」だけ起き、**押した人にはどちらも成功に見えます**（月末に合計が合わなくて初めて分かり、そこから余分な行を探すことになる）。取りこぼしは**行が出ないだけ**なので手がかりがありません。共通する形は「**確かめてから書く**の間に他人が入れる」ことなので、どれも**取引の中で行を押さえてから**書くようにしました（議事録の持ち帰り〈v4.0.10〉と同じ直し方）。①⚠️ **受注→売上の変換が同時押しで2件できた**（P1）。`estimates.revenue_id` の確認も `billing_key` の連番も**取引の外**だったので、2人が押すと**両方が確認を通り、売上が2行**できます。`revenue_id` は後から書いたほうだけが残るので、**もう1行はどこからも参照されないまま台帳に載り続けます**（**同じ `billing_key` の行が2つ**にもなる）。②⚠️ **値引きが売上の明細に写っていなかった**（P1）。見積の値引きは**単価を下げずに別建て**する決めごと（v4 の設計判断）なので、明細をそのまま写すと**定価のまま**です。合計（`revenues.amount`）は値引き後なので、**明細を足すと合計より大きくなり、請求書 PDF は両方を刷ります**（紙の上で数字が合わない）。**値引きを1行として写す**（`値引き（見積 v1）` の負の行）。**単価を按分して下げないこと** — どの品目をいくら引いたかは決めていないので、配ると誤った記録になる。**明細が1行も無い見積には書かない**（値引きだけの明細になる）。③⚠️ **グループ請求（按分）が ⑤ 見積・請求にも ② 締め処理にも1行も出ず、請求書も入金も検収も記録できなかった**（P1）。「按分の親行は子行と二重に数えないよう `group_id IS NULL` で絞る」と書いてありましたが、**`revenues` に子行はありません** — 内訳は別表（`revenue_allocations`）で、グループ請求は `group_id` が入った**1行だけ**です（migration 006）。絞りを外し、**按分だと分かるように返す**（`group_name`。金額はグループ全体のもので、出ている案件名は代表の1件）。④⚠️ **書類を台帳へ渡すのが同時に走ると台帳に二重の行**（P1）。`linked_id` の確認が取引の外でした。⑤**請求書番号を無駄に消費し、嘘の番号を返していた**（P2）。「番号を採る → `WHERE invoice_no IS NULL` で書く」の順だったので、同時に押すと**片方の書き込みが 0 行**になり、**採った番号が誰にも付かないまま消え**、しかも**その番号を「採れました」と返して**いました（相手に渡す紙の番号なので、行と食い違うと追えない）。押さえてから採り、**すでに番号があればその番号を返す**。⑥**経理だけの人が受注→売上の変換に到達できなかった**（P2）。`requireAnyPermission(['sales','budget'])` と書いてあるのに、**router 全体の `sales` ゲートより後ろ**にあったので効いていませんでした（書いてあるのに効かない、いちばん気づけない形）。⑦**検証**: 実 Postgres ＋ 実サーバーで**同時押しを実際に起こして数えた** — 変換は **201＋400 で売上1行**（**反証: 押さえないと 201＋201 で2行・同じ `billing_key`**）、明細の合計 850,000 ＝ ヘッダー 850,000（**反証: 1,000,000 対 850,000**）、引き渡しは **成功＋`ALREADY_LINKED` で台帳1行**（**反証: 成功2つで2行・参照の無い行が残る**）、請求番号は**採番の消費1個・行と応答が同じ番号**、グループ請求は一覧に **1件出る**（**反証: 0件**）、`budget` editor の変換 201・権限なし 403・見積一覧は今までどおり `sales` 必須で 403。`shared/tests/moneyDouble.test.ts` 7項目、`npm run test` 522項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings。⑧**残り2件は手を付けていない**（案件詳細の売上・請求ペインが按分を満額で足す／100件を超える明細が合計から落ちる）。どちらも読み取り側で、直す範囲が別なので分けます。⑨**レビュー（Codex）の指摘を1件、同じ版で直した**（P1）: ⚠️ **一覧に出すようにしたのに、画面には「グループ請求だ」と分かる印が1つも無かった** — 金額は**グループ全体のもの**で、出ている案件名は**代表の1件でしかない**のに、印が無いと**その案件1件ぶんの満額の請求**に見える。請求書を出す人・入金や検収を記録する人が**分け合っていることに気づけない**（サーバーが `group_name` を返すようにしただけで、**画面が誰も読んでいなかった**）。行の見出しに**「分け合う」の札**、2行目に**「〈グループ名〉で分け合う（金額は全体）」**を出す。**出す先は3か所**（⑤ 見積・請求／② 締め処理／スマホの入金の確認）なので部品にした（1つ足りないと、その画面だけ満額に見えたまま）。⚠️ **札に「按分」と書かない** — v4 が**画面に出さないと決めた言葉**で（`check-ui-tokens` の言葉の決めごと）、`npm run lint` が止める。あわせて **⑤ の説明文が嘘になっていたので直した**（「按分の親行は二重に数えていません」＝**そもそも親行という作りではない**）。実ブラウザで**2画面とも札と説明が出ることを実測**（横はみ出し 0px・JS エラー 0件）。⑩**DB 変更なし。`shared/src/` を1バイトも触っていない**ので凍結4アプリの CSS は不変。

v4.0.14 — **「押せるのに 403」を4か所つぶした**（Codex のレビュー棚卸し #102・#60・#58・#55）。押せるのに 403 は、**押した人には「壊れている」としか見えません** — しかも**型検査にも lint にも出ません**（画面は権限を知らずにボタンを描け、サーバーは正しく断っているので、どちらにも間違いが無いように見える）。①⚠️ **`sales` だけの人は請求書・検収書 PDF を1枚も出せなかった**（P1）。⑤ 見積・請求（全案件）は `sales` でも開ける画面なのに、`GET /revenues/:id/pdf` は `budget` を要求していた。**この1本だけ**を `sales` か `budget` のどちらかで通す（`billing.routes` と同じ考え方＝同じ請求を案件管理と財務の2つの入口から扱う）。**台帳そのものは今までどおり `budget` 必須**（一覧・詳細・Excel が `sales` に開かないことを実測）。**紙にするだけなら止めない** — 金額は ⑤ の一覧にすでに出ているので（見積書 PDF を reader に通した v4.0.11 と同じ判断）。**BOX に置くのは editor 以上**で、こちらも**両方の区画で通す** — 出す口だけ開けると、⑤ から出した人は毎回「保存されませんでした」になる。②⚠️ **`dailyops` だけの人のトップページで「お待たせ中」がいつも「ありません」だった**（P1）。受信箱（`/dashboard/inbox`）は**日常業務のもの（未対応の問い合わせ・未処理の書類）も入っている**のに `sales` の内側にあり、**403 になって数えられていないのに「お客様を待たせているものはありません」と言い切って**いた（失敗は画面に出ないので気づけない）。`sales` か `dailyops` のどちらかで通し、**中身は持っている権限のぶんだけ**返す（`salesVisible` / `dailyopsVisible`）。⚠️ **口を開けるだけにしない** — 絞らないと `dailyops` だけの人に案件名・お客様名が渡る（v4.0.12 で塞いだ穴と同じ形）。画面も**応答が来てから数字を出す**（権限の有無だけで判断すると、また「数えていないのに 0 件」になる）。③**わたしのタスクの四角を editor にだけ出す**。一覧を読む口は reader で通るのでカードは出るが、`PATCH /dailyops/tasks/:id` は editor を要求する。④**タスク一覧へのリンクは `sales` を持つ人にだけ出す**（**2か所ある** — `MyTasksCard` とトップページ。片方だけ直すと残る）。行き先の全案件タスク一覧は `sales` を要求するので、`dailyops` だけの人はタスクを見ているのに押すと「権限がありません」に着いていた。⑤**2件はすでに直っていた**ことを確認して棚卸しに反映した（仮押さえの「落とす」は `canDrop`＝manager で PC・スマホとも出し分け済み／カレンダーの設定はタブを権限で出し分け済み）。⑥**検証**: 実 Postgres ＋ 実サーバーで **PDF を6通り**（`sales` editor 200・`budget` editor 200・`dailyops` だけ 403・権限なし 403・`system_admin` 200・**`sales` reader は 200 だが `X-Box-Reason: NO_PERMISSION`**）、**受信箱を3通り**（`sales`＝案件のぶんだけ・`dailyops`＝問い合わせだけで**案件名を1文字も含まない**・`budget` だけは 403）。実ブラウザで**トップページを3通り**（`dailyops` editor＝四角は出る・リンクは出ない／`dailyops` reader＝四角も出ない／`dailyops`＋`sales`＝両方出る）。**反証も実測**（PDF の口を `budget` に戻すと `sales` editor は 403 ／ 受信箱を `sales` に戻すと `dailyops` だけの人の画面が **403 のまま「お待たせしているものはありません」**に戻る）。`shared/tests/clickable403.test.ts` 6項目、`npm run test` 515項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings。⑦**レビュー（Codex）の指摘を1件、同じ版で直した**（P1）: ⚠️ **受信箱を `dailyops` に開けたことで、今度は「押した先」が権限エラーになるところだった** — 「お待たせ中」の行と挨拶の件数は**行き先が案件作成に固定**で、`/sales/projects/new` は `sales` の **editor** を要求する。つまり **API の 403 を画面の「権限がありません」に移し替えただけ**になる。**行き先は種類と権限で決める**（`inbox/kinds.ts` の `inboxHrefOf` / `inboxAllHrefOf` の1か所）: `sales` の人は今までどおり全部**案件作成**へ、そうでない人は 問い合わせ → **入ってきた情報**（`/daily/inquiries`）、書類 → **受け取った書類**（`/budget/documents`）。**開ける場所が無い行は押せなくする**（消さない — 中身は読ませたい）。⚠️ **別バンドルへは素の遷移**（`/daily/` はルーターでは動けない）。**挨拶の「期限切れ」も同じ穴**だった（`/sales/tasks/list` へ固定）ので一緒に直した。部品は行き先を持たない形にした（**知っているのは呼ぶ側**）。実ブラウザで**押した先の URL を実測**（`dailyops` だけの人が行を押すと `/daily/inquiries` に着く。**その先のログイン画面は検証の仕掛けの都合**〈localStorage を手で入れただけでトークンが無い〉で、**同じ URL を直接ひらいても同じ**ことを確かめてある）。⑧**DB 変更なし。`shared/src/` を1バイトも触っていない**ので凍結4アプリの CSS は不変。

v4.0.13 — **上限を超えた値引きを承認する画面を作った**（Codex のレビュー棚卸し #63・残っていた P1）。①⚠️ **承認できる画面が1つも無く、上限を超えた見積は永久に送れなかった**。値引きが役割の上限を超えると見積は `approval_state='pending'` になり**送付済みにできない**（お金のルール ⑤）。サーバーには `POST /projects/:pid/estimates/:id/approve` があるのに、**押せる場所がクライアントに1つも無かった** — 画面には「承認待ち」の札さえ出ておらず、**なぜ送れないのかも分からない**状態だった（型検査にも lint にも出ない。押せる場所が無いことは機械には見えない）。②**帯と「承認する」を1か所に置いた**（`contexts/shared/components/ApprovalRow.tsx`）。置き場所は案件の見積タブと GPM の見積タブの**2つ**あるので**部品にする** — 2回書くと、片方だけ直した日から「案件では承認できるのにプロジェクトでは押せない」が起きる（帳票のボタンで一度やっている）。帯には**値引き率**と、承認できない人には**誰なら承認できるか**（その見積を作った人の役割に決めた承認者）を書く。③**押して 403 にしない**: 承認できるかは**サーバーが `can_approve` で渡す**（`withCanApprove`）。画面に規則を写すと、承認者の決め方を変えた日に**ボタンだけ古い規則で出る**。判定は**一覧ぜんぶで1回のクエリ**（行ごとに引くと 20 行で 20 回になる）。`system_admin` は引かずに通す。④⚠️ **GPM には承認の口そのものが無かった**（`POST /gpm/estimates/:id/approve` を新設）。案件側の口は `sales` を要求するので、**`gpm` だけの人は自分のプロジェクトの見積を承認できない**（見積書 PDF が v4.0.11 で同じ穴だったのと同型）。**GLS-B のプロジェクトの見積しか通さない**（案件〈GLS-A〉の id を渡すと 404）。承認そのものの規則（誰が承認者か・上限）は**案件と同じ1本**（`estimate.service` の `approve`）で、分けたのは口だけ。⑤**⑤ 見積・請求（全案件）に「承認待ち」の絞り込みを足した**（`?approval=pending`）。案件を1件ずつ開いて回らずに、**止まっている見積をまとめて片づけられる**。行のバッジも `approval_state==='pending'` のときは「承認待ち」を橙で出す（前は「下書き」としか出ておらず、送れないことが読み取れなかった）。⑥**検証**: 実 Postgres ＋ 実サーバーで **4通りを実測**（作った本人＝帯は出るがボタンは出ない〈`can_approve=false`〉／承認者＝ボタンが出て承認できる／`system_admin`＝通る／`/billing/estimates?approval=pending` が 6 件・すべて `can_approve=true`）。実ブラウザ **13項目**（帯が出る・承認者にだけボタン・確認ダイアログ・押すと帯が消えて「提出済」にできる・トースト・チップで一覧が絞られる・横はみ出し 0px・JS エラー 0件〈**CSP の `data:` 書体の警告は変更前も出る**ことを確認〉）。`verify:ui` は触った画面 326/326、`npm run test` 509項目（`shared/tests/estimateApproval.test.ts` 8項目を追加。**画面が自分で承認者を判定し始めたら落ちる**ことを確かめてある）、`typecheck` 3アプリ + server exit 0、`lint` 0 errors / 63 warnings、`check:frozen` OK。⑦**レビュー（Codex）の指摘を2件、同じ版で直した**: ⓐ⚠️ **承認者に決めた人でも、その画面の編集権限が無ければ押した先は 403** だった（承認の口は案件も GPM も編集権限を要求するのに、`can_approve` は役割だけで決めていた）— **この版が塞ごうとしている壊れ方そのもの**。編集権限も混ぜて決める（`withCanApprove(rows, viewerId, canEditModule)`。**どの区画を要求するかは口ごとに違う**ので呼ぶ側が渡す）。⚠️ **ボタンを消して終わりにしない** — 「承認者だが編集権限が無い」を「承認者ではない」と同じ文にすると、**その人にだけ理由の分からない行き止まり**になり、見積はまた誰にも送れない（#63 と同じ形）。`is_approver` を別に返し、**「あなたは承認者ですが編集権限がありません（設定 → 権限とメンバー）」と名指しする**。ⓑ⚠️ **次の版に置き換わった見積にも帯が出て、承認できた**。`createNextVersion` は前の版の**中身を触らない**決めごとなので、`status` は `superseded` になっても **`approval_state` は `pending` のまま残る** — 帯が**新しい版と並んで2枚**出て、**もう送れない版に承認を記録できた**。出す条件を `pending` ＋ `draft` の1つの関数（`needsApproval`）にし、**サーバーも同じ条件で 400 を返す**（画面の出し分けだけに頼ると、古いタブから直接叩けば通る）。**前の版の `approval_state` を書き換えて解かないこと** — 送った見積を見返せることが要件そのもので、承認待ちのまま置き換えた事実も記録。実サーバーで**両方向を実測**した（reader の承認者＝直した版は `can_approve=false`・**戻すと `true` なのに押すと 403`**／v2 を作ると v1 は `superseded` のまま `pending`・直した版は帯1枚で v1 の直接承認は 400・**戻すと帯が2枚**出ることを実ブラウザで確認）。⑧**DB 変更なし。`shared/src/` を1バイトも触っていない**ので凍結4アプリの CSS は不変。


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
