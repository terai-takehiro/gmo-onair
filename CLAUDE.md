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
v4.1.3 — **「決めても片づかない」を3画面で直し、案件台帳の壊れた見た目とレビューの積み残しを片づけた**（PR 9本ぶん。**1件ずつの詳細は下のアーカイブに全文あります**）。①**案件作成の受付が「決めても片づかない」のを直しました** — 押した先と違う集合を数えていたバッジの件数（実測14→レール7）・`LIMIT` で頭打ちになっていた件数（未確認のAI起票124件→50に丸まっていた）・「見送りにする」を押してもカードが1つも動かなかった穴（ステージの条件が1つも無かった）を塞ぎ、AIが起こす案件は必ずネタ段階に倒しました。止まっていた教師データ（無修正で採用された回）も動くようになります。②**案件分類が「詳細では登録済み・案件を直すでは未登録」に見える不具合を直しました** — Excel取込とシードだけが通っていなかった書き込み口を塞ぎ、すでに空で入ってしまった案件をマイグレーション（193）で埋め戻します。あわせて、その場で直したあと画面が古いまま出ていた鍵の落とし忘れも直しました。③**機材台帳が重かったのを直しました** — 開くのに30.7秒（うち28.2秒は画面が固まったまま）だったのを2.3秒に。原因は見えない位置にも同じ行を3回描いていたことと、3,800行を毎回全部作っていたことで、見えている行だけ描く形にしました。④**案件台帳の画面余白が無く、見出しと表が左メニューに貼り付いていたのを直しました。** ⑤**0件のときの「絞り込みをすべて外す」ボタンが、PCで寸法の段から外れていたのを直しました**（38.25px→40px。スマホは変えていません）。⑥**リリースノートの下書きの門と、要約が全文を消す穴を塞ぎました** — 分割機能の実装に7件のレビュー指摘が続いたため、対症療法をやめ生成側に「1行から version・title・description を取り出す唯一の入口」を新設しました。⑦⚠️ **この版は、Codexのレビューが1件も付かないままマージしたPRを含みます**（#167・#172・#173。25分〜38秒しか開いていませんでした）。「指摘なし」と「まだ見ていない」は画面上で見分けが付かないため、[docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md) に記録し、PRを見張る手順（`.claude/skills/pr-watch`）を新設しました。⑧**検証**: `npm run test` 1,134項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings、`build:all` ＋ `check:frozen` OK。主な直しは実ブラウザ・実Postgresでの実測と反証を添えています。⑨**DBマイグレーションは1件**（193・案件分類の埋め戻し）。`shared/src/` を触ったのは⑤のボタンの高さの直し1ファイルだけで、`build:all` ＋ `check:frozen` で凍結4アプリのCSSが基準どおりであることを確認済みです。

v4.1.2 — **読めない・崩れている画面をまとめて直し、案件の実施日をカレンダーと一致させた**（PR 7 本ぶん。**1件ずつの詳細は下のアーカイブに全文あります**）。①**「そこにあるのに読めない・見えない」ものを4つ直しました** — 黄色い注意書きの文字が**白**（実測 **1.07:1**。同じ形が**6画面7か所**）／機材台帳の「種別」が隣の列に重なり `RACK1` が **`ACK1`** に見えていた（列 72px に対し中身は最長 112px・16 通り中 10 通りが溢れる）／プロジェクト管理の見積タブで `¥` だけが左端に取り残され、**1つの金額が 1041px** を占めていた（正しくは 67px）／案件台帳でその場で直すときプルダウンが開けなかった。②⚠️ **案件の「実施日」がカレンダーと一致していませんでした。** 直す画面は「予約ができたあとは**登録済みの予約が唯一のもと**」と決めて日程の欄を隠しているのに、**書き戻す道がどこにも無く**、実施日が入るのは**案件を作るときの1回だけ**でした（カレンダーを直した瞬間から必ず古い）。**本番・リハーサル・仮押さえの3種だけ**を数えて引き直します — 相談や内覧を数えると「3か月前の打合せ」で開始が3か月前に伸び、しかも画面から理由が読めません。**予約が1件も無くなったときは触りません**（消しただけで実施日が消えると、取込や案件作成で入れた日付が黙って失われる）。③⚠️ **その書き戻しは、足した回には利用者から見て直っていませんでした**（リリース前の点検で発見・**P1**）。サーバーは実施日を引き直すのに**画面が読み直しておらず**、`staleTime` 60秒 ＋ focus では読み直さない設定なので、**予約を動かして案件詳細に戻ると最大60秒は古い実施日が出ます**。落とす鍵を1か所（`client/src/lib/bookingQueries.ts`）に集めました。⚠️ **エラーは出ず60秒待てば直るので、誰も報告しません。** **6か所目の漏れは検査を書いて初めて見つかりました。** ④**同じ案件を2人が同時に触ると、実施日が古い期間で上書きされる**のも直しました（案件の行を**先に掴んでから数える**）。⚠️ **消えたことは画面のどこにも出ません。** ⑤**タブレットの幅（640〜1023px）で機材名が消えていました** — 列が出てくる幅と1行に詰め始める幅が**同じ**なのが原因で、実ブラウザで **6px**。算数を機材管理の全行に当て直したら、**備品の台帳は 640px でも 768px でも行が横にはみ出して**おり、指摘された行より重いものでした。⚠️ **1024px 以上の見え方は1ピクセルも変えていません**（変えたのは狭い側だけ・列は1つも消していない）。**375px と 1280px では正常**なので、その2つで確かめる限り一度も見えない類の壊れ方です。⑥**「検査が OK と言うのに画面では読めない」穴を3つ塞ぎました** — `.tsx` しか見ていない（クラス名を `.ts` の地図に置く形が10ファイル以上ある）／条件つき・半透明の塗りを「塗り」と数える／**逆に締めすぎて正しい書き方を止めていた**（`bg-warning/100` は `bg-warning` と同じ不透明なのに弾き、`npm run lint` に入っているので**その書き方をした人は何も進められない**）。⑦⚠️ **この版は、Codex のレビューが1件も付かないままマージした PR を含みます**（#165・**1時間28分開いていて0件**）。**画面上は「指摘なし」と見分けが付きません**ので、[docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md) に記録しました（**同じ形は #154・#159 に続いて3本目**）。⑧**検証**: `npm run test` 1,039項目、`typecheck:all` exit 0、`lint` 0 errors / 63 warnings、`build:all` ＋ `check:frozen` OK。実ブラウザと実 Postgres で測った値は各項目のとおりで、**主な直しには反証（戻すと落ちること）を付けています**。⑨**DB マイグレーションはこの版に1件もありません。`shared/src/` も1ファイルも触っていません**（凍結4アプリの CSS は不変）。

