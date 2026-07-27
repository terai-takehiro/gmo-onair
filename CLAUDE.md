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
v2.9.294 — **1000行を超えるファイルの分割 (4本目・5本目)**。①**`RackLayoutPage.tsx` 1,505 → 714行**（−791）。**1000行を切ったのはこれが最初**。切り出したのは 定数と型 (`config.ts` 49) / ダイアログ2つ (`dialogs.tsx` 156) / ラック図の絵 (`RackDisplay.tsx` 412) / 印刷用 (`print.tsx` 205)。②**このファイルは切りやすかった**。もともと**関数が9つに分かれて並んでいた**（`RackDisplay` / `DefaultCellContent` / `UnitBadge` / `PrintRackArea` …）ので、props はすでに決まっていて**そのまま移すだけ**で済んだ。「1つの巨大な関数」ではなく「小さい関数が1ファイルに積んである」形なら、分割はほぼ機械作業になる。③**`SchedulePage.tsx` 1,515 → 1,234行**（−281）。切り出したのは 型・定数・道具 (`types.ts` 145) / カレンダー連携ダイアログと種別ピッカー (`dialogs.tsx` 148)。**祝日の一覧（2027年まで手で書いてある）がページの本文に埋まっていた**ので、「調べて直すもの」を開くのに 1,500 行のファイルを開かなくて済むようにした。④**未使用になった import は型チェックに列挙させた**。今回は `TS6133`（名前が未使用）に加えて **`TS6192`（import 文がまるごと未使用）**も出たので、両方を機械的に処理した（計 34 件）。⑤**検証**: 全9ワークスペースのビルド通過、`eslint` 0 errors / **77 warnings（着手前と同数）**、禁止パターン違反0。**実サーバー + 実 Postgres + ブラウザで 11項目** — 予定表（開く / **「部屋」パネルに切り出した部屋とスタジオ名が出る** / **カレンダー連携ダイアログが開く** / **予定を入れる種別ピッカーが開く**）、ラック図（開く / **前面・背面の切替がある** / **印刷ボタンがある**）、横はみ出し 0px、JSエラー0件。**v2.9.292・293 の検証47項目も再実行して全通過**。⑥**検証で分かったこと**: 予定表は**部屋名を既定では出さない**（「部屋」パネルを開くと出る）。最初これを知らずに「部屋が出ていない」と判定してしまったが、**既存の作りであって分割の影響ではない**。⑦**残り13本**: `ProjectFormPage.tsx` 1,925 / `EquipmentListPage.tsx` 1,880 / `BusinessProjectView.tsx` 1,520 / `manual/content.tsx` 1,455 / `RevenueListPage.tsx` 1,438 ほか。`manual/content.tsx` は**画面の使い方の本文そのもの**なので分割の意味が薄い（対象から外す）。

