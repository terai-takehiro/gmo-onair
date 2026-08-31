# テロップCG 段6 — アワード・クイズ移行設計（2026-08-31 起こし・**設計のみ・コード未着手**）

**この文書の位置づけ**: [graphics.md](graphics.md) §9 の「段6: アワード・クイズのテンプレートパック移植 →
旧 `/awards` 画面の畳み込み」を実行に移す前の設計書。現行 `client-awards`（凍結中・URLは生きている）
の機能棚卸しと、テロップCG新エンジン（段1〜5＋部品実装まで完了）とのギャップを調査した上でまとめた。
**この文書自体はコードを1行も変えていない。** 着手する段（下記「段6の内訳」）ごとにユーザーの合意を
取ってから実装に入る。

`client-awards/CLAUDE.md` の方針どおり、**移行が検証環境で確認できるまで旧 `/awards/*` は現状のまま
生かす**（削除・機能凍結の追加はしない）。

## 0. なぜ「段6」は1段では終わらないか

段1〜5は「送出の器」（プロジェクト／ページ／cue／発注／名簿取込の最小CRUD＋9部品のレンダラー）を
作るところまでだった。アワード・クイズの実装を実際に読むと、そこには**器だけでは足りない、
テロップCGの設計思想（`graphics.md` §2・§5）自体が実装未着手のまま前提にしている土台**が
複数見つかった。具体的には:

- 「スロット間の自動退出ルール」（§2）— 宣言する場所がコード上どこにも無い
- 「Out = In の逆再生」（§5）— アニメーション契約そのものが未実装（cue が変わった瞬間に切り替わるだけ）
- 「部品→**テンプレート**→ページ→送出リスト」の4層（§2）— テンプレート層が存在しない
  （`graphics_pages.part_key` は単一値固定で、複数部品を組み合わせた1画面が作れない）

これらはアワード固有の要求ではなく、**テロップCG全体の設計方針が実装に追いついていない部分**。
アワードの「段階発表演出」「複合下部テロップ」を移植しようとすると必ずこの土台にぶつかるため、
段6は「アワード専用の作業」ではなく「**残っていた設計の宿題を、アワードという実例で解く**」段になる。
そのため段6を6-1〜6-9の内訳に分け、**土台（テンプレート層・アニメ契約・cue拡張）を先に、
アワード固有の演出は後に**積む順序にした。

## 1. 現状棚卸し（要約）

### 1-1. データモデル（現行 awards/quiz）

| テーブル | 役割 | 特記事項 |
|---|---|---|
| `awards_events` | イベント（アワード回） | `status`: draft/live/closed |
| `awards_categories` | 賞・部門 | `award_pattern`: **direct**（No.1を直接発表）／**vote**（投票→No.1決定） |
| `awards_entries` | エントリー（候補者） | `rank`・`points`（NUMERIC、小数票対応）・`is_winner`・`oneshot_data` JSONB（下部テロップ用リッチ情報） |
| `awards_cue_state` | ランキングCGの進行状態（**event単位シングルトン**） | `step` が12種（idle→title→nominees→ranks52→top3→winner-bar→oneshot→poll→vote-reveal→final-pitch→celebration→survey-oneshot）。`reveal_phase`（0〜3、ステップ内のサブフェーズ）も持つ |
| `awards_oneshot_cue_state` | 下部テロップの進行状態（event単位・ランキングCGとは独立） | 動的モジュール切替・ティッカー・カウントダウン（3D数字・独立レイヤー） |
| `awards_sounds` | ステップ別演出SE | step × 開始順位バリアントで紐付け |
| `quizzes`/`quiz_choices` | クイズ・アンケート設問 | `mode`: quiz（正誤あり）／survey（answer-check・top-reveal） |
| `quiz_stack_state` | event単位の現在送出中クイズ+ステップ | idle/poll/answer-check/correct-reveal/reveal/winner |

**実データ量感**（`seed-awards.ts`）: イベント3件・カテゴリ9本・エントリ37件・クイズ2問。
本番に実データが入っているかはコードから判定不可（`SKIP_SEED=true` のため seed は入らない）。

### 1-2. 落としてはいけない機能・演出（棚卸しで確認したもの）

