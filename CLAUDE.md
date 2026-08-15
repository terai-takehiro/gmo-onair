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
v4.0.19 — **プロジェクト管理の「開けるのに使えない」を4つ直し、検査の測り方の間違いを訂正した**（Codex のレビュー棚卸し #67・#74。P1 3件＋P2 1件、＋すでに直っていた1件）。①⚠️ **プロジェクト管理の権限だけの方は、依頼元を1件も選べず、プロジェクトを作れませんでした**（P2）。登録画面が引いていたのは案件管理の `/customers` で、**`sales` を要求する**ので 403 です（画面には「読み込み中」も出ないので、**なぜ選べないのかが分かりません**）。`gpm` の口を作り、**返すのは id と名前だけ**にしました（連絡先・備考は案件管理の持ち物）。②⚠️ **同じ方が請求タブを開くと、開いた瞬間に真っ白**でした（P1）。この画面は案件の行（`sales`）と売上・仕入（`budget`）の**両方**を読みます。**何の権限が要るかを名前で出して止める**ようにしました（v4 の「押せるのに 403 を作らない」）。⚠️ 案内の文面は既定が「A か B の**いずれか**」なので、**両方要る**と書けるようにしました（`requireAll`）— 片方だけ足してもらうと、また同じ所で止まります。③⚠️ **開けた方にも、月次請求が1つも出ていませんでした**（P1）。タブが `isEstimateMode` を渡していたため `monthlyMode` が**必ず false** になり、**このタブの目的（月締め）そのものが動いていません**でした。④⚠️ **受注にしても GLS-B が採られず、段の履歴も残りませんでした**（P1）。プロジェクト管理の更新は **`stage` の列を書き換えるだけ**で、案件管理の `changeStage` がやっている2つ（履歴・発番）をしていません。番号が無いと**月次にも上がらず**、しかも発番の口は案件側にしかなく `sales` を要求するので、**採る手段がありません**でした。⚠️ **`gpm.service` も `projectService` を export している**ので、案件側は別名で受けます（同じ名前だと発番が自分自身を呼びに行く）。⑤**すでに直っていた1件**: 上辺バーは 1024px でも本人メニューが切れません（実測: 右端 1000px・パンくずは縮む）。⑥⚠️ **検査の測り方が間違っていたので訂正します。** 実ブラウザの検査で使っていた開発サーバーの起動の仕方（リポジトリの根から `npx vite <ディレクトリ>`）では**PostCSS の設定が読まれず、Tailwind が1行も走っていませんでした**。つまり **v4.0.16〜18 の「横はみ出し 0px」は、CSS が当たっていない画面で測った値**です。`npm run dev -w <アプリ>` で**測り直した結果はどの画面も 0px のまま**で結論は変わりませんが、当時それを言える根拠はありませんでした（v4.0.18 の添付の検査を「375px」と書いたのも誤りで、実際は 1440px です — 上の行を直しました）。**検査の script では毎回 `.flex` が本当に flex になっているかを確かめます**。⑦**検証**: 実 Postgres ＋ 実サーバーで — 受注にすると **GLS-B003 が採られ、履歴が1行**（**反証: 直しを外すと GLS は None・履歴 0行**）、`gpm` だけの人は **`/customers` 403 に対し `/gpm/customers` 200（返る列は id・name・short_name の3つだけ）**、`/projects/:id` は 403 のまま。実ブラウザで**管理者には「月次管理（月締め：売上・仕入）」が出る**（**それまで一度も出ていなかった**）、`gpm` だけの人には**「案件管理 と 財務管理 の両方 の『見るだけ』です」**と出る（1440px・横はみ出し 0px・JS エラー 0件・**CSS が効いていることを確認済み**）。`shared/tests/gpmIntegrity.test.ts` 4項目、`npm run test` 550項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings、**`check:frozen` OK**（`shared/src/client/` を触ったのでビルドして突き合わせ済み。足したのは文言と真偽値の引数だけでクラス名は書いていません）。⑧**DB 変更なし。**

