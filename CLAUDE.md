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
v4.0.8 — **プロジェクト管理が全画面 500 で開けなかったのを直し、工程の下のタスクを出した**（工程管理として使えるようにした回）。①⚠️ **前提: プロジェクト管理は一覧・詳細・作る・直すの4つとも 500 だった**。migration 184 が `projects.notes` を落としたとき、**案件管理側だけが直っていて GPM が取り残されていた** — `gpm.service.ts` の SELECT / INSERT / UPDATE が `notes` を触りつづけており `column "notes" of relation "projects" does not exist`。**型検査にも lint にも出ない**（SQL の中身は見ない）。画面には「サーバー内部エラー」とだけ出るので、使う人からは「プロジェクト管理が開かない」に見える。②**メモは案件と同じ関数を読む**（`addMemoActivity` / `MEMO_LATERAL` を `project.service.ts` から export して呼ぶ）。写すと、置き場所を次に変えた日にまた片方だけ取り残される。読む側の名前（`notes`）は変えていないので画面はそのままで、**中身が「いちばん新しいメモ」**になった。③**同じ壊れ方を止める試験を足した**（`shared/tests/droppedColumns.test.ts`）。migration の `DROP COLUMN` を集め、サーバーの**SQL 文字列だけ**を見に行く（`--` の注釈は落とす — 「migration 184 で projects.notes を落とした」という説明文は正しいので、素の文字列検索にすると注釈で落ちる）。**`p.notes` を戻すと実際に落ちることを確かめてある**。④⚠️ **この試験が2つめの穴を見つけた**: 投入口（`task-intake.service`）の**ネタ案件を作る道も同じ列を触っていて 500**だった（実 API で再現 → 直したあと登録でき、本文がメモとして残ることを実測）。本文は**同じトランザクションの中で**やり取りのメモ1件にする — 外に出すと「案件はできたが本文が消えた」が起き、入れた人は登録したつもりなので入れ直さない。⑤**工程の名前を押すとその工程のタスクが出る**（`projectDetail/OverviewTab.tsx` ＋ `TaskRows.tsx` ＋ `TaskDialog.tsx`）。着手前は工程の「3 / 7」という**件数だけ**で、**何が残っているのかがこの画面から分からず** ⑤ 全プロジェクトのタスクで絞り込み直すことになっていた（⑤ には「タスクを足す・直すのはプロジェクト詳細の工程から」と書いてあったのに、**詳細にその口が無かった**）。既定は閉じている（7工程 × 4〜5タスクで 30行を超える）。**開いている工程はタブの部品が持つ** — 行の中に持たせると、並べ替えや保存で行が作り直された瞬間に閉じる。⑥**サーバーに足した口**: 工程を足す・並べ替える（隣と入れ替え）・消す／タスクを足す・直す・消す。**工程を消しても配下のタスクは消さない**（`gpm_phase_id` を NULL にするだけ）— 一緒に消すと「名前を直したかっただけ」の人が**タスクを何十件も消す**。外れたタスクは「工程に付いていないタスク」の束に残るので付け直せる（**何件外れるかを確認に出す**）。**並べ替えは隣と入れ替えるだけ** — 並び全体を採番し直すと、2人が同時に押したときに片方の並びが丸ごと巻き戻る。**端では何もしない**。**他のプロジェクトの工程には付けられない**（付くと、そのタスクが別のプロジェクトの工程の下に並び、進み具合の分母も相手側に足される）。**期限は `due_at` の 18:00**（ひな形から写すときと同じ形。`due_date` に入れると「自分のタスク」の並びが日によって入れ替わる）。**直すときは渡した項目だけを書き換える**（画面が持っていない担当・工程が空で送られて黙って外れるのを防ぐ）。ただし期限は**鍵が入っていれば `null` でも書き換える** — でないと「期限を消す」ができない。⑦⚠️ **`useInvalidateGpm` がタスクの鍵を落としていなかった**: ⑤ でチェックを入れると「完了にしました」の札は出るのに**行が変わらない**（鍵が違うだけなので型検査にも lint にも出ない）。⑧**一覧に「見積」の列を足した**（モックの `money`）。金額は**案件一覧と同じ式**（サーバーの `ESTIMATE_AMOUNT_LATERAL` を export して読む）— 束ごとに最新版・旧版と失注を外す・値引きは引く・**税は乗せない**。見積が1本も無い行は「見積なし」（0円ではない）。「金額の列はありません」という**古い注記を消した**（見積は migration 173 から入っている）。⑨**シードにプロジェクト管理のデータを入れた**（固定 id `gpm-1` / `gpm-2`・工程8・タスク13・未確認事項4・体制6名・見積2本）。着手前は**データが1件も無く `gpm` の権限も誰にも付いていなかった**ので、検証環境では system_admin で開いて「プロジェクトがまだありません」を見るしかなかった。工程は「完了・進行中・待ち・未着手」を1つずつ入れてある（1つの状態しか無いと色と並びの決めごとを画面で確かめられない）。⑩**検証**: 実 Postgres ＋ 実サーバーで **API 23項目**（足す・直す・消す・完了の入切・渡さない項目が保たれること・他のプロジェクトの工程を弾くこと・工程を消してもタスクが残ること）と**権限の壁8項目**（`gpm` の口から案件〈GLS-A〉のタスクを直せない・消せない・完了にできない／一覧に混ざらない）。実ブラウザで**31項目**（12画面を 1440px で開いて**横はみ出し 0px・JS エラー 0件**、工程を開く→タスクを足す→直す→完了→工程を足す→並べ替える→消す を実際に押す、390px の3画面と PC 専用の案内、1024px で工程を開いてもはみ出さないこと）。`verify:ui` に**詳細の4タブを足して** 246/246（いちばん操作の多い画面が見た目の検査に1度も載っていなかった）。`npm run test` 464項目（`droppedColumns` 2 を追加）、`typecheck` 3アプリ + server exit 0、`lint` 0 errors / 63 warnings。**DB 変更なし。`shared/src/` を1バイトも触っていない**ので凍結4アプリの CSS は不変。

