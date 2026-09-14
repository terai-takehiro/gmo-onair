# GMO ONAiR - プロジェクトメモリ

この文書は Claude が毎ターン読む。**全体に効く決めごとだけ**を置く。
アプリ固有のことは各ディレクトリの `CLAUDE.md`、手順の詳細は `docs/`（目次は [docs/README.md](docs/README.md)）に置く。
同じことを2か所に書かない（必ず片方が古くなる）。

## プロジェクト概要
GMO ONAiR = GMOグローバルスタジオの制作管理プラットフォーム（会社OS）の総称。
複数の「ブロックアプリ」を1つのモノレポ・1つのサーバーで束ねる。特定の機能を指す名称ではない。
案件の**管理番号**（内部名 GLS番号。DB 列や発番操作の名前は `gls` のまま）を中核に全アプリのデータが紐づく。

### ブロックアプリ一覧

| アプリ | ディレクトリ | ベースパス | ポート | 状態 | 概要 |
|---|---|---|---|---|---|
| 案件管理・財務管理・カレンダー・設定・プロジェクト管理 | [`client/`](client/CLAUDE.md) | `/` | 5173 | v4 対象 | 案件・見積・売上・仕入・損益・予定・権限。プロジェクト管理（GLS-B）は `/gpm` |
| 日常業務 | [`client-daily/`](client-daily/CLAUDE.md) | `/daily/` | 5180 | v4 対象 | 週報・ニュース・内覧会・受領書類・セキュリティカード・タスク |
| 機材管理 | [`client-equipment/`](client-equipment/CLAUDE.md) | `/equipment/` | 5175 | v4 対象 | 機材台帳・ラック図・貸出・棚卸し・メンテナンス |
| 制作技術支援（中に Qシート） | [`client-techops/`](client-techops/CLAUDE.md) | `/techops/`（旧 `/qsheet/` は転送で生存） | 5174 | **凍結解除中** | 台本作成・本番進行（進行／ランダウン／プロンプター／音声サポート）・計時・視聴者・テロップCG・レンタル機材検索。`permissionModule`・DB・サーバーの contexts は `qsheet` のまま |
| 計時・視聴者 | [`client-live/`](client-live/CLAUDE.md) | `/live/` | 5178 | v4 対象 | 制作技術支援のミニアプリ。アプリ一覧には出ない。**表示画面 `/live/display/` だけは見た目を変えない例外** |
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | `/awards/`（到達不可） | — | **廃止** | 2026-09-06 に廃止。後継は制作技術支援＞テロップCG（`client-techops/src/pages/graphics/`）。コードは参照用に残すだけで、配信・API・ビルド対象から外してある |
| 共通ライブラリ | [`shared/`](shared/CLAUDE.md) | — | — | v4 対象 | トークン・UI 部品・共通シェル。**触ると全アプリに効く** |

- アプリ登録（名前・入口・権限モジュール・廃止の印）の唯一の正は `shared/src/client/apps.ts`
- 「凍結」「凍結解除中」「廃止」の定義は [docs/v4-plan.md](docs/v4-plan.md) の「用語」
- 外部リンク（別 VPS・別タブ）: インタラクティブ https://interactive.gmo-onair.jp/ ／ 翻訳 https://gmo-translate.jp/

## Claude の応答言語ポリシー
- 作業中（ツール呼び出しの説明・思考過程）は英語で処理してよい
- **チャットでユーザーに返す最後の返信は、必ず簡潔な日本語**（処理の垂れ流しではなく、結論・状態・次のアクションが分かる短い要約）

## 技術構成
- **フロントエンド**: React 18 + Vite 6 + TypeScript + TailwindCSS 3 + shadcn/ui
- **バックエンド**: Express + PostgreSQL 16（`pg`）。**1つのサーバーが配信中5アプリの静的ファイルを配信する単一イメージ構成**
- **モノレポ**: npm workspaces（client, client-daily, client-equipment, client-techops, client-live, client-awards, server, shared）
- **リアルタイム**: Socket.IO（`/techops` 名前空間で OnAir↔ランダウン同期。旧 `/qsheet` はブリッジで生存。ほか graphics / quiz / liveops）
- **デプロイ先**: CoNoHa VPS（Docker Compose + PostgreSQL + Nginx）。本番と検証を同じ VPS で並走

