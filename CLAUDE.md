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
v2.9.278 — **コーディングが遅い原因を実測して3つ直した (CLAUDE.md 93%減 / ビルド2.4倍 / 検証の土台を使い回し) + デザイン修正版 (24e・24f 復元) の確認**。①**一番効いたのは CLAUDE.md の肥大**。この文書はコーディング中**ツールを1回叩くたびに全文が読み込まれる**のに、**828,591文字のうち801,027文字 (96.7%) が過去のバージョン履歴**だった。1行直すだけの作業でも毎回828KBを運んでいたことになる。さらに読み込み量が増えるほど会話の途中で要約が挟まり、**作業の途中経過が失われてやり直しになる**。最新5件だけを残して残り382件を `docs/version-history.md` に切り出し、**828KB → 58KB (93%減)**。②**履歴は消していない**。`generate-version-history.mjs` が **CLAUDE.md → docs/version-history.md の順で連結して読む**ようにしたので、画面の「バージョン履歴」は**387件のまま**変わらない (切り出し前後で件数・現在版・最古版が一致することを実測)。③**アーカイブが読めなければビルドを止める** (fail closed)。黙って進むと履歴が最新5件だけになり、しかもエラーが出ないので誰も気付けない。あわせて `.dockerignore` の再包含 (`!docs/version-history.md`) と Dockerfile build-client の `COPY docs/version-history.md docs/` も入れた — **再包含だけでは足りず COPY も要る**のは v2.9.185/231/250 で3回踏んだ形なので、今回は先に確認してから入れた (実際に外して exit 1 になることも確認)。④**ルートの `npm run build` が8ワークスペースを直列で回していた**ので `shared` の後を `concurrently -m 4` で並列化。**1分50秒 → 47秒 (2.4倍)**。旧挙動は `build:serial` に残置。Docker はステージごとに並列なので**デプロイ側の挙動は変わらない** (影響はローカル検証のみ)。⑤**「実 Postgres で N項目」の検証の土台を毎回ゼロから書き起こしていた**ので `scripts/dev-verify/{up,down}.sh` に固定。使い捨て Postgres (ポート5433・DB名 `onair_verify`・本番/devとは完全に別) の起動 → 全マイグレーション → **権限の切り分けを確かめる4人** (管理者 / 営業 editor / 経理 editor / 権限なし) の投入までを **冷えた状態から4秒**で用意する。⑥**毎回踏んでいた落とし穴を README に固定した**: 接続情報は `DATABASE_URL` の1本だけ (`DB_HOST` 等は読まない) / `user_permissions` の列は `access_level` で `id` は既定値なしの TEXT 主キー / `users.role` は `system_admin`・`staff` の2値のみ / `JWT_SECRET` は32文字以上 (短いと使い捨ての鍵が生成されトークンが次の起動で無効になる) / 開発の認証は Bearer ではなく `x-user-id` ヘッダー / Playwright の外部フォント取得失敗は JS エラーに数えない (数えると毎回偽陽性)。⑦**検証の項目数と 1章=1PR の粒度は減らしていない** (意図的)。v2.9.277 では実際に本番影響のバグを2件見つけているので、ここを削れば速くはなるが壊れたまま出る。速くしたのは**土台の作り直し**と**毎ターンの読み込み量**だけ。⑧**デザイン修正版 (3回目) を確認**: 巻き添えで消えていた **24e「テンプレートは『アワード』だけ実装する」/ 24f「データを入れる（アワード）」が復元**された (バッジ表記は 20e / 20f に振り直し)。24c は削除のまま、依頼1〜5 (32章 40a/40b の新規・27a/27c・PDFのみ・24c削除・按分の非表示) は全て維持、意図しない差分なし。**20章が着手できる状態**になった (順番は5のまま)。