v4.0.7 — **案件を直す画面を案件作成とそろえ、押しても遷移しないリンクを直した**（利用者からのご指摘2件）。①**症状1**: 案件作成で訊く **客入れの有無・案件分類・ご担当・継続区分・来場人数・案件内容・リード経路**が**直す画面にひとつも無く**、代わりに旧1段の「案件種類」（ハイブリッド／生放送／収録／…）だけが残っていた。つまり**作るときに入れたものを、あとから直す場所がどこにも無い**うえ、同じ案件が画面によって違う分類で見えていた。言葉も揃っていなかった（顧客／お客様・主担当／社内の担当・想定金額／予算）。②**欄を書き写さず、案件作成の部品をそのまま呼ぶ**（`projectNew/RequiredFields` / `MoreFields` に `mode`）。**写すと必ずまた離れ、離れても型検査にも lint にも出ない**（今回がそれ）。値の形・必須の判定（`missingOf`）・畳んだ札の数（`moreFieldCount`）も1つの定義を両方が読む。`projectForm/BasicSection.tsx` と `AmountSection.tsx` は削除。③**直す画面で出さない4つ**（どれも置くと壊れる）: **ステージ**（この保存は `stage` を1文字も見ない＝押せるのに何も起きない欄になる。段は履歴・失注理由・GLS 発番の確認を伴う）／**実施日**（「スタジオの日程」が `project_dates` の唯一のもと。2か所から全置換すると片方で足した日が消える）／**最初のタスク・メモ**（直すたびに同じものが1件ずつ増える）。**出す1つ**は**グループ区分** — 見積の単価（定価/グループ内価格）がこの値で決まり、直せる場所がここ以外に無い。④**サーバーで2つ直した**: **リード経路を `update()` が1度も書いていなかった**（作るときだけ入り、あとから直す道が無い。`project-ai-feedback.service` の突き合わせ項目には最初から入っていたので、**人が経路を直しても差分は永久に「無修正」**に数えられていた）／**`customer_type` も「渡さなければ今の値を保つ」**にした（`normalizeCustomerType` は知らない値を `external` に倒すので、欄を持たない呼び出しから保存されるだけで**グループ内の案件が黙って社外に戻る**）。⚠️ **旧 `project_type` は保存で送らない**（送ると2段を直しても古い種類が一緒に来て、分類と種類がずれた行ができる）。⑤**症状2の根っこ**: `App.tsx` の最後の `<Route path="*">` が拾うので、**行き先の無いリンクは 404 にならず黙ってホームに戻る**。押した人には「押しても遷移しない」としか見えず、機械にも出ない。⑥**直したリンク5件**: 概要の「すべて見る」（`to="?tab=thread"` だが**タブは URL の区間**で持っている）／仕入の「按分グループ」（`/project-groups` に `/sales` が無い）／旧 `/…/episodes`（転送先が消した `episode` タブのまま。**回の表はタスクタブ**なので `task` へ）／**転送 20 本がクエリを落としていた**（`/sales/inbox?inquiry=123` から来ると引き合いの id が消え、**同じ引き合いから案件が2件**できる）／「カレンダーで空きを見る」（送る側は残っていたのに **v4 で ① 予定を作り直したとき受け口が落ちていた**）。⑦**再発を止める検査を `npm run lint` に足した**（`scripts/check-links.mjs`）。ルート表と画面の行き先を突き合わせる。**実際に `/project-groups` を戻して落ちることを確かめてある**。⑧**v3 の置き土産を落とした**: `MyTasksSummarySection.tsx`（204行・参照0・旧トップの部品）／`ui/scroll-area.tsx` `ui/separator.tsx` `server/.../validators.ts`（参照0）／概要タブの**「タグ」節は値があるときだけ**出す（入力欄も絞り込む口も無く、ほぼ全案件で「付いていません。」の**永久に埋まらない枠**が並んでいた。**列と既存の値は消さない**）。⚠️ `server/src/shared/db/reset.ts` は参照0に見えるが **`npm run db:reset` の実体**なので消さないこと。⑨**触っていない v3**: 左メニュー「そのほか（作り直し前）」の10画面。**どれも動いている**ので、掃除ではなく作り直しとして別の回にする。⑩**検証**: 実ブラウザで2画面の項目を突き合わせ（作成14／直す13・差は上の4＋1と日程2つだけ）、**案件管理の34 URL** を開いて本文のリンクを1つずつ押し**ホームに戻るもの0・押せないもの0**、1440px と 390px で**横はみ出し 0px・JS エラー 0件**。実 Postgres で往復保存・2段分類の追随・**リード経路が保存されること**（これまでできなかった）・欄を持たない呼び出しで保たれること・古い GLS-B が開けて保存でき分類を勝手に埋めないことを実測。`npm run test` 428項目（`projectFields` 10 を追加）、`typecheck` 3アプリ + server exit 0、`lint` 0 errors / 63 warnings、`verify:ui` 1887/1925（**残りはこの版が1行も触っていないファイルの画面**）。**DB 変更なし。`shared/src/` を1バイトも触っていない**ので凍結4アプリの CSS は不変。