### よく使うコマンド
```bash
npm run verify:up      # 検証用 Postgres を立てる（約4秒・ポート5433・本番とは完全分離）
npm run dev            # 既定3アプリ + server（全アプリは dev:all）
npm run typecheck      # 既定3アプリ + server（CI は typecheck:all = 廃止アプリを除く全ワークスペース）
npm run lint           # eslint ＋ 各種検査（changelog / トークン / リンク / migration 番号 ほか）
npm run test           # shared の Vitest ＋ server のレビュー試験（CI が回す。手元の gate にも必ず入れる）
npm run build:changed  # 変更したワークスペースだけビルド（全部だと約2分）
npm run verify:ui      # 実ブラウザで書体・桁揃い・横はみ出しを実測
npm run check:version  # バージョン表記の整合（3か所）
```
`build` / `typecheck` / `dev` の既定が3アプリなのは**手元の速さのため**。本番は Dockerfile が廃止アプリを除く全アプリをビルドする。

### どこに何が書いてあるか
| 知りたいこと | 読む場所 |
| --- | --- |
| **docs/ 全体の目次** | [docs/README.md](docs/README.md) |
| 環境構築から PR まで | [CONTRIBUTING.md](CONTRIBUTING.md) |
| ブランチ・PR・リリース手順 | [docs/branching.md](docs/branching.md) |
| デプロイの仕組み（GHCR・キャッシュ・戻し方） | [docs/deploy-pipeline.md](docs/deploy-pipeline.md) |
| VPS の構成・運用・DB バックアップ | [docs/ops/vps-setup.md](docs/ops/vps-setup.md)・[docs/ops/db-backup-restore.md](docs/ops/db-backup-restore.md) |
| v4 の開発計画・スコープ・用語 | [docs/v4-plan.md](docs/v4-plan.md) |
| **v4 でどこまで出来たか（サイトツリー）** | [docs/v4-progress.md](docs/v4-progress.md) — `node scripts/v4-progress.mjs --write` の**生成物**。v4 の PR では毎回作り直して本文に貼る |
| 全画面をネイティブ級にする計画（2026-08〜） | [docs/v4-native-ui-plan.md](docs/v4-native-ui-plan.md) |
| **2026年10月の事業再編**（社名変更・計上会社の2社化・GLS→SCS/GSS/GMO の改番） | [docs/reorg-2026-10-plan.md](docs/reorg-2026-10-plan.md) — 設計の正。冒頭の状態欄に「実装済み」と「判断待ち（§9）」の区別がある |
| v4 の画面ごとの仕様（モックが正） | [docs/design/v4/README.md](docs/design/v4/README.md) |
| 用語の決めごと（画面に出す言葉） | [docs/wording.md](docs/wording.md) |
| どの仕事にどのモデルを使うか | [docs/ai-models.md](docs/ai-models.md) — 段は light / heavy の2つだけ。基準は「間違いに気づけるか」で費用ではない |
| MCP のツール一覧 | [docs/mcp-server.md](docs/mcp-server.md) |
| レビューの台帳・計画・記録 | [docs/reviews/README.md](docs/reviews/README.md) |
| 版ごとの変更（過去全件） | [docs/version-history.md](docs/version-history.md) |
| エンジニアでない人向けの説明 | [docs/guide/README.md](docs/guide/README.md) |