v4.0.18 — **AI の指標と費用を信じられるものに直した**（Codex のレビュー棚卸し #52・#75・#79・#78。P1 5件＋P2 2件、＋すでに直っていた2件）。会社方針「AI を使い捨てにしない」の**条件2（人の修正を差分で残す）と条件3（成果を紐づける）**が、**書いてあるのに実際は壊れて**いました。この一群は**数字が出るぶん厄介**です — 受入率 0% は「AI がまだ下手なのだ」と読めてしまいますし、修正率が上がっても「AI が悪くなった」のか「AI が自分で直した回を数えている」のか区別が付きません。①⚠️ **直さずに承認した回が1件も記録されていなかった**（P1）。差分は**直したときだけ**書く作りなので、**AI の下書きがそのまま通った＝いちばん良い結果**が分母にも分子にも入りません（受入率は永久に 0%）。**「確認しました」を押した1回だけ**`none` を一式積みます（開くたびに積むと、よく開かれる案件ほど精度が高く見えます）。②⚠️ **AI が自分で直した分を「人の修正」として記録していた**（P1）。MCP の `update_project` は人が居ないとき `config.mcpActorId` で呼ばれるので、**自分の間違いを自分で直すたびに修正率が上がって**いました（人が MCP 越しに操作したときは今までどおり記録します）。③⚠️ **投入口から作った議事録の直しが、投入口の指標に混ざっていた**（P1）。議事録の行に**投入口の `ai_output_id`** を持たせていたため、人が議事録を確定するとその差分が `task_intake` の記録に入ります。項目名も違う（`tasks[...]` と `summary`）ので**どちらの無修正採用率も読めません**。議事録には**議事録の出力（`minutes_draft`）**を立てます。④⚠️ **録りながらの下読みが、20 秒のはずが5分まるごとを送っていた**（P1）。止めたその場で必ず録り直していたので、間隔が5分になったあとは**録りっぱなし**でした＝ **打合せの音声を丸ごと2回**文字にしていたことになります（画面には「費用を抑えるため5分ごと」と出ているのに、**送る長さはどこにも出ない**ので気づけません）。⑤⚠️ **写真の縮小が終わる前に送れて、添付が黙って消えていた**（P1）。⚠️ **押せなくするだけでは足りません** — `disabled` は描き直しが1回入ってから効くので、**選んだのと同じ瞬間に押すと素通り**します（実測で確認）。**送る側が縮小を待ち、待ったあとの値を読む**ようにしました（`useRef`。待ってから古い `files` を読むと結局 0 件のままです）。⑥**落ちた呼び出しが使用量に残っていなかった**（P2 2件）。軽いモデルで落ちて上位モデルでやり直した回と、議事録の文字起こし・整形が落ちた回です。**落ちた呼び出しにも課金されることがある**ので、設定の「AI の使用量」は**成功した回だけの総額**を出していました。⑦**すでに直っていた2件**: 長い録音は migration 180 で 202 ＋ 裏で処理になっている／マイクは `useEffect` の後始末で解放している。⑧**検証**: 実 Postgres で**差分の付き方を数えました** — 直さず承認 **`none`=19**（**反証: 前の版は 1件も記録されない**）、二度押しても **19 のまま**、人が直すと **`fix`=2＋`none`=17**、AI が直すと **1件も記録しない**（**反証: 前の版は `fix`=2＋`none`=17 が付く**）。議事録は**別の出力（`minutes_draft`）に `summary:fix`**（**反証: 前の版は投入口の出力に議事録の項目が全部混ざる**）。実ブラウザ（偽マイク）で**下読みの送信量を実測** — 1回あたり **約14.6KB で一定**（**反証: 前の版は間隔ぶん増えて約47KB＝3.2倍**。本番の間隔〈20秒 対 5分〉では **15倍**になります）。添付は**選んだ瞬間に押しても 1件のまま送れる**（**反証: 前の版は 0件で送られる**）、縮小中は**押せない＋「写真を準備しています」**（1440px・JS エラー 0件。**v4.0.19 で測り直した値**）。`shared/tests/aiFeedback.test.ts` 7項目、`npm run test` 546項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings。⑨**DB 変更なし。`shared/src/` を1バイトも触っていない**ので凍結4アプリの CSS は不変。

