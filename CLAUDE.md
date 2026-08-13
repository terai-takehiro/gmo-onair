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
| 版ごとの変更 (全428件) | [docs/version-history.md](docs/version-history.md) |
| v4 の画面ごとの仕様 (モックから切り出したもの) | `docs/design/v4/` |
| 用語の決めごと | [docs/wording.md](docs/wording.md) |
| MCP のツール一覧 | [docs/mcp-server.md](docs/mcp-server.md) |

## 現在のバージョン
v4.0.3 — **`.env` に書いても効かない環境変数を7つ直した**（費用計算が出なかった件）。`docker-compose.yml` は `env_file:` ではなく **`environment:` の許可リスト**で変数を渡すため、**そこに書いていない変数は `.env` にあってもコンテナに届かない**。`AI_PRICING_JSON`（費用の金額表示）・`ACTIVITY_FORMAT_NIGHTLY`（毎晩の整形を止める）・`ACTIVITY_AI_MODEL` / `KPT_AI_MODEL` / `MINUTES_AI_MODEL` / `MINUTES_STT_MODEL` / `INTAKE_AI_MODEL_LIGHT` の7つが漏れていた。どれも `.env.example` に書き方まで説明してあり、**入れれば効くつもりで案内していた** — 実際には「単価を入れたのに金額が出ない」「`off` にしたのに毎晩走る」という形になり、**画面にもログにも『届いていない』とは出ない**。①7つを prod / dev の両方に足した（`ACTIVITY_FORMAT_NIGHTLY` だけ `_DEV` を作った — **本番と検証は同じ鍵を共用できるので、両方が毎晩走ると同じ請求書に2つぶん載る**）。②同じ経路で**ほかに3つ**見つかったので一緒に直した: `SMTP_SECURE`（465番の暗黙TLSが選べず、**常に STARTTLS 扱い**だった）・`XPOINT_BOX_FOLDER_ID` / `KESSAN_BOX_FOLDER_ID`（取り込みの置き場所を変えられなかった。既定では動く）。③**同じ漏れを機械で止めるようにした**（`scripts/check-env-passthrough.mjs` を `npm run lint` に追加）— `server/src` の `process.env.X` を集めて `docker-compose.yml` と照合し、渡していないものがあれば止める。**渡さないのが正しい6つ**（`NODE_ENV`・`PORT`・`DB_NAME`・`RUN_SEED_ON_STARTUP`・`HTTPS_ENABLED`・`MCP_ACTOR_ID`）は**理由を書いた表**で除外する（理由の無い除外が増えると、この検査は「いつも通る」だけの飾りになる）。④`.env.example` に**単価の鍵は実際に呼んだモデル名と1文字も違わないこと**を書いた（合わないと**その行は合計に足されず静かに安く見える**）。確かめ方の SQL も添えた。⑤**検証**: `docker compose config` で7つが prod / dev の両方に実際に届くことを実測（値を入れて出力に出ることを確認）、検査を入れた状態で `lint` 0 errors、`typecheck` 3アプリ + server exit 0。**DB 変更なし・コードの挙動は1つも変えていない**（渡していなかったものを渡すだけ）。