## 現在のバージョン
v4.6.16 — **会場図面で「追加／並べ方／数量」タブを切り替えるたびに盤（図面）が縮んで見える不具合を直した**（利用者からのご指摘。v4.6.15 で対応したはずの「タブ切替でレイアウトが揺れる」不具合が残っていた）。①原因は共通シェル（`shared/src/client/shell/AppShell.tsx`）の画面切替アニメーション用の包み `<div className="v4-screen-in">` に高さの指定が無かったこと。`<main>` はスクロール領域として確定した高さを持つが、その直下の `v4-screen-in` が `height:auto`（中身に合わせる）のままだったため、`<PageShell className="h-full">` の `h-full`（100%）がここで「定まった高さ」を失い `auto` に落ち、盤を含む3列グリッドの高さが**いま開いているタブの中身の自然な高さ**で決まってしまっていた。「追加」タブ（品目の一覧が長い）では高さが伸びて盤全体が見え、「並べ方」「数量」（中身が短い）に切り替えると盤ごと縮み、SVG自体の寸法（ズームで決まる・コンテナの大きさとは無関係）は変わらないため、縮んだ表示領域からはみ出した右側・下側が見えなくなっていた。②以前の対応（`min-w-0`）は**幅方向**の同型の穴（列の中身が固定幅より広い最小幅を持つと列自体が広がる）を塞いだだけで、この**高さ方向**の穴は別物だったため直っていなかった。③`v4-screen-in` に `h-full` を足し、`main` の確定した高さをそのまま下流へ渡すようにした。この div には見た目（背景色・枠線）が無いため、全高を使わない他の画面（多くの一覧・フォーム画面）の見え方は変わらない——中身が短ければ余白が増えるだけ、長ければ従来どおり `main` 側でスクロールする。④`shared/` の変更のため、レンタル機材検索の3画面（`RentalSearchPage`・`RentalReservationsPage`・`RentalMailPage`。同じ `PageShell className="h-full"` パターンを使用）にも同じ穴があったはずで、副次的に直った。検証: 実ブラウザ（Playwright・検証用 Postgres・実サーバー）で会場図面編集画面を開き、「追加」「並べ方」「数量」を行き来しながら盤・左右パネルの `getBoundingClientRect` を測定——修正前は 1098.5px → 893.2px → 438.1px と縮み、修正後は全タブで 684px に固定されることを確認。`npx tsc -b client`・`npx tsc -b client-equipment`・`npx tsc -b client-techops`・`npx tsc -b client-live`・`npx tsc -b client-daily`・`npx tsc --noEmit -w server`・`npm run lint`。**用賀 26F/27F の会場図面の下敷き画像を、利用者が用意した清書版に差し替えた**（文字が判読できない旧画像からの差し替え依頼）。①`client-techops/public/venue/floor-26f.png`・`floor-27f.png` を 420×584 → 1187×1650 に更新。原図（新PDF）のグリッド線の PDF 座標を旧画像と突き合わせたところ、既存の校正（`qsheet_venue_floors.calibration`）と一致したため校正値は変更せず、旧下敷きと同じ mm 窓（`originMm`）のまま高解像度で再切り出しした。②解像度が変わったため `underlay`（`widthPx`/`heightPx`/`pxPerMmX`/`pxPerMmY`）を migration 300 で更新（299 は `ON CONFLICT DO NOTHING` のため、既に流れた環境には効かない＝ UPDATE 文にした）。③LEDウォール・トラス脚10本・ELV13・らせん階段など既存の固定物（fixtures）の bboxMm を新画像に重ねて位置が一致することを確認（Playwright・検証用 Postgres で会場図面編集画面を実際に開いて確認）。 **PR #692のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#692（会場図面の道具の帯の用語・アイコン修正）は Code Review・Security Review とも初回コミットで完走し、findings は無かった（レビュースレッド0件）。表に移す未対応の指摘は無いが、CIとレビューが両方通ったことを記録として残すため `docs/reviews/codex-findings-v4.md`「一覧（PR の新しい順）」に記録した。検証: `node scripts/check-md-links.mjs`。 **PR #694のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#694（会場図面の不具合9件の修正）はCode Reviewがpushのたびに13回中12回反応し、全15件（P1×1・P2×14）の指摘が付いた。P1は削除確認中に自動保存の通信が飛んでいると削除後も再送タイマーが生き残り消えた図面へPUTを送り続けるもの、P2×14は「グループはメンバー2人以上でしか存在せず、メンバー構成が変わるたびに`arrange`を消す」という不変条件を複製・部分再グループ化・個別移動・削除・Ctrl+Gの各経路に一貫させる過程で連鎖的に見つかったもの。全件を本PR内で修正・返信・スレッド解決した。表に移す未対応の指摘は無い。ただし最終コミットにはCode ReviewがCodexのusage limitsで実行されず、Security Reviewも最初のコミットに固定されたまま以後14回のpushには一度も再実行されなかった（既知の同型パターン）。検証: `node scripts/check-md-links.mjs`・`npm run lint`。 **PR #695のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#695（#694のレビュー棚卸し記録）はCode ReviewがCodexのusage limitsで一度も実行されず、Security Reviewは完走しfindingsは無かった（レビュースレッドも0件）。表に移す未対応の指摘は無いが、レビューが1件も届いていないため「指摘なし」と区別できるよう記録した。検証: `node scripts/check-md-links.mjs`・`npm run lint`。 **PR #693のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#693（#692の棚卸し記録）は初回コミットでCode Reviewが1件（P2）を指摘した——本PR自身のコミットが、#692自身の未リリースのリリースノート下書きをレビュー棚卸しメモで上書きしてしまっていた。元の下書きを復元し、棚卸しメモを別ファイルに分離して修正・返信・スレッド解決まで完了した。同じ枝名を2つの別PRで再利用したことが根っこにあり、次に同じ枝を再利用するときは`docs/changelog.d/`に同名ファイルが無いか先に確認する、という学びを記録した。表に移す未対応の指摘は無い。検証: `node scripts/check-md-links.mjs`・`npm run lint`。 **PR #693・#696・#697のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#697（#695の棚卸し記録）・#696（release: v4.6.15）は、作成直後にGitHub Actions側のインフラ障害（checks・buildとも実行時間0msで即時失敗。mainでの手動起動でも再現を確認）でCIが赤くなったが、インフラ復旧後の再実行で自然に緑になった（コード側の修正は不要）。両PRともCode ReviewはCodexのusage limitsで一度も実行されず、Security Reviewは完走しfindingsは無かった。#693（別セッションが#692の棚卸しを記録しようとしたPR）はCode Reviewが1件（P2）の指摘を返した——#692自身の未リリースのリリースノート下書きを棚卸しメモで上書きしてしまうところだった。本PRのbaseが#694・#695のマージで進んだことで本文書「一覧」の挿入位置がコンフリクトし、長時間放置されていたのを本セッションがmainを取り込んで解消し、あわせて上記のCode Review指摘（下書きの復元・棚卸しメモの新規ファイル分離）も同じコミットで対応した。3PRとも表に移す未対応の指摘は無い。検証: `node scripts/check-md-links.mjs`・`npm run lint`。 **PR #699のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#699（PR #693・#696・#697の棚卸し記録＋会場図面タブ切替の不具合修正・26F/27F下敷き画像差し替え）はCode Reviewが4コミット時点（`4f4fb6a`・`da29fee`・`2d746a1`・`f799abe`）で完走し、全4件（P1×1・P2×3）の指摘が付いた——下敷き画像のキャッシュバスト漏れ（P1）・レビュー0件エントリの節違い（P2）・お知らせ帯とラッパーの高さの重なり（P2）・設計書の旧数値残り（P2）。いずれも本PR内で修正・返信・スレッド解決まで完了しており、表に移す未対応の指摘は無い。Security Reviewは初回コミットで完走し findings 無し。詳細は `docs/reviews/codex-findings-v4.md`「一覧」に記録した。検証: `node scripts/check-md-links.mjs`。 **PR #698のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#698（#693の棚卸し記録）はCode Review・Security Reviewとも初回コミットで完走し、findings は無かった（レビュースレッド0件）。表に移す未対応の指摘は無いが、記録として `docs/reviews/codex-findings-v4.md`「一覧（PR の新しい順）」に記録した。検証: `node scripts/check-md-links.mjs`。 **PR #699の棚卸し記録の数え違い（Codexレビュー指摘2件）を直した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。直前のPR #700で記録した#699の棚卸しに、Code Reviewの完走回数（「3回」→実際は`4f4fb6a`・`da29fee`・`2d746a1`・`f799abe`の4コミット時点で完走）と、マージ後のファイル数（「9ファイル」→実際は11ファイル。最終コミット`8616a15`で設計書2件が追加されていた）の数え違いがあるとのCodexレビュー指摘（P2×2）を受け、git logとdiffで数え直して`docs/reviews/codex-findings-v4.md`と`docs/changelog.d/claude-review-debt-tally-699.md`を訂正した。検証: `node scripts/check-md-links.mjs`。