v4.1.1 — **版の履歴が v4.1.0 を別の名前で呼んでいたのと、版の全文が前置きの文の途中に入っていたのを直した**（Codex のレビュー #155。P2 2件。**どちらも私が v4.1.0 のリリースで入れた穴**）。①⚠️ **画面の「バージョン履歴」だけが v4.1.0 を「グループ内かグループ外かを…」と呼んでいました。** v4.1.0 は PR 28 本ぶんなので、**要約を `CLAUDE.md` と `README.md` に・全文をアーカイブに**置いています。同じ版が2か所にあるので**長いほう（＝全文）を採る**ようにしたのですが、**まるごと差し替えていた**ので見出しまでアーカイブ側になり、それは**28 本のうち1本目の見出し**でした。つまり**同じ版が資料と画面で違う名前**になります（読んだ人は、どちらかが古いのだと思います）。**本文だけを取り替え、見出しは要約のものを残します**。②⚠️ **全文を前置きの文の途中に差し込んでいました。**「…この下の『## 過去のバージョン』直下へ移してください」という**1文が 53,000 字の版で真っ二つ**になっていました。⚠️ **それでも動いていたのは、見出しを素の `indexOf` で探していたから**です — 前置きの中の**引用**に当たっていました。つまり**見出しの探し方を正しく直した瞬間に、その版が画面から消えます**（黙って消えるので誰も気づけません）。**見出しは行頭で探し**、**見出しより前に版の行があれば止めます**。③**この2つは「動いているので気づけない」形でした。** 履歴の見出しは資料と突き合わせないと分からず、置き場所の間違いは**正しく直すまで表に出ません**。④⚠️ **この PR のレビューでもう1件指摘され、直しました**（Codex・P2）。**改行を `\n` と決め打ち**にしていたので、Windows で `core.autocrlf=true` のまま clone した人（`.md` が `\r\n` になる）は**どの見出しにも当たらず**、`predev` / `prebuild` が毎回「見出しが見つかりません」で落ちます — **その環境の人だけ、何も始められません**。⚠️ **この環境（Linux・LF）では気づけない**ので、`shared/tests/versionHistoryHeading.test.ts` に 8 項目で固定しました（**反証: `\n` 決め打ちの書き方は CRLF で -1 を返す**）。`.gitattributes` は `docs/version-history.md` を `merge=union` にしているだけで**改行は固定していません**ので、探すほうを直しています。⑤**検証**: 生成し直して **455 件・v4.1.0 は1件・重複 0・見出しは要約のもの・本文は全文（53,051 字）・`isCurrent` も保つ**。**反証: ①見出しをまるごと差し替える版に戻すと「グループ内かグループ外かを…」に戻る ②版を前置きの中に置くと「見出しより前に版の行があります」で止まる**（どちらも実測）。`npm run test` 964項目、`typecheck` exit 0、`lint` 0 errors / 63 warnings。⑥**DB 変更なし。アプリのコードは触っていません**（リリースの道具2本とアーカイブの並びだけ）。


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