(v2.9.277 — **請求のしごとを新設 (締めの日にまとめて出す + 入金の確認 + 検収書) + 既存の重大バグ2件を修正 (経理が財務を開けない / ベルが出ない)**。デザイン一式の README「進める順番」1番目 = 31章 31a / 仕様書 §7.5。①**新しいテーブルを作っていない** (migration 146 は列の追加だけ)。請求の対象は既存の確定売上 (`revenues status='confirmed'`) がそのまま使え、足りないのは「いつ出したか」「入金があったか」「検収書を出したか」の3つで、どれも売上1件に1つしか無いので**列で足りる**。②**入金は BOOLEAN ではなく日付で持つ**。「入金済み」だけだと**期日より遅れて入ったか**が分からず催促の判断に使えない。一部入金 (`paid_amount`) も持つ (分割で払われることがあり、金額が無いと消し込みができない)。③**既存の `invoice_issued` (BOOLEAN・migration 066) に日付が無かった**ので `invoice_issued_at` を足した。既存の TRUE 行は**日付が分からないので NULL のまま残す** (分からないものを「今日出した」ことにすると締めの集計が嘘になる)。④**申込書が揃っていない案件は選べない**。判定は案件の `application_form` をそのまま見る (判定を2か所に書かない)。**画面で選べないだけでなくサーバーでも弾く** (画面だけの制限は必ず抜ける) — そのとき何が足りないかを案件名つきで返す。⑤**出した請求書は消せない**。取り消しは「出した」記録を外すだけにし、**請求書の番号 (`billing_key`) は残す** (欠番のほうが後から追える)。入金済みは取り消せない (先に入金を外させる)。⑥**入金を記録した直後に一覧から消えると打ち間違いを直せない**ので、「最近入金した分」(直近14日) を出して外せるようにした。⑦**催促するは次にやることを立てるだけ** (ONAiR はメールを送らない)。⑧**月次運用は専用のフラグを作らない**。「毎月同じ」は**先月にも同じ案件の確定売上があるか**で判定する (フラグは必ず付け忘れ、付け忘れた月だけ請求が漏れる)。**先月と金額が違うものだけ印**を付ける (全部に印を付けると印の意味が消える)。⑨**既存の重大バグ①: 経理が財務のすべての画面を開けなかった**。`tool-outputs.routes` (v2.9.266) が**パス無しでマウント**され、その中で**パス無しの `requirePermission('sales')`** を掛けていたため、sales ルーターより後にマウントされた**全コンテキストのリクエストに sales 権限を要求**していた。結果 **`budget` 権限だけの経理ユーザーは `/revenues` `/purchases` `/sga` `/monthly-summary` `/vendors` がすべて 403**。v2.8.96 で awards が踏んだのと同じ形を再び作っていた。`/tool-outputs` をパス付きマウントに変えて構造的に漏れないようにした (実測: 修正前 6/6 が 403 → 修正後 6/6 が 200、営業・権限なしの切り分けは維持)。⑩**既存の重大バグ②: ベル (通知) が sales 権限の無い人に出なかった**。ベルは全アプリ共通の上辺にあるのに `/dashboard` ルーターが sales を要求しており、経理の画面では 403 だった (中身はグループごとに権限で絞ってあるので要求する意味が無い)。**既定は sales 必須のまま** `/notifications` と `/notification-prefs` だけを通す形にした (新しく足したルートは何もしなくても守られる = 付け忘れても緩くならない)。⑪**入口**: お金の画面の「請求のしごと」ボタンと ⌘K から。レールは6項目のまま増やしていない。⑫**検証**: 全9ワークスペースのビルド通過、`eslint` 0 errors / 78 warnings (着手前と同数)。**実 Postgres で 48項目** — migration 146 / 税抜→税込 (10%・8%・非課税) / 申込書の判定 / 未発行の抽出と締めの月での絞り込み / **揃っていない行は出せないと分かる** / **混ざったらサーバーが止めて1件も出さない** / 出した記録が残る / **出したものが入金待ちに移り請求タブから消える** / 期日超過の印と並び / **入金は税込で記録する** / 入金したら消えて「最近入金した分」に出る / **外すと入金待ちに戻る** / **発行を取り消しても番号は残る** / 入金済みは取り消せない / 検収書 / **催促で次にやることが3日後に立つ** / 月次運用は先月と比べて違うものが先頭 / 同額なら印は立たない / 存在しない売上は404。**HTTP で 17項目** — 未ログイン401 / budget 権限なし403 / **閲覧だけの人は読めて出せない** / 3タブと件数 / 揃っていないものは400で**何が足りないか名前で言う** / 入金・検収・催促 / 技術用語を出さない。**Playwright 1440px・375px で 32項目** — 3タブと締めの件数 / 列見出し / 出せる・申込書 / **揃っていない行のチェックが押せない** / 選ぶとまとめて出すバー / **入金→最近入金した分→外すの往復** / 閲覧だけの人には操作が出ない / **権限が無い人は白紙でなく必要な権限が出る** / 禁止語0件 / 横はみ出し 0px / JSエラー0件。⑬**ブラウザ検証で実バグを2件見つけて直した**: a) スマホでチェックボックスのタップ領域が **22px**・案件名のリンクが **23.6px** しかなく押し間違える (見た目は22pxのまま、タップ領域だけ44pxに広げた)。b) 上記⑩のベルの403 (コンソールのエラーから気づいた)。⑭**まだ無いもの**: 32章 合同案件 (デザインが届いたので次に作る。請求のしごとの一覧は `revenues` を読むので、合同案件の請求書もそのまま並ぶ = 作り直しにならない)。)