v4.6.15 — **会場図面の用語・不具合をあわせて10件直した**。道具の帯の用語（「すいつき」「方眼」「ものさし」→「スナップ」「グリッド」「ルーラー」）に加え、利用者から報告のあった6件（用語・タブ切替時のレイアウト揺れ・クレーンのラインアップ・「並べ方」プレビューの縮小消失・グループが1脚単位でしか動かない）と自己点検で見つけた3件（複製・回転つまみ・Ctrl+G未実装）を直し、削除機能も足した。あわせてPR #683・#684・#685・#686・#688・#689・#690のレビュー状況を棚卸しに記録した。

v4.6.14 — **制作技術支援に「運営マニュアル」「会場図面」の2つのミニアプリを新設した**。①運営マニュアルは設計・モックアップから実装まで進め、マージ直後に届いたCodexレビュー指摘4件（P1×2・P2×2）を別PRで修正し、「体制図」ブロック（木構造の分岐・顔写真つき）を追加、利用者から報告のあった不具合3件も直した。②会場図面（会場図面シミュレーター）は設計・モックアップから実装（migration 298/299・サーバーAPI・運営マニュアルへの差し込み・PC編集盤／スマホ閲覧）まで進め、届いたCodexレビュー指摘8件（P1×6・P2×2）も同PR内で修正した（段F＝会場・階の管理画面は今回のスコープ外）。③PR #676・#677・#678・#679・#680・#681のレビュー状況を棚卸しに記録した（`docs/reviews/codex-findings-v4.md`。表に移す未対応の指摘は無い）。1件ずつの詳細は `docs/version-history.md` のこの版の全文を参照。