1. **段階的発表演出** — RANKS 5→2 は1段ずつ `BAR_INTERVAL=1100ms` 間隔で下から公開、
   ポイントは `CountUp` で0→実数へ800msカウントアップ、`cubic-bezier(.22,1,.36,1)` イージング
2. **direct/vote 2パターン**の賞（直接発表 vs 投票結果棒グラフ→No.1）
3. TOP3・Final Pitch（3人並び→1人ピック）・Celebration（複数部門の合同祝賀＋紙吹雪）
4. 下部テロップの**動的部品モデル**（`ModuleDef`: label/icon/binding） —
   これは `graphics.md` の「部品パッケージ」構想とほぼ同じ発想で、**概念だけなら直接転用できる**
5. カウントダウン（3D立体数字・独立レイヤー・位置/スケール個別調整）
6. クイズの3モード＋**カウントダウン連動の別VPS「インタラクティブ」自動出題・締切**
   （`interactive-bridge.service.ts`・`interactive-poller.service.ts`。視聴者の実投票を2秒間隔で取込）
7. 投票No.1をランキングCG側で発表する `survey-oneshot` 連動
8. Excel取込の**列自動判定＋バイリンガル対応＋dry-run差分プラン＋localStorage列マッピング記憶**
9. 演出SE（ステップ×開始順位の精緻な紐付け）
10. BOXミラー保存＋バックアップ復元（写真・音源とも）
11. **OA/NEXT/TAKE/CLEAR の2系統cue**（LIVE=DB永続化・NEXT=in-memory）という運用モデルそのもの

## 2. 新エンジンとのギャップ

### 2-1. 既にカバーできている部分

| 機能 | 対応度 |
|---|---|
| ページ管理・呼出番号・出力URL（透過・スケール・ポーリング＋Socket） | ほぼ同等に作り直し済み |
| リアルタイム同期（`/graphics` 名前空間） | 同型 |
| 名簿一括生成（Excel） | **大幅に簡略化**（列自動判定・diff・dry-runなし。§2-2参照） |
| スコアボード（静的表示＋±即時反映） | 静的表示のみ。段階演出なし |
| 投票結果（静的表示） | 見た目の骨格のみ。集計・状態遷移なし |
| 発注（テロ原）・校正ステータス | 新規実装分（awardsに比較対象なし） |

### 2-2. 無い・追加実装が必要な部分（優先度順）

**最優先（これが無いと移行不可）**

1. **投票・クイズの状態遷移エンジンが丸ごと無い**。現状の `vote` 部品は「手入力の票数を静的表示するだけ」。
   出題→締切→開票という時間軸の概念が `graphics_pages.fields`（ただのJSONB）に存在しない →
   **出題→締切→開票の手動状態遷移のみ実装済み**（2026-08-31。`fields.voteState`
   〈`'open' | 'closed' | 'revealed'`・省略時は`'revealed'`扱いで既存ページ無回帰〉を
   `voteState.ts` に新設し、`VoteResult`（`voteParts.tsx`）が出題中＝ラベルのみ・
   締切＝「投票締切」の一言を追加・開票＝従来どおり割合バー表示、の3段で描き分ける。
   送出コンソールの「続き」ボタンを流用（`pageSupportsReveal()` に `partKey: 'vote'` を
   追加）しつつ、実処理は list/score の `reveal_phase`（cue側・TAKE毎に0へリセットされる
   汎用機構）とは**あえて別経路**にした——`reveal_phase` に相乗りすると、既に開票済みで
   運用中の既存ページまで次の TAKE で「出題中」に巻き戻ってしまい後方互換が壊れるため。
   `fields.voteState` はページ側の値として `PUT /pages/:id`（ScoreQuickAdjust と同じ
   「fieldsをその場で書き換えてcg:syncで同報」の経路）で進め、TAKE 時だけ明示的に
   `'open'` へ書き戻す（新しいエンドポイントは増やしていない）。**外部投票受付・自動締切は
   引き続き今後の課題**（外部インタラクティブ連携の要否確認待ち・下記2番）