v4.0.6 — **「次にやること」が長文の塊になって読めなかったのを直した**（利用者からのご指摘）。①**症状**: やり取りの「次にやること」は自由文1本で、実際に入っているのは *言い切り1文 ＋ ぶら下がる作業数件*（`★8/14(金)までに…確定し発注する(…)。①金子様からの…②パーテーション…③搬出時刻…④督促し…`）。画面はこれを **1つの段落に太字で流し込んで**いたので**10行ぶんの塊**になり、**期限（`8/14 まで`）が塊のいちばん最後**に付いて目に入らなかった。②**直したのは画面側**（`projectDetail/thread/nextAction.ts` を新設）。⚠️ **プロンプトを直しても、いま入っている値は1文字も変わらない** — この文を書いているのは AI とは限らず、メール取込は MCP の `create_activity_log` が `next_action` を直接書き、**整形はすでに値がある行の `next_action` を上書きしない**（`activity-format.service` の `has(row.next_action)`）。**すでに溜まっている記録を読めるようにできるのは画面側だけ**。③**分け方は3通りに落ちる**: 1行に埋まった丸数字（**本番データでいちばん多い形**）／行頭の印がある複数行（`・` `1)` `①` `→`）／印がまったく無い長文は**句点で行に分ける**（80字以下は分けない — 「見積書を送付する。」を2行にしても行が増えるだけ）。④**分けすぎない守り**: 丸数字は **`①` から始まり1つずつ増えるものだけ**を並びと見なす（`②の件は…` のように**本文が番号を参照しているだけ**のときに分けると、文が途中で切れた項目ができる）。**句点は括弧の外だけ**で切る（「(発注期日 8/19 は…中日。実働は2日)」が途中で切れると元に戻せない）。**`★` は消さない・番号は文字として残す・並べ替えも要約もしない**（`noteText.ts` と同じ決めごと）。⑤**見せ方**: **見出しだけ太字**（全部太字は太字を使っていないのと同じ）／**期限は見出しの直後**（並びの後ろに回すと10行スクロールしないと読めない）／**並びは赤くしない**（期限切れでも赤いのは枠と見出しだけ。4行とも赤いと何が期限切れなのか読めない）／印が無い並びは画面が `・` を描く（**原文に無い番号を作らない**）。⑥**一覧側は言い切りの1文だけ**にした（概要タブの「次にやること」と、やり取りのダイジェスト）。全文を1〜2行で切ると**2件目の途中で切れた文**が並んでいた。**件数（`ほか4件`）は必ず添える** — 続きがあると分からないと、ここで読んだつもりになって残りが見落とされる。⑦**プロンプトはこの形に寄せただけ**（`activity-v2` → `activity-v3`）。**1文目で言い切り、ぶら下がる作業は `①` から順**。**作業を数合わせで作らない**ことを併記した（`・` `-` は使わせない — 画面が読み取る印を1つに絞るため）。⑧**検証**: 実 Postgres ＋ 実サーバー ＋ 実ブラウザで**4通りの行**（本番データそのまま／短い1文／期限切れ＋丸数字／印の無い長文）を 1280px と 390px で描き、**横はみ出し 0px・JS エラー 0件**、並びが 4/0/2/2 行に分かれること、**読ませる文が PC 12.5px・スマホ 13px**（決めごとの下限を割らない）ことを実測。短い1文は**今までと1ピクセルも同じ**（42px）。`npm run test` 418項目（`nextAction` 13 を追加。**どの試験でも「繋ぎ直すと元に戻る」ことを確かめている** — 分け方を間違えるとやることが1件消えるが、画面を見ても気づけない）、`typecheck` 3アプリ + server exit 0、`lint` 0 errors / 63 warnings。⑨**DB 変更なし。`shared/src/` を1バイトも触っていない**ので凍結4アプリの CSS は不変。**取込側（MCP ツール・取込スキル）も1行も触っていない**。

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