> **それより前の版（全件・全文）は [docs/version-history.md](docs/version-history.md)。** 画面の「バージョン履歴」は
> この節とアーカイブの両方から `scripts/generate-version-history.mjs` が作る（同じ版は長いほうの本文を採る）。
>
> **この節に残すのは最新3件・1件＝見出し＋2〜3文まで。** リリース時に `npm run release:notes` が
> 新しい版を先頭に積み、4件目をアーカイブへ落とす。全文を残したい版はアーカイブ側に全文を置く。
> この節は毎ターン文脈に載るため、貯めると全作業のコストが上がる。

## 開発の絶対原則: AIを使い捨てにしない (必須チェック)

会社方針。**AI 機能を作る・変えるときは必ず**フィードバックループを設計に組み込む。
AI を一度使って終わりにすると人間の修正コストが永久に減らず、直した労力が資産にならない。

**回すループ**: ①AIが業務を実行 → ②4つのフィードバックを回収（業務結果 / 人間の修正差分 / 顧客反応 / 成果指標）→ ③AI改善に反映（プロンプト・ナレッジ・学習データ）→ ①に戻す

**設計時に必ず満たす5条件**: 1) AI出力を記録・保存 2) 人間の修正を差分として残す 3) 顧客反応と成果指標を出力に紐づける 4) 貯めたデータをAI改善に戻す経路 5) レビュー頻度と担当を決める

**運用**: AI/MCP/スキル/自動化の設計・変更時は `.claude/skills/ai-feedback-loop/` のスキルを使い、
5条件の充足表を出して**抜けを明示**する。経路が作れない要素は「できない」で止めず必ず代替案を添える。
ONAiR の現状（何が既にあり、どこが穴か）は同スキルの `references/onair-current-state.md` に集約済み。
AI が関与しない UI 修正・CRUD・デプロイ作業には適用しない。

## ブランチ運用とリリース

**正は [docs/branching.md](docs/branching.md)。** ここには要点だけ置く。

- **長く残るブランチは `main` だけ。** 直接 push 禁止（PR のみ・Squash マージ固定）
- **`main` は本番ではない。** `main` にマージ = **検証環境**（dev.gmo-onair.jp）に自動デプロイ
- **本番に出るのは GitHub で Release（タグ `vX.Y.Z`）を公開したときだけ。** ユーザーの明示的な指示なしに公開しない
- 作業ブランチは `feature/<Issue番号>-<短い名前>`（`fix/` `chore/` `docs/`）。Claude Code Web の `claude/*` もそのまま PR にしてよい。数日で PR にして消す
- ブランチ単位で検証環境に出したいときは Actions → Preview → ref を入力（本番には出せない）
- **PR タイトルは `種類(アプリ): 何をしたか`**（例 `feat(equipment): 機材台帳を v4 の見た目にした`）。Squash マージで `main` の1コミットになり、`git log --oneline` が機能の一覧になる
- ⚠️ **Claude が PR を出したら、確認を待たずにその場で `.claude/skills/pr-watch` を使って見張る（マスト）。**「見張りますか」と訊いて返事を待つのも不可 — その間 CI 失敗もレビューも誰も見ない
- ⚠️ **マージしたら、その PR のレビュー指摘を棚卸しに移す**（`npm run reviews:debt` → [docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md)）。マージすると指摘は画面から消えるので、書かなければ存在ごと消える。**直さないと決めたものも表から消さない**