2. **リアルタイムの投票受付・外部インタラクティブ連携が無い**。視聴者が実際に投票する導線が皆無
3. **ランキング発表の多段演出が無い**。`score` 部品は静的表示＋±だけ。1位から順に出す等の
   段階進行の仕組みがゼロ（`ConsoleControls.tsx` の「続き」ボタンは実装なしの常時disabled）→
   **段6-1 実装済み**（`graphics_cue_state.reveal_phase`・migration 248。`POST
   …/cue/continue` と Socket `cg:continue` でスロット単位の段階カウンタを+1し、
   「続き」ボタンから叩けるようにした汎用機構のみ。実証として一覧表〈`FullscreenList`〉に
   「revealPhase+1件目まで表示」を適用した。**段階公開の仕組み（段6-1の`reveal_phase`
   機構）をスコアボード（`score`部品）にも適用済み**（2026-08-31。`pageSupportsReveal()` の対象に
   `slot: 'side'`＋`partKey: 'score'` を追加し、`ScoreBoard`（`scoreParts.tsx`）が
   `revealPhase` を受けて `fields.entries` 配列の先頭から `revealPhase + 1` 件目までを
   表示する形にした——**配列順＝発表順**という取り決め〈下位から並べておけば「下位から
   発表」になる〉。新しく現れるエントリーは既存のIn/Outフェード契約〈段6-3〉にそのまま乗って
   自然にフェードインする。全件公開し終えたとき（＝最終発表・1位相当）だけ最後のエントリーの
   数字をわずかに拡大する控えめな強調も4テーマ共通で加えた——新しい色・発光は追加していない）。
   CountUpアニメ等の精緻な演出は引き続き今後の課題（外部投票連携・過去データ移行の判断と
   セットで検討する範囲であり、今回のスコープには含めない）。
   ⚠️ **既知の未修正の挙動（`FullscreenList`から引き継いだもの・今回新設ではない）**:
   サーバーはTAKEのたびに`reveal_phase`を必ず`0`へ書き直すため、出力・送出コンソールが
   読む`revealPhase`は「続き」を一度も送っていないページでも常に`0`になる
   （`RenderContext.revealPhase`がコード上「未指定」になるのは、cueを経由しない
   `PageLivePreview.tsx`のフォーム編集プレビュー等に限られる）。そのため段階公開を
   意図しない`score`/`list`のページも、TAKEした瞬間は先頭1件しか映らない
   （実機確認済み・詳細は`docs/changelog.d/claude-realtime-cg-v4-optimization-ayc233.md`）。