(v2.9.293 — **1000行を超えるファイルの分割 (3本目)**。改善ロードマップの3つ目の続き。①**`BusinessProjectView.tsx` 2,047 → 1,520行**（−527）。切り出したのは 型 (`types.ts` 59) / 月次請求 (`MonthlyBilling.tsx` 181) / 売上一覧 (`RevenueList.tsx` 347) / 仕入一覧 (`PurchaseList.tsx` 102)。②**切る場所は「読むだけの並び」を選んだ**。この画面はダイアログ2つ（売上明細400行・仕入198行）が最大の塊だが、**中で使う state が25〜40個**あり、props に開くと「渡せるが意味が違う」事故が起きやすい。一方で一覧の並びは**表示 + 数個のハンドラ**なので、props が7〜18個で収まり、間違えても型で止まる。③**型は親の宣言をそのまま写した**。ここが今回いちばん危なかったところで、最初は props の型を推測で書いたら **5件が型エラーで止まった**（`monthEpisodes` は `billing_key` ではなく `episode_code` を持つ / `handleDownloadPdf` は引数が2つで種類（見積書・請求書・検収書）を取る / `handleDeleteMonth` は Promise を返す）。**推測で書くと「渡せてしまうが中身が違う」形になる**ので、必ず元の宣言をコピーする、と各ファイルの冒頭に書いた。④**条件の位置だけ動かした**。月次請求は元が `{monthlyMode && (…)}` で囲まれていたので、中身を部品にして呼び出し側を `{monthlyMode && <MonthlyBilling … />}` にした（出し分けの意味は同じ）。⑤**未使用になった import は型チェックに列挙させた**（`TS6133`）。7件を機械的に消し、残り1件は手で消した。目で探すより確実。⑥**検証**: 全9ワークスペースのビルド通過、`eslint` 0 errors / **77 warnings（着手前と同数）**、禁止パターン違反0。**実サーバー + 実 Postgres + ブラウザで 10項目** — 案件名 / **月次管理の見出しと「GLS-B900-YYMM の請求単位」の説明** / 売上の見出し / **登録した明細の 1,200,000 円が出る** / 仕入の見出し / 仕入追加ボタン / **仕入ダイアログが開く（親に残した部分）** / 横はみ出し 0px / JSエラー0件。**v2.9.291・292 の検証54項目も再実行して全通過**。⑦**残り14本**（着手前と同数だが、3本が 2,000行台から 1,500〜1,900行台に下がった）: `ProjectFormPage.tsx` 1,925 / `EquipmentListPage.tsx` 1,880 / `BusinessProjectView.tsx` 1,520 / `SchedulePage.tsx` 1,515 / `RackLayoutPage.tsx` 1,505 / `manual/content.tsx` 1,455 / `RevenueListPage.tsx` 1,438 ほか。**2,000行超はゼロになった**。)

(v2.9.292 — **1000行を超えるファイルの分割 (1本目・2本目)**。改善ロードマップの3つ目。**挙動を1つも変えない作業**なので、1版で1〜2ファイルに絞った（差分が大きいとレビューできなくなる）。①**`ProjectFormPage.tsx` 2,513 → 1,925行**（−590）。切り出したのは 型と定数 (`types.ts`) / ジャーニー (`JourneyPanel.tsx`) / やり取りの記録 (`ActivityQuickAdd.tsx`) / **ダイアログ7種** (`dialogs.tsx`)。②**ダイアログを1ファイルにまとめた理由**: どれも「開く・閉じる + 1つの操作」だけの小さな部品で、単独で開くことはない（必ず案件フォームから開く）。7ファイルに割ると import が7行増えるだけで探しやすさは上がらない。③**`EquipmentListPage.tsx` 2,026 → 1,880行**（−146）。切り出したのは**印刷まわり一式**（列の定義・印刷設定ダイアログ・印刷用の表）。印刷は台帳の中で**独立した機能**で、一覧の絞り込みや編集と state を共有していない = 切れ目がきれい。④**state は親に残した**。案件フォームのスタジオ日程は約30個の state を使うが、**保存処理が同じ state を読んでいる**ので、子に移すと挙動が変わる。props で渡す形にすると props が30個になるので、この版では手を付けず次回に回した。⑤**「行数を減らすこと」が目的ではない**とファイル冒頭に書いた。2,513行の1ファイルだと「この定数はどこで使われているか」を追うのにファイル内検索しか手が無く、変更の影響範囲が読めない。⑥**中身は動かしていない**。移動 + `export` + props 化だけで、JSX は1行も書き換えていない。`handlePrint` のような関数も**そのまま親に残して props で渡した**（中で `print-landscape` クラスを付けて150ms 待つ処理があり、書き直すと印刷の向きが変わる）。⑦**検証で分かったこと**: 「やり取りを記録」というボタンが**2つある**（案件の中で書ける方と、警告バナーから営業活動ページへ飛ぶ方）。後者は `ActivityQuickAdd` のコメント「営業活動ページに飛ばさない — 飛ばすと戻ってこないので」と食い違うが、**既存の挙動なので今回は直していない**（挙動を変えない版なので、直すなら別の版で）。⑧**検証**: 全9ワークスペースのビルド通過、`eslint` 0 errors / **77 warnings（着手前と同数）**、禁止パターン違反0。**実サーバー + 実 Postgres + ブラウザで 21項目** — 案件フォーム（案件名が出る / **ジャーニーの6段が出る** / 次の一手ボタンが1つ / **ステージ変更の確認に「見積提案」から「口頭決定」と出る** / キャンセルで閉じる / 失注ダイアログが出て理由が入れられる / **やり取りをその場で書ける（画面を離れない）**）、機材台帳（**印刷設定が開く** / 列が選べる / 用紙方向 / 件数 / 印刷実行）、横はみ出し0px、JSエラー0件。**v2.9.290・291 の検証51項目も再実行して全通過**。⑨**残り11本**: `BusinessProjectView.tsx` 2,047 / `SchedulePage.tsx` 1,515 / `RackLayoutPage.tsx` 1,505 / `manual/content.tsx` 1,455 / `RevenueListPage.tsx` 1,438 ほか。`ProjectFormPage`（スタジオ日程）と `EquipmentListPage`（機材の登録・一括編集ダイアログ）も**まだ1,880〜1,925行**あるので続きがある。)