### バージョンと履歴

- **作業 PR では版を触らない。** 代わりに `docs/changelog.d/<枝の名前>.md` に載せたい文を1つ置く（`npm run lint` の `check-changelog.mjs` が両方を強制する。書き方は [docs/changelog.d/README.md](docs/changelog.d/README.md)）
- **リリース時**に `npm run release:notes -- X.Y.Z` が、ルート `package.json` の `version`・この文書の「現在のバージョン」（先頭に積み、4件目をアーカイブへ）・`README.md`（番号と見出しだけ）を更新する。整合は `npm run check:version`。各ワークスペースの `package.json` は触らない（Docker のビルドキャッシュが無効化される）
- 画面の「バージョン履歴」は `scripts/generate-version-history.mjs` が**この文書（最新3件）＋ [docs/version-history.md](docs/version-history.md)（それ以前の全件）**から生成する。**書式を崩すとパースに失敗する**（この文書は `vX.Y.Z — **タイトル**。本文` の1行・アーカイブ側は全体を `(...)` で包んだ1行）

## 環境分離ポリシー (最重要)

### 本番環境と検証環境は絶対に干渉させない
- **本番**: `https://gmo-onair.jp` — コンテナ `app_prod`・DB `onair_prod`・認証 Email/Password + SMS 2FA・`SKIP_SEED=true`（シードなし・マスター管理者のみ自動作成）
- **検証**: `https://dev.gmo-onair.jp` — コンテナ `app_dev`・DB `onair_dev`・認証は本番と同じ Email/Password（`AUTH_MODE=password`）・シードデータあり・自由に壊せる
- **手元の開発**（`npm run dev`）: 認証の既定は mock（ユーザーカード選択式）。`npm run verify:up` の検証用 Postgres はポート 5433 で、本番・検証のどちらとも別

### 絶対厳守
- 本番DBと検証DBは**完全分離**。相互参照・相互コピー禁止
- 本番DBに対する直接SQL操作は**最小限**（管理者パスワードリセット等の緊急時のみ）
- 検証環境のデータが本番に流れ込まないこと。本番の秘密情報（JWT_SECRET 等）を検証環境で使わないこと
- **本番へ出す（GitHub Release の公開）は、ユーザーの明示的な指示があるときだけ。** Claude が自分の判断で公開しない。`main` への直接 push も禁止（PR のみ）

デプロイの流れ: PR を `main` にマージ → 検証環境に自動デプロイ。本番はユーザーが Release を公開したときだけ。
手順・戻し方は [docs/branching.md](docs/branching.md) と [docs/deploy-pipeline.md](docs/deploy-pipeline.md)。

### バージョン確認コマンド (VPS)
```bash
cd /root/gmo-onair && git log --oneline -1                    # 現在のコード
curl -sk https://dev.gmo-onair.jp/health                       # 検証稼働確認
curl -sk https://gmo-onair.jp/health                            # 本番稼働確認
```

### DB バックアップ・復元運用
3時間ごとの自動バックアップ（BOX 保存）と復元 CLI がある。手順は [docs/ops/db-backup-restore.md](docs/ops/db-backup-restore.md)。
**DB を伴う変更（migration 200・206〜208 以降）はコードだけ戻しても動かない** — [docs/deploy-pipeline.md](docs/deploy-pipeline.md) の「戻し方」。

## UI/UX ポリシー

### モックが v4 の正
`docs/design/v4/mockups/` のモックが v4 の正（[docs/v4-plan.md](docs/v4-plan.md) の「大前提」）。実装・過去の決めごと・用語ルールがモックと食い違ったらモックに合わせる。
止めてよいのは「実害が出る」4種類だけ（同文書）。守る規律（縦の整列・金額表記・型スケール・角丸の役割名）は
[docs/design/v4/_rules.md](docs/design/v4/_rules.md)、部品の一覧は [CONTRIBUTING.md](CONTRIBUTING.md) の「守るもの」。

