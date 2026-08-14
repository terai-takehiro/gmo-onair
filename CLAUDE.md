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
v4.0.10 — **レビュー（Codex）の指摘3件を直した**（PR #103 に付いたまま**マージされた指摘**）。①**文字起こしを一度も開けなかった**: 一覧（`listMinutes`）は本文を積まないのに、画面は**本文の有無で「文字起こしを見る」を出すかどうかを決めていた**ので、この枠は**案件でもプロジェクトでも1度も出ていなかった**（詳細の口 `GET …/minutes/:id` は書いてあるのに**どこからも呼ばれていなかった**）。一覧が**文字数だけ**返し（`transcript_chars`）、**押されたら本文を取りに行く**形にした。⚠️ **失敗した行にも枠を出す** — 「文字起こしは残っています。下の『文字起こしを見る』から取り出せます」と書いてあるのに、失敗の行はその枠を持っていなかった（整形で落ちても文字起こしは残っているので、取り出せないと録音し直しになる）。②**editor に「消す」が出て、押しても何も起きなかった**: 消すのは manager（サーバーがそう止めている）のに、部品には `canEdit` を渡していた。**`canDelete` を別の props にして型で強制**した — 呼ぶ側2か所（案件・プロジェクト）が漏れなく渡すようになる。案件側も同じ穴で、editor は押すと 403 を受け取るだけだった。③**持ち帰り→未確認事項が同時押しで2件できた**: 印（`ask_id`）の確認を**取引の外**でしていたので、2人が古いタブから押すと**両方が確認を通り、印は後から書いた1つだけ**が残る＝**参照の無い未確認事項が「止まっているもの」として数えられ続ける**。確認を**取引の中に入れ、行を押さえてから読み直す**（`FOR UPDATE`）。案件側の`持ち帰り→タスク`も同じ形だったので一緒に直した（あちらは取引そのものが無かった）。④**検証**: 実 Postgres ＋ 実サーバーで**割り込みを人工的に作って**確かめた — 別のセッションが行を押さえたまま先に未確認事項を作る筋書きで、**直した版は 2.0 秒待ってから`ALREADY_EXISTS`（1件）**、**`FOR UPDATE` を外すと 2件でき、参照の無い行が残る**ことを実測。ほかに API 8項目（一覧は本文を積まない・文字数が本文と一致・詳細で取れる・editor は消せないが直せる）、実ブラウザ **50項目**（文字起こしを開く・失敗した行の枠・**gpm editor では「消す」が出ないが「確定する」は出る**）。`verify:ui` 458/458、`npm run test` 473項目、`typecheck` 3アプリ + server exit 0、`lint` 0 errors / 63 warnings。⑤**DB 変更なし。`shared/src/` を1バイトも触っていない**。