(v2.9.291 — **読み込み中・空・エラー・権限なしの表示を部品に寄せた（lint で止める）**。改善ロードマップの2つ目。①**着手して分かったのは「部品が2つあった」こと**。`EmptyState` が `shared/dashboard/` と `shared/states/` の**2か所**にあり、dashboard 側は既定タイトルが **「データがありません」**（§2.4 が禁じている言い方そのもの）だった。24ファイルがそちらを使っていたので、まず**どちらを使うかを1つに決めて**互換ラッパーを消した。**全24ファイルが実際には title を渡していた**ことを機械的に確かめてから消したので、表示は変わらない。②**「1秒未満はスピナーを出さない」を実装で守らせた**。ページ全体を差し替える読み込みが 39 か所あり、そのうち 27 か所がその場書きのスピナーだった。ログイン判定中は `<Delayed>` で包むだけ（骨格が分からないので骨組みは出せない）、画面の中身は `<Delayed><SkeletonRows /></Delayed>` にして**骨格は出したまま中身だけ骨組み**にした。③**「データがありません」で終わらせない**。空の表示 185 か所を性質で分け、**一覧の代わりに縦の場所を取るブロック 32 か所**を `EmptyState`（何が無いか + 次にやること）にした。④**全部を機械的に置き換えなかった**のがこの回の判断。日常業務のホームにある「待たせているものはありません」は**良い知らせ**であって空の状態ではないし、検索欄の注記や高さ40の選択リストの中に枠付きパネルを入れると**読みにくくなる**。そういう箇所は1行のまま「何が無いか + 次にどうするか」を書き足すに留めた。⑤**権限が無いときの表示を5か所直した**。「アクセス権限がありません」だけでは誰に何を頼めばよいか分からないので、`NoPermissionPanel` で**必要な権限を名前で出す**形にした（機材のケーブル・コネクタ・機材一覧、DBバックアップ、利用者一覧）。⑥**技術的な中身を画面から消した**。機材一覧はサーバーが返す `debug` の JSON を**そのまま画面に貼っていた**ので、console に移した（§2.5）。エラーは `ErrorPanel` に寄せ、**HTTPコードを画面に出さず**原因1文 + 次の一手1文にした。⑦**検査を2つ足した**（`empty-by-hand` / `loading-by-hand`）。最初に書いた `empty-by-hand` は**広すぎて、インラインで正しい12か所まで拾った** — そこで「`text-center` を持つブロック」に絞った（カードの中の1行や検索欄の注記は対象外）。**ルールは「入れたら止まる」ことを自分で確かめた**（わざと違反を書いて2つとも落ちることを確認）。逃げ道 `ui-tokens-ok` を使ったのは**1か所だけ**（高さ40の選択リスト。理由も同じ行に書いた）。⑧**検証**: 全9ワークスペースのビルド通過、`eslint` 0 errors / **77 warnings（着手前と同数）**、禁止パターン違反0（683ファイル）。**共通部品を使うページが 117中44 → 117中63**。**実サーバー + 実 Postgres + ブラウザで 16項目** — 空（何が無いか出る / 次にやることが出る / **「データがありません」で終わっていない**）、権限なし（**白紙でなく「機材管理」と権限名が出る** / **403 や Forbidden を画面に出さない**）、読み込み（**300ms で返る取得では骨組みを出さない** / **3秒かかる取得では出る**）、エラー（何をしようとして失敗したか / 原因が日本語 / 次の一手 / **HTTPコードを出さない** / やり直せる）、横はみ出し 0px、JSエラー0件。**v2.9.289・290 の検証 75項目も再実行して全通過**（壊していないことの確認）。⑨**検証スクリプト側のつまずきを3つ記録**（どれも実装の不具合ではない）: ページURLと API のパスが同じ形だったため**モックがページ自体に当たって画面が JSON になった** / Playwright のグロブが当たらず正規表現にした / **5xx は最大2回リトライする設定（1s・2s）**なので待ち時間が足りずエラー表示を見逃していた。⑩**次**（ロードマップ3つ目）: 1000行を超えるファイル13本の分割（最大 `ProjectFormPage.tsx` 2,513行 / `BusinessProjectView.tsx` 2,045行 / `EquipmentListPage.tsx` 2,018行）。**1版1〜2ファイル**に分ける（挙動を変えない作業なので、差分が大きいとレビューできなくなる）。)