4. **In/Out アニメーション契約が未実装**。「Out = Inの逆再生」（§5）は設計文書の記述のみ→
   **段6-3 実装済み**（汎用フェード契約のみ。`pages/graphics/CgTransition.tsx`・
   出力画面／送出コンソール共通・数値は
   [graphics-design-specs.md §11](graphics-design-specs.md#11-inout-トランジション契約実装値2026-08-31-追補段6-3)）。
   ジャンル別の凝った演出（式典のマスク展開・バラエティのポップ等・§8）は今後の課題
5. **スロット間の自動退出ルールが未実装**（§2で宣言しているのにコード上どこにも無い）→
   **段6-4 実装済み**（`graphics_projects.slot_exit_rules`・migration 247。テンプレート層
   〈6番〉がまだ無いため、いまは「テンプレート側」ではなく**CGプロジェクト単位の設定**として
   持つ。テンプレート層ができたらそちらへ移設予定）
6. **テンプレート層そのものが無い**。1ページ＝1部品固定で、複数部品を組み合わせた画面が作れない→
   **段6-2 実装済み（単一部品の設定プリセット＋公開フィールド絞り込みのみ。複数部品を1画面に
   配置するキャンバス機能は引き続き今後の課題）**。`graphics_templates`（migration 249。
   project_id・part_key・slot・name・base_fields・public_fields）とページ側の `template_id`
   （NULL許容・ON DELETE SET NULL）を新設。ページをテンプレートから作ると `base_fields` が
   初期値になり、フォームは `public_fields` に含まれるフィールドの入力欄だけを出す
   （`TemplateFieldsSection.tsx`）。サーバー側（`templates.routes.ts`）はテンプレート作成・
   更新時に `publicFields` が `baseFields` のキーの部分集合であることを検証し、ページ作成
   （`POST …/pages`）は `baseFields` に `publicFields` の範囲だけ body の値で上書きしたものを
   保存、ページ更新（`PUT /pages/:id`）はテンプレート付きページなら `publicFields` 外のキーを
   含む更新を 400 で拒否する——オペレーターが公開されていないフィールドを弄れないことを
   API レベルで保証するのが核。テンプレートを使わない従来の「部品を選んで自由入力」フローは
   そのまま残した（既存ページ・既存フローへの影響なし）。
   **段6-2 本格拡張の第一段 実装済み（既存9部品を最大4個まで重ねて1ページに組み合わせられる。
   各部品は自分の既存の描画位置のまま＝ドラッグ配置キャンバスではなく『組み合わせて重ねる』機能。
   組み合わせの妥当性〈位置が重ならないか〉は作画担当の判断に委ねる設計）**

**優先度中〜低（後から追加できる）**

7. 多言語（`?lang=ja|en`）→ **実装済み**（`?lang=en`・`${field}En` 規約・未入力時は日本語へ
   フォールバック）。既存9部品全てのテキスト系フィールドのうち「本番で英語表記が要りそうな欄」
   （氏名・肩書・題字見出し・ティッカー・速報・サイド・設問・スコアのエントリー名・投票の
   選択肢ラベル）に英語版の入力欄（任意）を足した。読み方は `pages/graphics/langField.ts`
   の `pickLang`/`pickLangValue` に統一（部品ごとに読み方が割れないようにした）。フォーム
   （`PageFormDialog.tsx`）は本体の入力欄のすぐ下に英語欄を自動追加し、ライブプレビュー
   （`PageLivePreview.tsx`）にも試写用の日英切替トグルを付けた。⚠️ 題字（`title`）・一覧表
   （`list`）は、フォームの入力キー（`text`）と出力レンダラーが読むキー（`title`/`items`）が
   もともと一致しておらずフォーム入力が出力に反映されない既知の不整合があった（当時は今回の
   タスクとは無関係の既存差分として多言語化の対象から外していた）が、**2026-08-31 に修正済み**
   — `pageFields.ts` の `title` を `title`/`speaker`/`speakerTitle` の3欄、`list` を
   `items`（新設 `ListItemsEditor.tsx` による可変長配列）＋`columns`（列数セレクト）に
   組み替え、フォーム入力が実ブラウザ・実DBで出力へ反映されることを確認した
   （引き続き `title`/`list` はレンダラーが `lang` を受け取らないため多言語化の対象外）
8. 名簿取込の列自動判定・dry-runが無い → **実装済み（2026-08-31）**。`roster-import.service.ts`
   の `previewRosterExcel` が列ごとに型（空/数値/日付/短文/長文の5種）を自動判定し、呼び出し側
   （`RosterImportDialog.tsx`）が現在選択中の部品の `PART_FIELDS`（key/label）を
   `fieldCandidates` として渡すと、`normalizeHeader` による表記ゆれ吸収つきの完全一致／部分
   一致で推奨マッピング（`suggestedKey`/`suggestedConfidence`）も返す。部品を切り替えるたびに
   同じ preview API を呼び直して推奨を再計算する設計（列一覧・型判定は `RosterColumnPanel.tsx`
   が表示、ワンクリックで採用可）。`commitRosterImport` は `dryRun: true` でDBに書き込まず
   件数（作成/空行スキップ/エラー行）だけを返し、UIは「確認する→件数を見る→投入する」の
   2段の確認フローになった（`RosterDryRunSummary.tsx`）。awardsにある**diff（新規/更新/
   変更なし）の判定は対象外**（テロップCGの名簿一括生成は常に新規ページを作るだけで、
   既存エントリとの突き合わせという概念自体が無いため不要）。
9. 写真・画像フィールドが `pageFields.ts` に存在しない（テキスト系のみ）
10. 発注フォームの添付画像は既にスコープ外と明記済み

### 2-3. 構造的に食い違う箇所（単純なテーブルコピーでは移行できない）

- **粒度の違い（最重要）**: awardsは「イベント→カテゴリ→複数エントリー」という関係データを
  カテゴリ単位で自動的に段階進行させる。新エンジンは「ページ＝1枚のテロップ」というフラットな単位。
  部門・ノミネート・ランクという関係構造をどこにも持たない
- **投票の主体が違う**: awardsの得票は「視聴者の実投票の集計結果」。新エンジンの `vote.fields.choices[].votes`
  は「オペレーターが見た目のために入力する数値」。データの出所が根本的に異なる
- **cue の型が違う**: awardsは状態機械（step・reveal_phase持ち）。新エンジンは「スロットに何が
  乗っているか」だけの薄いモデル（pageId・is_liveのみ）
- **owner の単位が違う**: awardsは「event」が頂点。新エンジンは「案件/番組」単位に汎用化されている

## 3. 移行の基本方針

1. **旧 `/awards/*` は移行完了・検証まで一切変更しない。** サーバー配信・API・Socket.IO・
   Dockerfileの4点は現状維持。ユーザーの明示的な指示があるまで削除・機能停止は行わない
2. **土台（テンプレート層・アニメ契約・cue拡張）を先に作る。** アワード固有の演出はこの土台の
   上に積む。土台はアワード以外の全ジャンル（式典・報道・バラエティ等）にも効くため、
   アワード移行のためだけでなく単独の価値がある
3. **「実際に視聴者が投票する」機能（外部インタラクティブ連携）は、要否を先に確認する。**
   これは実装量が最も大きく（別VPSとのHTTP連携・ポーリング・カウントダウン連動の自動化）、
   かつ「今後もこの運用を続けるか」というビジネス判断が先に必要な部分。ここを含むか否かで
   段6全体の規模が大きく変わる
4. **過去の実績データ（誰が何位だったか等）の扱いを先に決める。** 新モデルへ変換して移すか、
   `/awards` 側にアーカイブとして残すか（=新エンジンには「今後の新規イベント」だけを乗せる）
5. **段階演出は「完全再現」でなく「必要な部分だけ移植」を検討する。** RANKS発表のCountUp・
   イージング等の演出値は棚卸し済みなので、後日どこまで再現するか判断できる状態にはなっている

## 4. 段6の内訳（依存関係つき）

```
段6-1 cue拡張（スロット単位の状態機械化）
  └─ 段6-2 テンプレート層（部品の組み合わせ・公開フィールド絞り込み）
       └─ 段6-3 In/Outアニメーション契約（CasparCG型6動詞）
            └─ 段6-4 スロット間自動退出ルール
                 ├─ 段6-5 ランキング発表テンプレートパック（段階演出・direct/vote分岐）
                 ├─ 段6-6 投票・クイズの状態遷移＋締切連動（自前投票のみ。外部連携は6-7へ分離）
                 │    └─ 段6-7 外部インタラクティブ連携の移植（要否は§3-3で要確認）
                 └─ 段6-8 名簿取込の高度化（列自動判定・dry-run）／多言語対応／写真フィールド
段6-9 実データ移行・検証環境での並行稼働・旧/awards畳み込み判断
```

- 6-1〜6-4は**アワード専用ではなくテロップCG全体の基盤強化**。ここまでで「段階演出付きの
  複合テンプレート」が一般に作れるようになる
- 6-5〜6-8は基盤の上にアワード固有の中身を積む段。6-7（外部連携）だけは規模・要否判断の
  観点で他と切り離せる設計にしてある
- 6-9は移行の総仕上げ。ここで初めて「旧 `/awards` を畳むかどうか」を判断する

> **段6-4 実装済み（テンプレート層〈6-2〉に先行）。** 上の依存図は「テンプレート層ができた
> 前提」の置き場所だが、6-2はまだ未着手のため、今回は**CGプロジェクト単位の設定**
> （`graphics_projects.slot_exit_rules`・migration 247）として実装した。6-2ができたら
> ルールをテンプレート側へ移設する想定（過剰な先読み設計はしない、という判断で
> いまはプロジェクト単位のまま）。

> **段6-1 実装済み（reveal_phase汎用機構＋一覧表への適用のみ。ランキング発表演出そのものは
> 今後の課題）。** `graphics_cue_state.reveal_phase`（migration 248・新しいページが
> TAKE されたら 0 にリセット）と、それを+1する `POST …/cue/continue` ／ Socket
> `cg:continue` を追加し、送出コンソールの「続き」ボタン（PGMに段階公開対応の部品が
> 乗っているときだけ有効）から叩けるようにした。実証として `FullscreenList`（一覧表）
> だけが対応（`revealPhase+1` 件目まで表示）。**アワード固有の段階演出（1位から順に・
> direct/vote分岐・score部品の段階公開等）はこの段では作っていない** — 上の依存図が
> 想定する「6-2（テンプレート層）の上に6-5（ランキング発表テンプレートパック）を積む」
> という順序は変わらず、6-1は「段階カウンタを持てる」という土台だけを先に用意した形。

## 5. 意思決定が必要な論点（着手前にユーザー確認） — **2026-08-31 全4件回答済み**

1. **外部インタラクティブ連携（視聴者の実投票受付）は今後も使うか。** → **使う（実装する）。**
   別VPS `interactive.gmo-onair.jp` との連携仕様（実ファイルは `server/src/contexts/quiz/services/
   {interactive-bridge,interactive-poller,interactive-lifecycle}.service.ts`。`X-API-Key`認証・
   鍵は`awards_events.interactive_link` JSONBに平文保存・ポーリング間隔は実測**800ms**——
   一部コメント/旧設計文書の「2秒」は古い記述で実値と食い違っていた・カウントダウン連動の
   自動close）をそのまま踏襲する前提で段6-7として実装する
2. **過去の開催実績データはどうするか。** → **新エンジンに変換して移行する。**
   `awards_entries`（`rank`/`points`/`is_winner`等）→ 新エンジンの`ranking`部品（`RankingEntry[]`）
   への変換を段6-9で設計する
3. **段階演出（RANKS発表のCountUp等）は完全再現が必要か。** → **完全再現。**
   段6-5で着手済み（下記「段6-5 進捗」参照）
4. **段6全体を1つの大きな作業として進めるか、個別PRに割るか。** → **1つの継続作業として進める**
   （PRは作らず、指定ブランチへ継続的にコミットを積む）

### 段6-5 進捗（2026-08-31・第1弾実装済み）

新part_key `ranking`（`client-techops/src/pages/graphics/rankingFields.ts`ほか）で、RANKS 5→2
段階発表・winner-bar・TOP3・Final Pitch・direct/vote分岐・CountUp（`RankingCountUp.tsx`。
`requestAnimationFrame`＋ease-out-quint`1-(1-t)^5`の自前実装）を、旧`StepRanking.tsx`/
`StepTop3.tsx`/`StepFinalPitch.tsx`のタイマー定数（`STRIP_SETTLE=800`・`BAR_INTERVAL=1100`・
`PHOTO_OFFSET=280`・TOP3の`POINTS_DELAY`/`REVEAL_DELAY`・Final Pitchの`SLOT_X`/`CENTER_X`）と
CSS transition/keyframeの値まで含めて完全再現移植した。`fields.step`はvote部品の`voteState`と
同じく`reveal_phase`を経由しない独自進行（`STEPS_DIRECT`/`STEPS_VOTE`。TAKEで`idle`へリセット・
「続き」ボタンで1段進行）。4テーマ対応（ceremony-goldは旧実装を忠実再現、他3テーマは
`scoreParts.tsx`の確立済み配色語彙を流用）。**未実装（次ラウンド）**: Celebration演出（複数部門
合同祝賀・紙吹雪）・演出SE（`awards_sounds`相当）・survey-oneshot連動（連動アンケートNo.1の
ランキングCG側発表）・段6-6の締切連動と段6-7の外部連携そのもの・段6-9の過去データ移行。

## 6. 参照ファイル（この設計の元データ）

- 現行実装: `client-awards/src/pages/{EventEditorPage,ControlPage,OneShotControlPage,QuizStackControlPage,CgCockpitPage}.tsx`・
  `client-awards/src/cg/{StepRanking,CGSequence}.tsx`・`client-awards/src/oneshot/animation/timings.ts`・
  `server/src/contexts/awards/`・`server/src/contexts/quiz/`・
  `server/src/shared/db/migrations/{069,079,080,089,092,095,096,098,101,103,104,106}_*.sql`
- 新エンジン: [graphics.md](graphics.md)・[graphics-design-specs.md](graphics-design-specs.md)・
  `server/src/contexts/graphics/`・`client-techops/src/pages/graphics/`