v4.0.9 — **プロジェクト管理が全画面 500 で開けなかったのを直し、工程の下のタスクを出した**（工程管理として使えるようにした回）。①⚠️ **前提: プロジェクト管理は一覧・詳細・作る・直すの4つとも 500 だった**。migration 184 が `projects.notes` を落としたとき、**案件管理側だけが直っていて GPM が取り残されていた** — `gpm.service.ts` の SELECT / INSERT / UPDATE が `notes` を触りつづけており `column "notes" of relation "projects" does not exist`。**型検査にも lint にも出ない**（SQL の中身は見ない）。画面には「サーバー内部エラー」とだけ出るので、使う人からは「プロジェクト管理が開かない」に見える。②**メモは案件と同じ関数を読む**（`addMemoActivity` / `MEMO_LATERAL` を `project.service.ts` から export して呼ぶ）。写すと、置き場所を次に変えた日にまた片方だけ取り残される。読む側の名前（`notes`）は変えていないので画面はそのままで、**中身が「いちばん新しいメモ」**になった。③**同じ壊れ方を止める試験を足した**（`shared/tests/droppedColumns.test.ts`）。migration の `DROP COLUMN` を集め、サーバーの**SQL 文字列だけ**を見に行く（`--` の注釈は落とす — 「migration 184 で projects.notes を落とした」という説明文は正しいので、素の文字列検索にすると注釈で落ちる）。**`p.notes` を戻すと実際に落ちることを確かめてある**。④⚠️ **この試験が2つめの穴を見つけた**: 投入口（`task-intake.service`）の**ネタ案件を作る道も同じ列を触っていて 500**だった（実 API で再現 → 直したあと登録でき、本文がメモとして残ることを実測）。本文は**同じトランザクションの中で**やり取りのメモ1件にする — 外に出すと「案件はできたが本文が消えた」が起き、入れた人は登録したつもりなので入れ直さない。⑤**工程の名前を押すとその工程のタスクが出る**（`projectDetail/OverviewTab.tsx` ＋ `TaskRows.tsx` ＋ `TaskDialog.tsx`）。着手前は工程の「3 / 7」という**件数だけ**で、**何が残っているのかがこの画面から分からず** ⑤ 全プロジェクトのタスクで絞り込み直すことになっていた（⑤ には「タスクを足す・直すのはプロジェクト詳細の工程から」と書いてあったのに、**詳細にその口が無かった**）。既定は閉じている（7工程 × 4〜5タスクで 30行を超える）。**開いている工程はタブの部品が持つ** — 行の中に持たせると、並べ替えや保存で行が作り直された瞬間に閉じる。⑥**サーバーに足した口**: 工程を足す・並べ替える（隣と入れ替え）・消す／タスクを足す・直す・消す。**工程を消しても配下のタスクは消さない**（`gpm_phase_id` を NULL にするだけ）— 一緒に消すと「名前を直したかっただけ」の人が**タスクを何十件も消す**。外れたタスクは「工程に付いていないタスク」の束に残るので付け直せる（**何件外れるかを確認に出す**）。**並べ替えは隣と入れ替えるだけ** — 並び全体を採番し直すと、2人が同時に押したときに片方の並びが丸ごと巻き戻る。**端では何もしない**。**他のプロジェクトの工程には付けられない**（付くと、そのタスクが別のプロジェクトの工程の下に並び、進み具合の分母も相手側に足される）。**期限は `due_at` の 18:00**（ひな形から写すときと同じ形。`due_date` に入れると「自分のタスク」の並びが日によって入れ替わる）。**直すときは渡した項目だけを書き換える**（画面が持っていない担当・工程が空で送られて黙って外れるのを防ぐ）。ただし期限は**鍵が入っていれば `null` でも書き換える** — でないと「期限を消す」ができない。⑦⚠️ **`useInvalidateGpm` がタスクの鍵を落としていなかった**: ⑤ でチェックを入れると「完了にしました」の札は出るのに**行が変わらない**（鍵が違うだけなので型検査にも lint にも出ない）。⑧**一覧に「見積」の列を足した**（モックの `money`）。金額は**案件一覧と同じ式**（サーバーの `ESTIMATE_AMOUNT_LATERAL` を export して読む）— 束ごとに最新版・旧版と失注を外す・値引きは引く・**税は乗せない**。見積が1本も無い行は「見積なし」（0円ではない）。「金額の列はありません」という**古い注記を消した**（見積は migration 173 から入っている）。⑨**シードにプロジェクト管理のデータを入れた**（固定 id `gpm-1` / `gpm-2`・工程8・タスク13・未確認事項4・体制6名・見積2本）。着手前は**データが1件も無く `gpm` の権限も誰にも付いていなかった**ので、検証環境では system_admin で開いて「プロジェクトがまだありません」を見るしかなかった。工程は「完了・進行中・待ち・未着手」を1つずつ入れてある（1つの状態しか無いと色と並びの決めごとを画面で確かめられない）。⑩**検証**: 実 Postgres ＋ 実サーバーで **API 23項目**（足す・直す・消す・完了の入切・渡さない項目が保たれること・他のプロジェクトの工程を弾くこと・工程を消してもタスクが残ること）と**権限の壁8項目**（`gpm` の口から案件〈GLS-A〉のタスクを直せない・消せない・完了にできない／一覧に混ざらない）。実ブラウザで**31項目**（12画面を 1440px で開いて**横はみ出し 0px・JS エラー 0件**、工程を開く→タスクを足す→直す→完了→工程を足す→並べ替える→消す を実際に押す、390px の3画面と PC 専用の案内、1024px で工程を開いてもはみ出さないこと）。`verify:ui` に**詳細の4タブを足して** 246/246（いちばん操作の多い画面が見た目の検査に1度も載っていなかった）。`npm run test` 464項目（`droppedColumns` 2 を追加）、`typecheck` 3アプリ + server exit 0、`lint` 0 errors / 63 warnings。⑪**議事録を足した（同じ版・表もサービスも作り直していない）**: `project_minutes.project_id` は `projects(id)` を指し、プロジェクトは GLS-B の案件なので**そのまま載る**。Whisper の投げ方・整形のプロンプト・差分の記録（`ai_corrections`）は案件と同じものを呼び、**分けたのは口（URL）だけ** — 案件側のルートは `sales` を要求するので、`gpm` だけの人は自分のプロジェクトの議事録を開けなかった。⑫**持ち帰りの行き先だけが違う**: 案件は**タスク**、プロジェクトは**未確認事項**（migration 161 の `source_minutes_id`）。工事の持ち帰りはほとんどが「先方の判断待ち」で、タスクにすると「自分がやること」に相手待ちが混ざり、**プロジェクトをまたいで「いま何件止まっているか」を数えられない**。**誰に訊くかは決めつけない**（`owner` は AI が拾った名前の文字列なので、既定を発注者にして `to_name` に文字として残す）。**同じ持ち帰りから二度は作れない**（`ask_id` を書き戻す）。⑬**会社方針の5条件のうち穴だった「成果」を塞いだ**: `get_ai_feedback_digest` に**持ち帰りが追いかけられた率**（`task_id` / `ask_id` の付いた数 ÷ 全体）を足した。**`ai_outcomes` に行は足さない**（読み取り時に導出）。⚠️ **追跡率を「AI が正しかった率」と読まないこと** — 人が言い換えて登録すると印が付かないので、**拾いすぎの目安**として出す（advice の文にもそう書いた）。⑭⚠️ **SQL に jsonb の存在演算子（疑問符）を書くと落ちる**: この製品の DB 層は `?` をプレースホルダとして数えるので `syntax error at or near "$1"` になる（実際に踏んだ）。`->>` で書く。**再発を止める試験を足した**（`shared/tests/sqlPlaceholder.test.ts`。**戻すと落ちることを確かめてある**）。⑮**書類タブから BOX にファイルを置けるようにした**: 画面は案件詳細と**同じ部品**（`FolderCard` に `base` を渡すだけ）、サーバーも**同じ1本**（`project-box-files.service` に切り出して案件側もそれを呼ぶ）。写すと、どちらかだけ直した日に**片方が原価を外に出す**。**案件側の「当日の写真」は持ち込んでいない**（プロジェクトのフォルダ構成に `08_写真` が無く、工事の写真をどこに貯めるか決めていない）。⑯**BOX の実際の書き込みは確かめられていない**（検証環境に資格情報が無い）。確かめたのは**入口の分岐すべて**（scope 無し 400／ファイル無し 400／フォルダ無し NO_FOLDER／案件の id は 404／一覧は 200 ＋ 理由）と、**案件側の振る舞いが切り出し前と同じこと**。⑰**議事録の検証**: 実 Postgres ＋ 実サーバーで**18項目**（一覧は全文を積まない・1件は全文つき・案件の議事録を gpm の口から読めない/直せない/消せない・持ち帰り→未確認事項・二度は作れない・どの議事録から来たかが残る・期限が写る・印が書き戻る・確定すると `ai_corrections` に差分が残る・digest の追跡率が 1/2 と出る）。実ブラウザは**41項目**（議事録2件の下書きと確定・引用の開閉・「未確認事項にする」を押すと札が変わる・未確認事項タブに出る・書類の2枚と理由の1行）。`verify:ui` は詳細**6タブ**を含めて 300/300。`npm run test` 466項目。**DB 変更なし。`shared/src/` を1バイトも触っていない**ので凍結4アプリの CSS は不変。