v4.0.2 — **やり取りの記録を「誰が何を言ったか」が分かる形にした**（利用者からのご指摘「読みづらい」「AI っぽい」への作り直し・migration 188）。①**AI に HTML を書かせるのをやめた**。v1 は `body_html` を1本返させていたが、取り込んだメールは**先方の依頼と当社の回答が交互に並ぶやり取り**で、1本の文章にすると**どちらの発言かは文の中にしか残らず**、読む人が毎回頭で分解していた。v2 は AI に**意味の単位**（件名・副題・状態・事実・要約・発言）を返させ、**見せ方は画面が決める** — これで取込側の決めごと（`rich-content.ts`「AI は何の情報かを言い、どう見せるかはアプリが決める」）とやり取り側の作りが揃った。②**画面（`thread/ThreadCard.tsx`）はモックの装飾に寄せた**（ご承認いただいた案6）: フラットアイコン（lucide）で「日時」「人数」などの**ラベルを消す**／状態は**塗りピルではなく 6px の点＋文字**（2つ並べると色の塊が件名より目立つ）／事実は**区切り記号を使わない**（4つ並ぶと記号のほうが数が多くなる）／頭文字は**角丸の四角**（完全な円は SNS の人物写真の記号で業務の記録には強すぎる）／**色を使う枠は「次にやること」1つだけ**（複数あるとどれが行動か読めない）。**表の行をやめてカードにした** — 1件が会話の形を持つので、区切り線で詰めると「どこまでが1件か」が読めない。③**3段に落ちる**: 構造がある行＝この形／**v1 で整えた行は `body_html` のまま描く**（作り直すまで読める状態を保つ）／どちらも無ければ原文を `parseNoteText` で。④**「整え直す」を足した**（会社方針「AI を使い捨てにしない」の条件2）。v2 は **AI が「誰の発言か」を決める**ので、取り違えると**当社が答えたことが取引先の発言として残る**。本文を直す画面はまだ無いため、**「この整形は違う」を人のいちばん強い信号として `ai_corrections` に `reject` で残し**、その行を待ち行列へ戻す（`editor` で押せる／原文は残る／整え直しは毎晩3:00で、そのことを押す前に書く）。⚠️ **ここだけ7日窓を掛けない** — 窓は「ふつうの業務更新を AI の誤りと数えない」ためのもので、**人が押した「違う」に時効は無い**。⑤**待ち行列の表し方を組み直した**。187 は「まだ = `body_html IS NULL AND format_attempted_at IS NULL`」だったが、**成功時にも `format_attempted_at` を立てている**ためこの2つでは成功と失敗を見分けられない（187 の時点では `body_html` の有無が成功の印だったので成り立っていた）。**失敗の印を `format_error` に寄せ**、整えた=`body_struct IS NOT NULL`／失敗=`format_error IS NOT NULL`／まだ=どちらも無い、にした。**人が入れた本文（`body_html` があり `ai_formatted` が false）は対象にしない**（人の文章を AI の構造で置き換えない）ので、この行はどの状態にも入らない —**持っていないと合計が合わない**ので `skipped` として数え、0 でなければ画面にも出す。⚠️ **v1 で整えた行はもう一度対象になる**（1件1コールで課金される）。作り直さないと同じ一覧に2つの見た目が混ざるため。件数と推定費用は押す前に出る。⑥**上書きしないものは v1 のまま**: 件名（取込スキルの件名のほうが精度が高い）・`next_action`（空のときだけ埋める）・**`description`（原文）は1バイトも触らない**。⑦**期限の書き方を1か所にした**（`thread/format.ts` の `shortYmd`）。`2026-08-01` を本文に混ぜると10文字のうち読む情報が2文字しかない。**年が基準と違うときだけ年を出す** — いつも省くと 2027-01-05 が「1/5」になり**年をまたいだ期限が過ぎた日に見える**。やり取りタブと概要タブが同じ関数を読む。⑧**検証**: 実ブラウザで**3段すべて**を 800px / 390px で描き、**横はみ出し 0px**・SVG アイコン15個・**レールとアバターが実寸法を持つ**（クラス名だけ書いて 0×0 になっていないこと）・**13px を割る読ませる文は 0**（残るのは節見出し12px・頭文字11px・時刻の数字11.5px だけ）。**実 Postgres** で migration 188 の適用・4状態＋skipped の件数（2/1/1/1＝合計5・空白だけの本文は対象外）・**部分索引が実際に使われること**（`Index Scan using idx_activity_logs_struct_pending`・4,000行で実測）・整え終わった行には書けないこと（0行）・`resetFailed` が失敗行だけ戻すこと。**実サーバー**で整え直しの権限（権限なし=403／sales editor=200／原文なし=400 `NO_ORIGINAL`）と、**240日前の AI 出力にも `reject` が残ること**、**何も変えずに保存すると `none` だけで `body_struct` が誤って「直した」に数えられないこと**を実測。`npm run test` 392項目（`activityStruct` 16・`threadFormat` 12 を追加）、`typecheck` 3アプリ + server exit 0、`lint` 0 errors / 63 warnings、`build:all` 全9ワークスペース、**`check:frozen` 変化なし**（`shared/src/` を1バイトも触っていない）、`check:version` 一致。⑨**動かなくなっていた M9（スクロールで上辺バーを畳む）をフックごと消した**（ご判断）。判定の `client-v4/collapseOnScroll.ts` と `AppShell` が付けていた印 `data-shell-collapsed` だけが残り、**見た目を決める規則は `0ed18d34`（スマホ上辺バーをモックに戻した回）で巻き添えに削除されていた** — つまり**印を書くだけで何も起きない状態**が続いていた。スクロールのたびに判定が走って `AppShell` が描き直され、`<main>` の ref も握っていたので、**動かない機能のために毎回の再描画だけを払っていた**。戻すなら CSS とフックを**同じ回で**入れること（片方だけだと、また誰も気づかない死んだ機能になる）。実測: ビルド成果物から `shell-collapsed` が消え、**`check:frozen` は基準どおり**（この印は CSS を1つも持っていなかったので当然だが、`shared/src/client/` を触ったので機械で確かめた）。⑩**DB 変更あり（migration 188）** — `activity_logs.body_struct` の追加と索引の張り替えだけで、**既存データは1行も書き換えない**。**取込側（MCP ツール・取込スキル）は1行も触っていない**（本番の無人バッチを止めないため）。