(v2.9.290 — **`alert()` / `confirm()` を 129 か所すべてやめ、画面の中の部品にした（lint で止める）**。改善ロードマップの1つ目。①**まず土台が3つ足りなかった**。(a) **確認ダイアログの部品が無かった**。(b) 通知のラッパー（`notifySuccess` 等）は **7アプリ中 Qシートだけ**にあり、他6アプリは `alert()` を直に呼んでいた。(c) お知らせ帯 `<NoticeBar />` は**ページごとに8か所**手で置いていたので、**置いていないページ（大半）では `notifyError` を呼んでもどこにも出なかった** = 「保存に失敗した」を人に伝えられていなかった。②**なぜブラウザ標準をやめるか**を4点に整理して部品のコメントに書いた: 画面のデザインの外側に出る / **押すまで他の操作が一切できない**（確認の裏で金額や日付を見返せない。本番中・締め作業中に効く）/ **何が起きるかを1行しか書けない**（一緒に消えるものを伝えられない）/ 危ない操作と普通の操作が同じ見た目になる。③**`window.confirm()` と同じ形で書けるようにした**（`await confirmAction({...})` が true/false を返す）ので、呼ぶ側は1行の置き換えで済み、**分岐の形を書き換えずに移行できた**（書き換えると条件を反転させる事故が出る）。④**取り消せない操作は `tone: 'danger'`** にして赤で強調し、**最初から「やめる」にフォーカスを当てた**（開いた瞬間に Enter を押しても実行されない = 勢いで通してしまうのを防ぐ）。**外側を押しても閉じない**（誤って消さない）。Esc は「やめる」。⑤**メッセージを title と description に割った**。`confirm("この売上を削除しますか？この操作は元に戻せません。")` のような1行を、見出しと「一緒に何が起きるか」に分けた（全角「？」と改行で割る）。⑥**`alert()` は中身で3つに振り分けた** — 失敗・エラー系は `notifyError`、「〜しました」「完了」は `notifySuccess`、それ以外は `notifyInfo`。**変数を渡していた4か所は目で見て直した**（`catch` の中で「失敗しました」を組み立てていたので `notifyError` が正しい）。ポップアップブロックなど「操作は失敗していないが先に進めない」ものは `notifyWarning` にし、**何をすればよいかを description に書いた**。⑦**置き場所を AppShell ではなくアプリのルート直下にした** — ここが今回いちばん危なかったところ。最初は共通の AppShell（ヘッダーとレール）に1組置いたが、**Qシートの OnAir・ランダウン・プロンプターはAppShell を通らない全画面ページ**なので、そのままだと**本番中に「停止してリセット」を押しても確認が出せず（`confirmAction` が false を返して）黙って何も起きない**。ブラウザ検証で気づいて置き場所を変えた。部品側も**二重に置いても1つしか出ない**ようにして、置き場所を足しても事故らない形にした。⑧**`<ConfirmHost />` が無い画面では `confirmAction` は false を返す**（勝手に実行しない）。逆向き（置き忘れたら実行する）にすると、置き忘れが一番危ない事故になる。⑨**部品を作るだけでは戻るので lint で止めた**。`scripts/check-ui-tokens.mjs` に `browser-dialog` ルールを足し、`alert(` / `confirm(` を書いたら `npm run lint` で落ちる（**理由も一緒に出す**）。⑩**置き換えは機械的にやり、`await` の付け忘れは型チェックに検出させた**。`await` を非 async 関数に入れると TS がエラーにするので、**85 か所の「async を足すべき関数」を型チェックが全部列挙してくれる** — 目で追うより確実。⑪**検証中に自分のスクリプトの誤りを3つ見つけて直した**（どれも型チェックとブラウザ検証で捕まえた）: (a) メッセージの分割で ASCII の `?` も見ていたため、**`cat?.name` のオプショナルチェーンでテンプレートリテラルを真っ二つにして構文を壊していた**（全角「？」だけを見て、`${...}` の中は見ないようにした）。(b) import の追加位置が**複数行 import の途中**に入っていた。(c) `import` の有無を見る正規表現が **`importance` という変数に当たっていた**。⑫**v2.9.289 で自分が入れた不具合も1件直した**: ルートの `typecheck` スクリプトが `concurrently` の**ラベル順とコマンド順で食い違っていた**ため、**ログの見出しが別アプリのファイルを指していた**（`[equipment]` の枠で Qシートを走らせていた）。CI のログを読む人が確実に誤解するので直した。⑬**既存の不具合も1件直した**: OnAir の Esc（台本へ戻る）が `if (confirmStop() && id)` の形だったため、`confirmStop` が非同期になると **Promise を truthy と見て「やめる」を押しても画面を離れてしまう**。型チェックが `TS2801` で教えてくれた。⑭**検証**: 全9ワークスペースのビルド通過、`eslint` 0 errors / **77 warnings（着手前と同数）**、禁止パターン違反0（683ファイル）、**残った `alert(`/`confirm(` は 0 か所**（置き換え 129 = 確認89 + 通知40）。**実サーバー + 実 Postgres + ブラウザで 61項目** — **確認ダイアログ 17項目**（`role="alertdialog"` で出る / 何をするか書いてある / 実行ボタンが「削除する」/ **取り消せない操作は最初から「やめる」にフォーカス** / 44px 2つ / **「やめる」で本当に消えない** / **「削除する」で本当に消える** / Esc で閉じて消えない / **ブラウザ標準ダイアログが1件も出ない** / 横はみ出し 0px / JSエラー0件）。**お知らせ帯 18項目**（PC と スマホ 375px の両方で 出る / 本文が出る / **1本だけ** / **4秒たっても消えない = トーストではない** / 閉じると消える）。**OnAir（全画面ページ）9項目** — **確認が出る**（置き場所を直す前は何も起きなかった）/ 「やめる」で計時が止まらない / 「リセットする」で止まる / **全画面ページでもお知らせ帯が出る**。**リアルタイムCG・Qシートの同期 17項目は v2.9.289 と同じ結果で通過**（壊していないことの確認）。⑮**次**（ロードマップ2つ目）: 読み込み中・空・エラーの表示を部品に寄せる（**117ページ中44ページ**しか共通部品を使っていない。「読み込み中」の直書き29か所、「〜がありません」の直書き85か所）。)

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