### レスポンシブデザイン必須
- **全ての画面はスマホ対応を前提**で設計・実装する（モバイルファースト）。375px 幅（iPhone SE 相当）でも破綻しないこと
- Tailwind のブレイクポイント `sm:` `md:` `lg:` を使う／横スクロールしうるテーブルは `overflow-x-auto`／フォームは1カラム縦積みが基本／タップ領域は最低 44px／ダイアログは `max-h-[90vh] overflow-y-auto`／固定ヘッダー・フッターは `safe-area-inset` を考慮
- 実装後は `npm run verify:ui`（実ブラウザ・1440px と 375px）で確認する。PC 専用にする画面は `client/src/pcOnlyScreens.ts` に理由つきで宣言する（`check-mobile-declared.mjs` が見る）
- 既存画面もレスポンシブ不備を見つけたら随時修正する

## コード健全性ポリシー

依存関係のバージョン整合・ビルド設定の同期・Lint 基盤・TODO 管理・定期セルフレビューの方針は
[docs/archive/2026/2026-04-28-code-health.md](docs/archive/2026/2026-04-28-code-health.md)（2026-04-28 の codex フルレビューからの学び）。
機械で止めているもの（1ファイル 400 行・shared の参照経路・UI トークン・migration 番号の重複・文書のリンク切れ）は `npm run lint` に入っている。

## デプロイ先の構成

手順は [docs/branching.md](docs/branching.md)、仕組みの中身は [docs/deploy-pipeline.md](docs/deploy-pipeline.md)、VPS の運用は [docs/ops/vps-setup.md](docs/ops/vps-setup.md)。

- **VPS**: CoNoHa VPS — Docker Compose（プロジェクト名 `gmo-onair`）で本番 `app_prod:3000` と検証 `app_dev:3001` を並走。nginx・PostgreSQL・レンタル機材スクレイパー2本も同じ compose
- **VPS のリポジトリ**: `/root/gmo-onair`（本番）・`/root/gmo-onair-dev`（検証の worktree）
- **DB**: 単一 PostgreSQL を DB 名で分離（`onair_prod` / `onair_dev`）
- **イメージ**: `ghcr.io/terai-takehiro/gmo-onair` の `:prod` / `:dev` / `:sha-<SHA>` / `:vX.Y.Z`。ビルドは GitHub Actions、VPS は pull するだけ

## セキュリティポリシー

### 絶対にやってはいけないこと
- `.env` や認証情報を Git にコミットしない（`.gitignore` 済み）
- API キー・パスワード・JWT シークレットをソースコードにハードコードしない
- 本番 DB の接続情報を開発環境のコードやログに出力しない
- `JWT_SECRET` にデフォルト値を本番で使わない

### 認証
- **切替は `AUTH_MODE` 環境変数**（`server/src/config.ts`）: `password` = Email/Password + SMS 2FA ／ `mock` = ユーザーカード選択式。本番（`NODE_ENV=production`）は常に `password`、検証環境（`app_dev`）も `password` を明示、手元の開発の既定だけ `mock`
- JWT: HTTP-only cookie + Authorization Bearer ヘッダーの二重送信
- Google の資格情報（`GOOGLE_CLIENT_ID` 等）は**カレンダー連携専用**。ログインには使わない

### 環境変数の管理
- `.env.example` をテンプレートとして使用（`cp .env.example .env`）。本番の `JWT_SECRET` は `openssl rand -hex 32` で生成、`DB_PASSWORD` は十分な長さのランダム文字列
- Docker Compose は `.env` ファイルから自動読み込み

### 開発環境
- ローカル開発は `.devcontainer/`（Dev Containers）を使用して隔離。コンテナ内で `npm install` + `npm run dev` が完結する構成
- ホストマシンの認証情報や SSH キーはコンテナに渡さない

## BOXフォルダ構造
案件ごとの BOX フォルダの決めごとは [docs/architecture/box-folder-structure.md](docs/architecture/box-folder-structure.md)。