(v2.9.276 — **見積をつくる画面を新設 (料金表から選ぶ + AIが下書き + 粗利がその場で出る + PDFはBOXへ)**。デザイン一式の README「進める順番」1番目 = 30章 37a / 仕様書 §7.4。①**新しいテーブルを作っていない** (migration 145 は列の追加だけ)。見積の器は元から2つあり、`simulations` は `pricing_item_id` が NOT NULL で**自由記述が入らない**、`revenues(status='estimate')` + `revenue_items` は自由記述・見積書PDF・GLS発番での確定売上変換を既に持っていた。30章は「料金表から選ぶ」と「自由に書く」の**両方**が要るので後者を土台にした。3つ目の器を作ると同じ「見積」に入口が3つになり「どれが本物か」が分からなくなる (原則2「入口は1つ」)。`simulations` は MCP `set_project_simulation` が使っているので**料金シミュレーションとして残す** (消すと外の AI が壊れる)。②**行に「仕入(見込み)」を持たせた**: 見積を作るときには「この行は外部に幾ら払うか」が分かっているのに、受注後にもう一度仕入画面で打ち直すのが二度打ちの実体。受注 (`a_won`) で `is_provisional = TRUE` の見込み仕入になる。**冪等**なのでステージを往復しても増えない (notes のマーカーで見分ける)。仕入先が未定の行は「(仕入先未定)」に寄せる — ここで落とすと粗利の裏付けが消える。**作成に失敗しても受注は成立させる** (仕入の自動作成のために営業の操作を止めない)。③**値引きは明細を書き換えず持つ** (`discount_amount`)。単価を下げて値引きを表すと「元は幾らだったか」が消え、次の案件の参考にできなくなる。PDF には最後に1行 (マイナス) として出す。④**粗利率30%を切ると赤くするが止めない**。止めると画面が嘘をつく (実際には決裁で通る値引きがある)。⑤**確定でステージを前に戻さない**: 口頭決定・受注済の案件で見積を直したときに見積提案へ引き戻すと、進んだ案件が巻き戻って営業の一覧が嘘になる。想定金額は**税抜** (値引き後の小計) で入れる。⑥**ONAiR はメールを送らない**: PDF を出して BOX (社外共有可) に残し、送るのは人。**BOX に残せなくても PDF は返す** (保管の失敗で見積が出せなくなるのは困る) — 保管できたかは応答ヘッダーと画面で伝える。⑦**「送った」で次にやること「申込書をもらう」が自動で立つ** (送ったあとに何が起きるかは決まっているので人に思い出させない)。⑧**送付期限は新しい列を作らず**、案件の未完了の次回アクションを正とした (「待たせているもの」と同じ元データ。ここだけ別の期限を持つと締切が2つできる)。⑨**`sales` 権限で開ける**: 見積を作るのは営業で **`budget` (お金) 権限は持たないことが普通**なので、既存の `/revenues` (budget 権限) には相乗りしていない。閲覧だけの人は読めるが編集操作は出さない。⑩**AI は下書きまで**: 料金表と似た案件 (同じお客様 → 同じ規模・確定売上のある案件だけ) から明細を組む。**AI が推測で足した行だけ**にオレンジの印を出す (下書き全体が AI 製なのは紫のカードで示し、行の印は「ここは確かめて」の意味に絞る)。AI キーが無ければ 503 で「料金表から足す・1行足すで自分で組めます」と言う。⑪**AIを使い捨てにしない5条件を既存の共通レイヤーで満たした**: 条件1 = `ai_outputs` (kind=`estimate_draft`・target_table=`revenues`・明細の全文)、条件2 = `ai_corrections` (保存のたびにサーバーが自動で突合。**鍵は品目名** — index だと1行足すだけで以降全部が「変更」になり修正率が実態とかけ離れる。直された=`fix` / 落とされた=`reject` / 足された=`enrich` / 無修正=`none`)、条件3 = `ai_outcomes` (`confirmed` / `sent` + 粗利率)、条件4 = 生成前に `getFeedbackDigest('estimate_draft')` を読んでプロンプトに載せる (傾向を載せた回は版を分ける)、条件5 = MCP `get_ai_feedback_digest` と `/review`。**二重計上しない** (差分を書いた出力は次から飛ばすので何度保存しても数字が動かない)。⑫**共通部品を1つ足した**: `Money` (円記号と数字を別要素にし、列幅を固定して右寄せ) と、デザイントークンに無かった「行の区切り (#f4f6f8)」を `--row` として追加。⑬**既存バグ2件を修正**: a) `AppError` の引数順は `(status, code, message)` なのに `inquiry-reply.service` が code と message を入れ替えて渡しており、**画面に日本語ではなく `AI_NOT_CONFIGURED` や `NOT_FOUND` が出ていた** (4箇所)。b) 案件画面の見積への導線がヨミ段階だけに出ていた (口頭決定・受注のあとに直すことも多い) ので常時出すようにした。⑭**検証**: 全9ワークスペースのビルド通過、`eslint` 0 errors / 78 warnings (着手前と同数)。**実 Postgres で 73項目** — migration 145 の冪等性 / 合計の式 (小計・消費税 10%/8%/非課税・支払額・粗利・粗利率) / **値引きで粗利率が動き30%を切ると赤フラグが立つ (保存は通る)** / 空の品目名は落とす / 保存し直すと差し替わる (二重にならない) / 見積は案件に1本だけ / **保存では想定金額とステージに触らない** / 確定で想定金額が税抜で入りステージが見積提案に進む / **口頭決定は巻き戻さない** / 送った記録で「申込書をもらう」が立つ / **受注で見込み仕入2件ができ2回目は作らない (冪等)** / `changeStage(a_won)` から自動で走り往復しても増えない / 仕入先未定は受け皿に寄る / **AI下書きとの差分が fix / reject / enrich で記録され、何度保存しても増えない** / 成果に confirmed・sent・粗利率が残る / **傾向 (advice) が「items[].unit_price は1件修正」の形で読める** / 存在しない案件は404 / 見積なしで確定・送付はできない / 明細ゼロでは確定できない。**HTTP で 27項目** — 未ログイン401 / sales権限なし403 / **閲覧だけの人は読めて保存はできない** / **budget 権限が無くても見積を作れる** / 合計が返る / 確定・送付 / PDF が返り BOX 未設定を伝える / 閲覧だけの人は PDF を出せない / AIキー無しは503で自分で組めることを伝える (技術用語を出さない)。**Playwright 1440px・375px で 35項目** — 明細の3グループと列見出し / **金額が ¥ と数字の2要素で描かれる** / いまの金額6行と粗利率 (%) / 似た案件との比較 / 送ったあとの説明4つ / 料金表ダイアログで選んで明細に足すと未保存の印が出る / **閲覧だけの人には確定・保存・料金表・送付のボタンが出ず入力欄も編集できない** / 禁止語0件 / `#8b929c` を文字色に使っていない / **横はみ出し 0px** / JSエラー0件。⑮**ブラウザ検証で実バグを1件見つけて直した**: スマホでパンくず (案件 ＞ 案件名) のタップ領域が **23.6px** しかなく押し間違える。v2.9.256 の判断に倣い、スマホではパンくずを並べず「案件へ戻る」1つを 44px で置く形にした。⑯**まだ無いもの**: MCP の見積ツール (画面の経路でループが閉じているので、同じ見積に2つ目の書き込み経路を作らない)。お金タブへの格納は仕様書 §7.12 の判断どおり後続 (README の順番4番目)。)

(v2.9.275 — **AI が編集中の案件に追記できるようにした (追記だけ・既存の文字は1文字も消さない) + MCP 3ツール追加 (計85種)**。やり残し #6 の最後 (要件 B5)。①**追記だけを許した**: 全置換 (`PUT /projects/:id/collab`) は編集中は 409 で拒否したまま (いま画面で打っている人の編集を消すため)。かわりに `POST /projects/:id/collab/append` を新設し、**メモの末尾に足す / チェックリストに行を足す**だけを通す。**既存の文字を1文字も消さない** — AI が人の書いた文を書き換えられるようにすると、「勝手に消された」が起きたときに人は二度とこの欄を信用しない。直したい・消したいときは人にそう伝える (その旨をメモに書く) 契約にした。②**開いている画面に即出るようにした**: クライアント由来の更新は socket 層が中継しているが、**サーバーが自分で書いた分は誰も中継していなかった**。`YjsRoomManager.setBroadcaster` と `mutate` を足して、サーバー由来の増分も部屋の全員に配る (無いと「AI が足したメモが自分の画面には出ず、開き直すと出てくる」という分かりにくい挙動になる)。③**誰も開いていなくても足せる**: `mutate` が必要なら部屋を開いて既存データから種化し、書いたら閉じて永続化する (人が開いているかどうかで挙動が変わらない)。④**人が足した行と見分けられるようにした**: メモは「── AIが追記（日時）指示: ○○ ──」の見出しつき、チェックリストは `by_ai` を立てて画面に **AI** の印を出す (「AI が足した行です。要らなければ消してください」)。見分けが付かないと「勝手に増えている」と受け取られ、消すか残すかの判断ができない。変換層は 2 コピーあるので**両方に同じ鍵を入れ**、`check-collab-parity.mjs` で一致を確認した。⑤**MCP 3ツール** (82→85種): `get_project_collab` (読む) / `append_project_note` / `add_project_checklist`。書き込み2種は `gate.ts` に `sales/editor` で登録済み (未登録ならビルドが落ちる仕組み)。ツール説明で**縛ったこと**: 追記する前に必ず一度読む (重複はこの欄を読まれなくする最大の原因) / 日程・金額・可否を断定しない / 期限は「何月何日何時何分まで」・原文に無ければ**推測で埋めず空にする** / 数を出さず3〜5件に絞る / 人に割り当てる依頼は `create_task` を使う (これはタスク管理ではない)。⑥**足したものは提案で、決定ではない** (要件 B5 の「勝手に確定させない」)。人が残す・直す・消すのが前提。⑦**AIを使い捨てにしない5条件を既存の共通レイヤーで満たした** (新しい仕組みを作っていない): 条件1 = `ai_outputs` (`project_note_append` / `project_checklist_append`・全文)、条件2 = `ai_corrections` (**次に AI が読んだときに突き合わせる** — バッチを作らない方針は v2.9.239 と同じ。消された=`reject` / 直された=`fix` / そのまま=`none`)、条件3 = `ai_outcomes` (`done` 完了になった / `kept` 残った / `unused` 全部消された + `kept_ratio`)、条件4 = **`get_project_collab` が advice と kept_rate を返す** (呼ぶのは外の AI なので、読んだ時点で次の追記に効く。こちらのプロンプトを直さなくてよい)、条件5 = MCP `get_ai_feedback_digest` と `/review`。⑧**二重計上しない**: 差分を書いた出力は次から飛ばすので、何度読まれても数字が動かない (これが無いと読むたびに分母が膨らんで無修正採用率が壊れる)。⑨**検証**: 全9ワークスペースのビルド通過、`eslint` 0 errors / 78 warnings、変換層の一致検証 OK、権限ゲート検証 OK (書込40種すべて登録済み)。**実 Postgres + 実 socket + 人が開いている画面で 26項目** — 編集中でも追記が通る (409 にならない) / **人が書いた分は消えない** / **開いている画面に即届く** / 指示者も残る / 全文が `ai_outputs` に残る / チェックリスト3件が届いて AI の印が付く / 期限が分まで入る / **人が「残す・直す・消す・完了」した結果が none / fix / reject で記録される** / 直した中身が before/after で残る / 成果が `done` + `kept_ratio=0.67` で残る / **何度読んでも数字が動かない** / 読み取りに傾向が乗る / **全置換は編集中は 409 のまま** / 空は400・存在しない案件は404 / **誰も開いていなくても足せて前の内容も残る** / AI の印は保存後も残る / 追記後は部屋を閉じる。**Playwright で 6項目** — AI の印が AI の行だけに出る / メモの見出しが見える / 印の説明が画面にある / 横はみ出し 0px / JSエラー0件。⑩**これで #6 (B1〜B5) が完了**。)

(v2.9.274 — **案件にコメントと知らせる人 (ベルに出る) + 変更の記録 (主要な項目だけ) を追加**。やり残し #6 の B3 / B4。migration 144 で `project_comments` / `project_comment_mentions` / `project_changes` を新設。①**コメントはメモとは役割が違う**: メモ (v2.9.273) は**いまの状態**を全員で書き直す場所で後から誰が何を書いたかは残らない。コメントは**言った・言わないの記録**なので 1件=1行で残し書き換えない。混ぜると「メモを直したら相談の経緯が消えた」が起きる。②**知らせる相手は画面で選ばせる**: 本文から `@名前` を機械的に拾う実装にしなかった。日本語の氏名は区切りが曖昧で、取り違えたときに**別の人に知らせてしまう**のが一番困る。「知らせる人（この人のベルに出ます）」として候補を並べ、押した人だけに届く。③**知らせはベルに出す (Slack には送らない)**: ベルは全アプリの上辺にあるので、朝の1通とあわせて**通知の入口を増やさない** (§4.15)。新しいグループ「案件で名前を呼ばれた」を `GET /dashboard/notifications` に追加した (通知テーブルは作らず既存データから導出する方針は維持)。④**記録するのは「読んだ」ではなく「対応した」**: ベルは既読の概念を持たない設計なので、消えるのは本人が「対応した（ベルから消す）」を押したときだけにした。読んだだけで消える仕組みにすると嘘の «片づいた» が生まれる。⑤**消せるのは書いた本人だけ**: やり取りの記録は当事者の一方の操作で消えてはいけない。消しても行は残す (soft-delete)。他人のコメントを消そうとすると 403。⑥**送信ボタンは「コメントする」**: すぐ上に「やり取りを記録」(お客様との接点) があり、両方「書く」だと**どちらに書くのか分からない** (実際に検証で押し間違えたので直した)。⑦**変更の記録は主要な項目だけ**: 案件名 / ステージ / お客様 / 主担当 / 実施日 (開始・終了) / **想定金額** / 案件種別 / GLS番号 / 案件分類 の 10 項目。全列を残すと履歴が伸びて読めなくなり「なぜこの金額になったのか」を探せなくなる = 履歴の目的を失う。備考・タグ・BOX の URL は記録しないことを**画面にも書いた**。⑧**金額は記録する**: 同時編集の対象から外した理由が「誰がいくらに変えたかを1本の線で辿れる必要がある」だったので、それを担保するのがこの履歴。⑨**1行 = 1項目の変化 / 実際に変わった行だけ / 消さない** (migration 142 の権限履歴と同じ形)。保存を押しただけでは履歴は伸びない。`0` と `'0'`・`null` と `''` は変更扱いにしない。⑩**値は raw と「人が読む形」の両方を持つ**: お客様や担当者が**改名・退職しても履歴が読める**ようにする (id だけ残すと後から引けない)。ステージは「見積提案 → 受注」、金額は「¥5,000,000 → ¥6,000,000」と日本語で残す。⑪**保存とは別の経路にも入れた**: ステージ変更 (`changeStage`) と GLS 発番 (`issueGls`) は `update()` を通らないので、そこでも記録する。⑫**記録に失敗しても保存は成立させる** (履歴のために業務を止めない・失敗は console に残す)。⑬**履歴が空のときは記録を始めた時期を断る**: 「記録を始めたのは v2.9.274 からなので、それより前に変えた分は残っていません（「変更が無かった」ではありません）」。空の一覧をそのまま見せて誤解させない (v2.9.270 と同じ扱い)。⑭**既定は畳んである**: 毎回見るものではないので、開いたときだけ取りに行く (畳んでいる間は API を叩かない)。⑮**検証**: 全9ワークスペースのビルド通過、`eslint` 0 errors / 78 warnings。**実 Postgres で 30項目** — migration 144 の冪等性 / **変わった項目だけ記録する** / 触っていない項目・同じ値・備考やタグは記録しない / 金額が raw と表示形の両方で残る / お客様と主担当が名前で残る / **変えた人を消しても名前が残る** / ステージが日本語で残る / **記録に失敗しても例外を投げない** / コメントと知らせた相手が残る / **自分あての知らせは作らない** / 実在しない相手を指定しても投稿は通る / ベルに自分あて未対応だけ出る / **他人のベルには出ない** / 「対応した」で消えて画面には「対応済み」で残る / **他人あては片づけられない** / 他人のコメントは消せない (403) / 消しても行は残る / 存在しない案件・空のコメントを拒否。**Playwright 1440px・375px で 28項目** — コメントと知らせた相手 / 自分あてに「対応した」が出る / **候補に自分は出ない** / **投稿で本文と知らせる相手が飛ぶ** / resolve が飛ぶ / 変更の記録が畳んである・畳んでいる間は取りに行かない・開くと取りに行く / 誰が何をどう変えたかが日本語で出る / 未設定からの変更 / 消えた人の名前 / 記録している項目を画面に書いてある / 空のときの断り書き / **ベルに「案件で名前を呼ばれた」が出て「既読にする」は無い** / 横はみ出し 0px / JSエラー0件。⑯**残りは B5 (AI が編集中の案件に追記する経路) だけ** — socket 層との結線が要るので別途。)

**v2.9.273 以前の履歴は [`docs/version-history.md`](docs/version-history.md) にあります** (CLAUDE.md が毎ターン読み込まれるため、最新5件だけをここに置く。画面の「バージョン履歴」は両方を読むので全件表示のまま)。

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
- **バージョン更新ルール**: プッシュする際は必ずパッチバージョンを上げる（例: v1.1.94 → v1.1.95）。以下の全箇所を同時に更新すること:
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