v4.0.1 — **取り込んだやり取りを「読める形」にし、バッジの文字が1字ずつ離れる現象を直した**（利用者からの指摘2件＋ご要望1件）。①**取り込んだメールの本文が素の段落1つに流し込まれていた**。やり取りは AI が整えた `body_html` があればそれを描くが、**メール取込は素のテキストしか入れられない** — MCP の `create_activity_log` が受け取るのは `description` だけで `body_html` も `key_points` も受け口が無く、**毎日 sales@ から取り込まれる記録は整形器を1回も通っていなかった**。そのため見出しも箇条書きも同じ見た目になり、`**強調**` は**アスタリスクのまま**出ていた。取込テキストで実際に使われている書き方（`■`→見出し／`・`と`1)`「①」→箇条書き／`→`→帯／複数行の「」→引用／空行→段落）を読み取って `RichBlock[]` にする純関数 `shared/src/client-v4/noteText.ts` を入れ、**描くのは既存の `RichContent` に任せた**（見た目を決めるのは1か所）。**`★` は消さない** — 取込側が付けた注意の印で、どこまでが範囲かテキストからは決められない（消すと情報だけ落ちる）。**読み替えられなかった行は捨てず素の段落として必ず出す**（捨てると取り込んだのに画面に無い、が起きる）。文の途中で折り返された行だけ繋ぎ直す（行末が `。` などで終わっていない行）。`RichContent` に `InlineText` を足して `**強調**` を `<strong>` にした（**HTML として解釈していない** — 文字列を分けて React 要素にするだけなので `dangerouslySetInnerHTML` を使わない方針はそのまま）。②**概要タブの「お客様とのやり取り」を作り直した**（`ThreadDigest.tsx`）。取り込んだ件名は長いので**1行に切ると肝心なところが必ず消えていた** — 件名は2行まで／種類（メール・電話・打合せ）を出す／日付は `MM/DD` に詰めて年は変わったときだけ／**期限切れの「次にやること」を赤にする**（やり取りタブと同じ判定。概要だけ灰色だと手遅れに気づけない）。⚠️ `line-clamp-2` と `block` を並べると**clamp が黙って効かない**（`block` の `display` が `-webkit-box` を打ち消す。実測で件名が3行に伸びていた）。③**バッジの「口 頭 決 定」を直した（モックの読み間違い）**。モックのバッジは `width:62px; display:inline-flex; justify-content:center; text-align-last:justify;` で、**`text-align` 系は flex コンテナの中身の配置に効かない**ためこの1行は最初から死んでおり、**モックは中央寄せで描かれていた**。実装はこれを「均等割り付けの指示」と読み、表示を block 系に変え padding を 0 にして**わざわざ効くようにしていた**。モックどおり中央寄せ＋左右 padding 6px に戻した（**縦の整列は幅の固定だけで足りている** — 色の塊 62px も枠も固定なので `verify-ui` が見る左右端は動かない）。スマホだけ割り付けを打ち消していた M8 の規則は **`0ed18d34`（スマホ上辺バーをモックに戻した回）で巻き添えに削除**されており、それが「治っていない」理由だった。④**スマホで 11.5px だった読ませる文を 13px に上げた**。`text-sub-sm` は**スマホでも上げない段**（件数の数字・列見出し・バッジの札のための段）なのに、「次にやること」3か所と `RichContent` の帯がこの段に載っていた。日付ラベルは数字の札なので `text-sub-sm` のまま。⑤**既存の記録を含めて ChatGPT API で本文をあとから整形できるようにした**（ご要望・migration 187）。**新しい AI 機能は作っていない** — 既にある整形器（`activity-ai.service`・`kind='activity_format'`）の適用範囲を広げた形。`activity_logs.format_attempted_at` / `format_error` の2列＋部分索引を足し、待ち行列は**行の状態で表す**（ジョブの表は作らない）。**印が無いと、失敗する行を毎回呼んで課金され続け待ち行列も減らない**。設定 → システムの情報に「やり取りの本文を整える」カードを置き、**押す前に件数と実績からの推定費用**を出す（単価が未設定なら金額を出さず件数だけ）。毎晩 3:00 に 40 件ずつ追随（**通知は出さない**裏方の仕事・`ACTIVITY_FORMAT_NIGHTLY=off` で止まる）。`Job.templateId` を nullable にした — 通知しない仕事のために `notification_templates`（件名・本文・宛先の表）へダミー行を作らないため（**この検査を通さないと黙って1回も走らない**）。**埋めるのは `body_html` と `key_points` だけ** — **`subject` は上書きしない**（取込スキルの件名は状況ごと書かれていて精度が高く、整形器の30字で置き換えると改悪になる）、`next_action` は空のときだけ埋め、**`description`（原文）は1バイトも触らない**（「打った文をみる」から戻せる）。5条件（会社方針「AIを使い捨てにしない」）は 記録○（原文＋整形結果を全文。**出したものと実際に書いた値の両方**）／差分○（既存の自動比較。`ai_outputs.created_at` から7日窓なので**年単位で経ってからの通常の業務更新は誤りに数えられない**）／成果△（無修正採用率を差分から導出）／還流○（`getFeedbackDigest` の advice をプロンプトに載せる）／レビュー○（既存の月1回・営業のマネージャー。**`tool_name` を `activity.backfill` に分けた** — 対話経路と混ぜると統計が汚れる）。⑥**検証**: 実ブラウザで**`**` の生表示 0件**（→ `<strong>` 8個）・見出し5・箇条書き7・帯2・**概要の一覧は日付の左端が1つ(41px)・件名の左端が1つ(97px)** ＝縦の整列は保持・375px で**13px を割る読ませる文が 0**・横はみ出し 0px。**実 Postgres** で migration 187 の適用・4通りの行に対する件数（1/1/1/3・空白だけの本文は対象外）・**部分索引が実際に使われること**（`Index Scan using idx_activity_logs_format_pending`）・**整形済みの行には書けないこと**（0行）・失敗の印を立てると次の回に拾われないこと・`resetFailed` が失敗行だけ戻すことを実測。`npm run test` 365項目（`parseNoteText` 18・`mergeFormatted` 8 を追加）、`typecheck` 3アプリ + server exit 0、`lint` 0 errors / 63 warnings、`build:all` 全9ワークスペース、**`check:frozen`**（凍結3アプリが -37 バイト。**修正前後の CSS を規則単位で突き合わせ、差分が `.px-0` の1規則だけ**であることを実測。凍結4アプリは `px-0` を使っておらず描画は不変なので理由を添えて基準を更新）、`check:version` 一致。⑦**DB 変更あり（migration 187）** — 列の追加と部分索引だけで、**既存データは1行も書き換えない**。**取込側（MCP ツール・取込スキル）は1行も触っていない**（本番の無人バッチを止めないため）。

> **これより前の版は [docs/version-history.md](docs/version-history.md) にあります**（v4.0.0 以下・425件）。
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