v4.0.17 — **確定した記録が後から変わるのを止め、断り文が画面に届いていなかったのを直した**（Codex のレビュー棚卸し #57・#83・#61。P1 6件＋P2 1件、＋作業中に見つけた1件）。❓（読んだだけ）の 101 件を1件ずつコードで当たり直す作業の2回目です。この一群は**画面を見ても気づけません** — 確定した週報に行が増えても、開けば**その行がふつうに並んでいる**だけで、読んで確定した人の記憶と食い違うまで分かりません。棚卸しも**数えた紙と突き合わせるまで**分かりません。①⚠️ **確定した週報に後から行を足せた・直せた・消せた**（P1）。画面（`WeeklyDetailPage` の `editable`）は止めていましたが、**守りが画面の側にしかなく**、**ニュースの「週報へ送る」**・MCP・直接叩きから素通りでした（送った人には成功に見えます）。②⚠️ **AI をもう一度走らせると、確定した週報の本文が書き換わった**（P1）。「published を draft に戻さない」とは書いてあったのに、**題名・本文・集計は素通しで上書き**していました。③⚠️ **`published` だけで判断しないこと** — デイリーニュースは*閲覧型*で `published` を「確定の操作が要らない種類」の印に使っています（MCP が毎日 published で作り、人も行を足す）。種類で分けずに塞ぐと**ニュースが1行も書けなくなります**（`LOCKING_KINDS`）。④⚠️ **塞ぐだけにしない** — 確定した週報を戻す口がどこにも無かったので、**「確定を解く」**を作りました。無いと「もう1行入れたい」で行き止まりになります（`published_at` は消さない — 一度出した事実は記録）。ニュース側も**押す前に止めます**（送り先の週報の状態を見て、理由をボタンに出す）。⑤⚠️ **終わった棚卸しをスマホから書き換えられた**（P1）。PC はボタンを止めていましたが、**スマホの読み取り画面もサーバーも状態を見ていません**でした（数え終えて報告したあとに数字が動く）。⑥⚠️ **送信中に付け直した印が消えていた**（P1）。溜めて後で送る列が**鍵だけで消して**いたので、送っている最中に付け直すと**まだ送っていない新しいほうまで消え**、押した人には印が付いて見えるのに**サーバーには古い値が残り**ます（積んだ時刻まで一致したものだけ消す）。あわせて**断られたものは列から外す** — 残すと「まだ送れていません」が永久に消えず、現場がこの表示を信じなくなります。⑦⚠️ **確かめていない AI の K/P/T が隔週キープの資料に載った**（P1）。migration 185 に「人が確かめずに資料へ出ると、AI の推測が実施報告になる」と書いてあるのに、絞りがどこにも入っていませんでした（**案件のふりかえりでは今までどおり全部見えます** — そこが確かめる場所なので）。⑧⚠️ **旧レポート画面が、消えた列（`highlights`）を読んで開くと落ちた**（P1）。migration 185 で K/P/T の表へ畳んだ列です。**入力欄も残っていて、打った文字はサーバーに黙って捨てられて**いました。⑨**受注にした瞬間に放送種別・媒体が消えた**（P1）。`changeStage` が **`{}` で発番を呼ぶ**のに、発番の SQL が常に両方を書いていました（欄が空になるだけで理由が残らない）。**値が渡されたときだけ書く**。⑩**週報の記録者に UUID が出ていた**（P2）。`recorded_by` は**画面にそのまま出る名前**の列です。⑪⚠️ **断り文が画面に一度も届いていなかった**（**この作業中に実サーバーで測って見つけたもの**）。`AppError` は `(状態, コード, 文)` の順ですが、**日常業務の 6 ファイル・35 か所が逆**で、`error.message` にコードが入っていました。画面（`notifyApiError`）に出ていたのは **`VALIDATION_ERROR` の6文字**だけです。型はどちらも `string` なので**型検査にも lint にも出ません**（試験が server 全体を数えます）。⑫**検証**: 実 Postgres ＋ 実サーバーで測りました — 週報は**確定後に足す/直す/消す/送るが全部 400・解くと 201**（**反証: ニュースは published のまま 201 のまま**＝閲覧型を壊していない）、AI の上書きは **400 で本文が変わらない**、棚卸しは**終わったあと 400・開き直すと 200**（**反証: 守りを外すと 200 で書き換わる**）、資料の一覧は**確かめた行だけ**（**反証: 絞りを外すと未確認の AI 下書きが混じる**）、GLS は**受注のあとも 生放送/YouTube のまま**（**反証: 元の SQL に戻すと両方 None**）、週報の記録者は**「検証 管理者」**。実ブラウザで**隔週キープ資料が開く**（**反証: `highlights` を読む形に戻すと `TypeError: Cannot read properties of undefined` で画面ごと落ちる**）、週報に**「確定を解く」と説明が出る**、ニュースの送るボタンが**押せない状態＋理由**、スマホの棚卸しは**「読むだけ」の帯・QR も手入力も出ない・17個の印が押せない**（375px・横はみ出し 0px・JS エラー 0件）。`shared/tests/recordIntegrity.test.ts` 9項目、`npm run test` 539項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings。⑬**DB 変更なし。`shared/src/client/` は触っていない**ので凍結4アプリの CSS は不変（触ったのは v4 だけが読む `shared/src/client-v4/offlineQueue.ts`）。


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