v4.0.8 — **見積書・請求書・検収書の PDF を出せるようにし、出したら BOX に入るようにした**（ご指摘）。①**症状**: 帳票を作る道具（`shared/services/pdf.service.ts` の3種）も口（`GET /revenues/:id/pdf`）も残っていたのに、**v4 の画面から押せる場所が1つも無かった**。押せていたのは旧 `BusinessProjectView` だけで、案件詳細の売上・請求を3カードに作り直したとき（2026-08）に**ボタンごと落ちていた**。しかも v4 の見積は migration 138 で `estimates` という別の表になったので、**見積書には口そのものが無かった**（`revenues` しか読めなかった）。型検査にも lint にも出ない — **押せる場所が無いことは機械には見えない**。②**見積書の口を足した**（`GET /projects/:pid/estimates/:id/pdf` ＋ `estimate-pdf.service.ts`）。**PDF の描き方は写さず**、`estimates` を `pdf.service` が読める形に詰め替えるだけ（写すと様式を直した日から見積書だけ古い形で出る）。**値引き（`estimates.discount`）はマイナス1行の明細として渡す** — 合計だけ引くと紙の上で値引きが消え、なぜその金額なのかが相手に伝わらない。分類は `値引き` にした（分類なしだと「（未分類）」という帯の下に並んで何の行か読めない）。ファイル名に**必ず版を入れる**（`見積書_GLS900_v1_案件名.pdf`）— 入れないと v1 と v2 が同名になり、BOX では同じファイルの版として積み上がって**v1 として出したものが一覧から消える**。③**出す＝発行＝BOX に入る**（ご判断）。**見積書＝社外と共有するフォルダの `01_見積・提案` ／ 請求書・検収書＝社内限りの `03_請求`**（検収書は検収→請求の流れなので請求書と同じ場所にまとめ、お客様に渡すときは人が BOX から共有する）。対応表は **`doc-box-dest.ts` の1つだけ**にして、`shared/tests/docBoxDest.test.ts` で固定した — **`scope` を取り違えると社内限りのつもりの帳票が社外のフォルダに入り、画面はどちらも「保存しました」としか言わないので誰も気づけない**。実 BOX に `01_見積・提案` と `03_請求` が同じ綴りで存在することも確かめてある（1文字違うと `ensureSubfolder` が**隣に新しいフォルダを作る**）。④**ダウンロードは止めない・でも黙らない**。BOX が落ちている日に請求書を出せなくなるほうが困るので保存の失敗で 500 にはしないが、**入ったかどうかを応答ヘッダー（`X-Box-Stored` / `X-Box-Reason` / `X-Box-Where`）で必ず返し**、画面がそのまま出す（黙って落とすと「保存したつもり」で手元にしか無い帳票ができる）。理由は5つに分けてある（未接続／フォルダ未作成／置き場所を作れない／BOX 不通／権限なし）— 「失敗しました」だけだと**押し直せば直るのかが分からず、同じ操作が繰り返される**。⑤**置くのは editor 以上、出すのは reader でも通す**。`GET /revenues/:id/pdf` はレガシー画面と GPM も呼ぶ reader の口なので、権限で分けずに置くと**読むだけの人が BOX に書ける**。⑥**ボタンは1つの部品**（`contexts/shared/components/DocPdfButton.tsx`）。置く先が4か所あり、どれも**行そのものが押せる一覧**なので、`stopPropagation` を1か所でも書き忘れると「押すたびに画面が変わって PDF が出ない」という追いにくい壊れ方をする。旧 `BusinessProjectView` の写し（`alert('PDF生成に失敗しました')` が残っていた）もこれに寄せた。⑦**置いた4か所**: 案件詳細の見積タブ（版ごとに見積書。**出した版・旧版からも出せる** — 何を出したか紙で確かめたい場面が多く、状態で隠すといちばん要るときに押せない）／同 売上・請求ペイン（請求書・検収書。**数字を1つも書き換えない**ので「読むだけ」に反しない。**見積書は置かない** — 版を持つ見積から出す。2種類できるとどちらを相手に出したか分からなくなる）／⑤ 見積・請求（全案件）／② 締め処理（請求書を出す・検収書を出す の2タブ。**入金の確認には出さない** — こちらが出す紙が無い）。⑧**紙の間違いを3つ直した**: **請求書に「見積コード：GLS900-001-1」と印字されていた**（3種とも同じ見出しだった）→ **請求書番号**（発行済みなら `INV-2026-0001`・未発行は請求KEY）／**請求書の合計欄が「お見積金額」**→ ご請求金額／**値引きの行に案件の実施日が「期間: 2026/9/1 〜 9/2」と補われていた**（値引きは期間にわたって提供する役務ではない）。見積の有効期限（`valid_until`）を決めてあれば「提出後１ヶ月」ではなく**その日付**を出す。⑨**検証**: 実 Postgres ＋ 実サーバーで3種 × 見積/売上の両経路を発行し、行き先（社外01／社内03／社内03）・ファイル名・権限（sales editor 200＋保存／sales reader 200＋`NO_PERMISSION`／権限なし 403、budget も同様）を実測。実ブラウザ（1440px）で4画面のボタンを押し、**ダウンロードとトーストが出ること・横はみ出し 0px・JS エラー 0件**を確認（見積・請求と見積タブはスマホでは PC 専用の案内になるので列は出ない）。PDF は実際に描いて目で確かめた（3種）。`npm run test` 469項目（`docBoxDest` 7 を追加）、`typecheck` 3アプリ + server exit 0、`lint` 0 errors / 63 warnings。⑩**DB 変更なし。`shared/src/` を1バイトも触っていない**ので凍結4アプリの CSS は不変。`ensureSubfolder` は `sales` から `shared/services/box.ts` へ移しただけ（財務からも呼ぶため。`box-folder.service.ts` は再エクスポートで既存の呼び出しを保つ）。

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
