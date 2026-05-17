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
| インタラクティブ | `client-interactive/` | `/interactive/` | 5176 | EventStamp・リアルタイム演出 |
| 技術資料 | `client-techsheet/` | `/techsheet/` | 5177 | カメラ・映像・音声技術仕様書 |
| ライブ運用 | `client-live/` | `/live/` | 5178 | 本番オペ・進行管理 |
| 表彰CG | `client-awards/` | `/awards/` | 5179 | 表彰式CG演出・送出管理 |

### 共有ライブラリ (`shared/`)
全ブロックアプリの共通コードを集約。各アプリは設定値のみ渡すラッパーファイルで利用。
- `shared/src/client/createApi.ts` — axiosインスタンスのファクトリ (storageKey, loginPath)
- `shared/src/client/createAuthHook.ts` — useAuthフックのファクトリ (storageKey, api)
- `shared/src/client/queryClient.ts` — 共通QueryClient設定
- `shared/src/client/uiStore.ts` — 共通UIストア (Zustand)
- `shared/src/client/utils.ts` — cn()ユーティリティ
- ストレージキー: `qs_user` (qsheet), `ts_user` (techsheet), `is_user` (interactive), `eq_user` (equipment)

## 技術構成
- **フロントエンド**: React 19 + Vite 8 + TailwindCSS 4 + shadcn/ui
- **バックエンド**: Express + PostgreSQL (pg)
- **モノレポ**: npm workspaces (client, client-qsheet, client-equipment, client-interactive, client-techsheet, client-live, server, shared)
- **リアルタイム**: Socket.IO (`/qsheet` ネームスペース: OnAir↔ランダウン同期, `/interactive`: スタンプ)
- **デプロイ先**: CoNoHa VPS (Docker Compose + PostgreSQL + Nginx)

## 現在のバージョン
v2.8.146 — Poll 選択肢高さ縮小 + Vote-reveal の大賞タイトルを poll_title 表記に。①選択肢ベースを CHOICES_H 140 → 100 に縮小、CHOICES_Y は 904 のまま保持 → 下端 1004 で、下に 76px の余白が空く (旧 36px)。②Vote-reveal Phase 2 (大賞フルスクリーン) の categoryChild を category.name (例: 新人賞) ではなく **poll_title** (例: 最優秀新人賞、operator が手入力した文言) に変更。CGSequence で StepVoteReveal に渡す categoryChild を `category.poll_title || tweaks.categoryChild` で上書き、EN 時は poll_title_en を優先。投票の手入力タイトルが大賞リザルトでも一貫して表示される。

(v2.8.145 — Poll 質問文の縦書き仕様調整: ①**上合わせ**に変更 (alignItems: flex-start、旧 center)、②**改行禁止** (white-space: nowrap) で常に 1 列、③transformOrigin: top center で上端基準の長体圧縮、④scale 下限を 0.62 → **0.40** に下げてより強い圧縮を許容、⑤質問専用の questionMaxH = 490 を新設し、**カウントダウン丸 (top: y=820) に被らない位置**までに制限。長文時はそこから自動で長体 (scaleY) で調整。letter-spacing も isLong 時は -0.06em に詰めて密に。)

(v2.8.144 — BEST3 カード間隔拡大 + Poll 選択肢の位置調整。①**BEST3 (StepTop3) のカード間隔を広げる**: `TOP3_GAP` を `56 → 120` に拡大。3 枚のカード間にゆとりを持たせ、視覚的に独立した印象に。②**Poll 選択肢ベースの高さと位置を調整**: `CHOICES_H` を 182 → **140 (元に戻す)** で高さは長くせず、`CHOICES_Y = 1080 - 36 - 140 = 904` に変更し、**下端をカウントダウン丸の下端 (1044) と揃える**。下のスペースが 36px 確保され、丸とラインが揃って全体のリズムが整う。)

(v2.8.143 — モバイル Safari クラッシュ (`A problem repeatedly occurred`) の修正: Poll / Vote-reveal の背景レイヤーを軽量化。 ①**`mask-composite: exclude` を撤去**: カメラ枠領域のくり抜きを CSS mask → **物理 4 領域分割**に変更 (top/bottom/left/right の独立 div で囲む)。WebKit content process の OOM クラッシュ要因を排除。 ②**`mix-blend-mode: screen` を撤去**: 斜光ビーム 2 枚を削除し、ベースグラデのウォームスポットのみで雰囲気を保つ。composite layer の爆発を防ぐ。 ③**SVG `drop-shadow` フィルター粒子 → CSS `box-shadow` div 粒子**に変更: Poll 36→**14** + Vote-reveal 26→**12** に削減。`<svg>` 要素 + `radialGradient` + `filter: drop-shadow` の組合せが iOS Safari でメモリを爆食いしていたため、軽量な絶対配置 div + `box-shadow` glow に置換。 ④**ErrorBoundary** (v2.8.142) は据置で、もし他で render エラーが出ても画面が真っ黒にならず operator UI 維持。)

(v2.8.142 — Poll 微調整 + CG プレビューに ErrorBoundary 追加。①**選択肢カードのテキストを右に**: ChoiceCard の名前/会社のコンテナを `left: 96 → 124` に変更し、左の六角形バッジとの間に約 28px のゆとりを追加 (詰まり感を解消)。②**選択肢ブロックを少し上に**: `CHOICES_Y = CAM_Y + CAM_H + 28 → CAM_Y + CAM_H - 10` に変更し、カメラ枠と 10px 重なる位置に下げて全体を上寄りに。`CHOICES_H` も `1080 - CHOICES_Y - 28` に再計算。③**CG プレビューに ErrorBoundary**: ControlPage の PROGRAM プレビューと NEXT サムネイル両方の `<CGFrame>` を新規 `CGErrorBoundary` クラスコンポーネントで包み、CG レンダーが mount/update でクラッシュしても operator UI 全体は維持。`getDerivedStateFromError` でエラー捕捉、メッセージ + 「再試行」ボタンを表示。`componentDidCatch` でコンソールにも詳細をログ。)

(v2.8.141 — 微調整: ①Vote-reveal 確定数字ボックスの位置を `top: 430 → 470` に下げて、他要素 (名前カード) との被りを解消。②Poll カウントダウンの 0 秒も 1-5 秒と同じ拡大サイズを維持するように `isLast5 = secs <= 5` (旧 `secs <= 5 && secs > 0`) に変更 → 30→5 秒は通常、5→0 秒は強調表示が継続。)

(v2.8.140 — Vote-reveal 結果発表の確定演出を「カウントアップ」→「ドンと拡大」に変更。①**Phase 1 の即時確定**: TAKE 後の `easeOutCubic` 2200ms カウントアップを廃止し、`setShown(targetValue)` で**即座に確定値を表示**。②**数字ボックスのドンと拡大 + パンチアニメ**: Phase 1 移行時に数字ピルが Phase 0 (`width 360 / padding 8x26 / fontSize 92 / 単位 26`) → Phase 1 (`width 480 / padding 14x38 / fontSize 132 / 単位 36`) に拡大 (420ms cubic-bezier overshoot)。`vrNumberPunch` keyframe で `scale(0.86)→1.18→0.98→1` の打突アニメ + `drop-shadow` で 36px ゴールド glow burst。位置も top 458 → 430 に持ち上げて視覚的にも前に出る印象。背景も `rgba(8,4,8,0.7)` 単色 → `linear-gradient(40,28,12 → 15,10,4)` のリッチな暗金グラデ + 2px ゴールド枠 + ゴールド ハロに。)

(v2.8.139 — 表彰CG Poll/Vote-reveal の透過対応 + Poll 終了の自動遷移を撤回し TAKE 操作に変更。①**Vote-reveal の背景透過対応**: `StepVoteReveal` / `Backdrop` に `transparent` プロップを追加し、`CGSequence` から渡す。`transparent=true` の時はベースの暗バーガンディ → 黒のグラデを描画せず、上のスポット / 床リフレクション / ゴールド粉雪粒子だけを描画 → OBS で完全アルファ透過 + 演出要素のみ出力。②**Poll の背景も同じく透過対応**: `Atmosphere` に `transparent` プロップを追加し、`transparent=true` でベースの濃紫 → 漆黒グラデを省略。斜光ビーム / ボケ粒子 / 床リフレクション / ビネット / 上下ゴールド帯は引き続き描画 (アルファ上でも見える)。③**Poll 終了の自動遷移を撤回**: ControlPage の `pollTimerRef` setTimeout (`POLL_DURATION_MS + POLL_REVERT_DELAY_MS = 33s` で auto `step:'top3'`) を**廃止**。代わりに `nextStep === 'poll' && cue.step === 'poll'` のとき TAKE で `{ step: 'top3', revealPhase: 1 }` に手動遷移する分岐を追加。operator の `PollLiveBadge` ヒントも「3 秒後に TOP3 へ戻ります」→「TAKE で結果発表へ」に変更。)

(v2.8.138 — 表彰CG Poll の縦書き質問文で「？」「！」が中央寄せにならない問題を修正。`VerticalText` に `font-feature-settings: "vert" 1, "palt" 1` + `text-orientation: mixed` を追加し、Noto Sans JP の縦書き用グリフを有効化。さらに JA モードでは入力された半角 `?` / `!` を全角 `？` / `！` に自動正規化することで、フォント縦書きメトリクスが効いて文字が縦書きラインの中央に配置されるように。)

(v2.8.137 — 表彰CG 全ての数字フォントを Roboto Condensed Bold 700 に統一 + 右パネル レイアウト再々編 + Poll Q を 2 列上の水平センターに。①**右パネル レイアウト再々編**: Q を**両列の上に水平センタリング**配置に変更。下に [質問 縦書き] [タイトル 縦書き] の 2 列を横並びで並べる構造に。Q (150px Titillium Web italic + ゴールドグラデ) → ヘアライン区切り → 2 列スタック (gap: 22px)。Q が title と question の両方の上にバランスよく配置される。 ②**全 CG 数字フォントを Roboto Condensed Bold 700 に統一**: `index.html` で `Roboto Condensed:wght@400;500;700;900` をロード。`StepPoll` の SlideDigit (カウントダウン)、`StepVoteReveal` の数字ピル、`StepOneShot` の NO.1 + Points、`StepTop3` の rank バッジ + Points、`StepRanking` の rank/points 全箇所で `Bebas Neue` / `Titillium Web` → `'Roboto Condensed', sans-serif` + `fontWeight: 700` に変更。`letter-spacing: -0.01em` + `tabular-nums` でコンデンスかつ揃った数字に。Q (Latin の単一文字) は引き続き Titillium Web italic を維持。③**長文対応継続**: VerticalText / TitleBand の `transform: scaleY` + `palt` ロジックを保持し、長文時はレイアウト破綻なし。)

(v2.8.135 — (取り込み済み: 表彰CG Poll レイアウト最終調整 + カウントダウン Oswald 試行版)

(v2.8.134 — 投票No.1演出から PT 数表示を撤去。①**右パネル レイアウト再々編**: Q を**両列の上に水平センタリング**配置に変更。下に [質問 縦書き] [タイトル 縦書き] の 2 列を横並びで並べる構造に。Q (150px Titillium Web italic + ゴールドグラデ) → ヘアライン区切り → 2 列スタック (gap: 22px)。Q が title と question の両方の上にバランスよく配置される。 ②**カウントダウン数字を Oswald に変更**: Titillium Web → `Oswald` (Google Fonts) の wght 400/500/600/700 をロードして適用。`fontWeight: 700` / `letter-spacing: -0.01em` でコンデンス感を強調しつつクリーンな数字に。Vote-reveal の数字は Titillium Web のまま据置。 ③**長文対応継続**: VerticalText / TitleBand の `transform: scaleY` + `palt` ロジックを保持し、長文時はレイアウト破綻なし。)

(v2.8.134 — 投票No.1演出から PT 数表示を撤去。`StepOneShot` に `hidePoints?: boolean` prop を追加 (デフォルト false)。`OneShotCardOverlay` → `TextColumn` までドリル、`{!hidePoints && (...)}` で Points 行 (`CountUp 52px` + `PT 18px`) を条件レンダリング。`StepVoteReveal` の Phase 2 で `<StepOneShot hidePoints />` として渡し、投票No.1決定パターンの大賞演出からのみ pt 表示を消す。direct パターン (No.1発表) は従来通り pt 表示。

(v2.8.133 — 表彰CG 投票演出 タイポ/レイアウト調整。①**フォントを Titillium Web に統一**: CG 内の数字 (カウントダウン / Vote-reveal の票数) と Q バッジを全て `Titillium Web` (Google Fonts) に変更。`index.html` で wght 400/600/700/900 + ital 700 をロード。Q はイタリック (`fontStyle: italic`) で award 風の動きを加味。 ②**右パネル 3 列レイアウト**: 旧 [Q + タイトル スタック / 質問] 2 列構成を、`[質問 縦書き] [Q (中央上下中央)] [タイトル 縦書き]` の 3 列に再編。Q は flex 親の `alignItems: center` で**上下中央寄せ**になり、最優秀タイトルと「ふさわしいのは」質問の間に視覚的に配置される。 ③**長文時の長体スケール**: 新規 `VerticalText` コンポーネント + `TitleBand` の長文判定で、テキスト文字数 × fontSize から自然高さを概算し、maxHeight を超える場合は `transform: scaleY(0.62〜1)` で縦方向に圧縮 (長体)。`font-feature-settings: "palt" 1` も同時に適用してプロポーショナル化。レイアウトの破綻を回避。 ④**Q 切れ修正**: Q の `padding: 12px 14px 18px` で上下に余白を確保し、`drop-shadow` も切れない。 ⑤**カウントダウン円**: 位置を `right: 60 → 100` / `bottom: 36 → 50` に移動して内側寄せ、全体センタリング感を改善。数字は Titillium Web (`letter-spacing: -0.03em` + `tabular-nums`) で center 揃え。)

(v2.8.132 — 表彰CG 投票演出ブラッシュアップ (4 点)。①**右パネル レイアウト整理**: Q バッジ + 賞タイトル + 質問文の 3 要素を「[Q] (上) → [タイトル縦書き帯] (下) を縦スタック / その左に [質問文 縦書き]」の 2 列構成に再編。Q が見切れない、タイトルとセットで視認しやすい配置に。 ②**オレンジ廃止 → アワード金基調**: タイトル縦帯を `linear-gradient(180deg, rgba(38,30,16,0.97), rgba(18,12,5,0.98))` の暗金背景 + 2px ゴールド枠 + 外側 2 重ホエアライン + 上下ゴールドキャップ + 内側ホエアライン + ゴールドグラデのテキスト (drop-shadow) に。フォントは全て `Noto Sans JP` (ゴシック体) で統一、`Noto Serif JP` / `Bebas Neue` 残存箇所も全て差し替え。 ③**カウントダウン数字を密に**: `SlideDigit` の `gap: 0` + `width: fontSize * 0.56` (旧 0.62) に詰め、`letter-spacing: -0.04em` + `font-variant-numeric: tabular-nums` で桁間の隙間を消去。フォントを Bebas Neue → Noto Sans JP に。 ④**Vote-reveal ランダム数字のカクツキ / レイアウト揺れを修正**: 数字ピルを `width: 360px` 固定 + `min-width: 3.6ch` で**レイアウト ガチャツキを排除**。ランダム フェーズは `setInterval(180ms)` のジャンプ表示を廃止し、`requestAnimationFrame` で常時 lerp (係数 0.18) してロール表示。280ms ごとに新しい target をサンプリングして滑らかに移行。

(v2.8.131 — 表彰CG 投票演出を再々設計 + Poll UI 質感向上 + カウントダウン仕様調整。①**Poll の見た目を全面ブラッシュアップ**: 多層フレーム (`#FFE8A8 → #E8C56C → #9E7B2E` のゴールド グラデ + 内外 4 層 ホエアライン + 4 隅オーナメント + ドット装飾)、3 択カードに 96px の六角形バッジ (グラデ + 内側エンボス) + グラスモーフィズム背景 + 内側ハイライト + ラジアル スポット、Q を `Noto Serif JP` 130px ゴールドグラデ + drop-shadow に。オレンジ縦帯タイトルは内側ハイライト + ゴールド エッジ + 上下キャップ。背景は深い濃紫 → 漆黒 + 床リフレクション + ボケ粒子 (`pollBokeh`)+ 左右斜光ビーム (`pollRayDrift`)。 ②**カウントダウン**: 丸サイズを **210px 固定** (ラスト 5 秒も同サイズ) に変更。ラスト 5 秒は数字フォントを 140→**175px** に拡大 + halo glow + パルス、丸自体は伸縮しない (位置維持要件)。プログレス アーク 5px + 外周ホエアライン 2 重 + 内側エンボス。 ③**Vote-reveal を「数字のみ」に再設計** (棒グラフ廃止): Phase 0 = 3 枚の写真カード + 名前 + Bebas Neue 96px の**ランダム変動数字** (180ms 周期)、Phase 1 = TAKE で実値に easeOutCubic で 2.2s カウントアップ、Phase 2 = 既存 `StepOneShot` (classic/shards/spotlight/slit) に委譲して通常の大賞 1S 演出を再利用 (`cue.oneshotStyle` を `CGSequence` から prop で受け渡し)。No.1 カードを別系統で組まず、表彰CG 全体で一貫したフルスクリーン演出に統合。 ④**Vote パターンでも StyleRow 表示**: 大賞 1S 演出のスタイル選択 (Classic/Shards/Spotlight/Slit) を vote パターン時にも有効化。)

(v2.8.130 — 表彰CG 投票演出 ゼロベース再設計 + カスタマイズ撤廃 + 余興移設。①**Vote-reveal を「Theatrical Reveal」に全面刷新**: 棒グラフ + ラベルを廃止。3 枚の写真カードを舞台に並べ、各カードの**背後から金色の光柱が伸び上がる**演出 (Phase 1=2200ms cubic-bezier、各カード上に小さな数値ピル)。背景は深いバーガンディ → 黒のステージ + 上からの円錐スポット (svSpotPulse) + 床のリフレクション + ゴールド粉雪粒子 (svParticleFloat、680px 上昇 + drift)。Phase 0 はランダム揺れで光柱が短く揺らぐ。Phase 2 で敗者カードがフェード沈下 (translateY+60px / opacity 0)、勝者を `WinnerOverlay` が引き継いで中央 480×480 大写し + 後光 (conic-gradient 16 セクター 30s 回転) + ゴールド名前 96px (svWinFadeUp/svWinPhoto/svWinHair の段階アニメ)。 ②**Poll カウントダウン UX 修正**: ラスト 5 秒の中央巨大表示を撤回し、**右下の位置を維持したまま 140→200px に拡大 + 強い赤いハロ + svLast5Pulse パルス**でその場で強調。`SlideDigits` の `minDigits` を 1 に変更し、1 桁時 (9 秒以下) は `09` ではなく `9` の単桁表示に。`LIVE CAM` ラベル文字も削除。 ③**過去のカスタマイズ機能を全撤廃**: `ModuleConfigEditPage.tsx` (送出モジュール構成エディタ) を削除、App.tsx のルート `/event/:id/oneshot/modules` を撤去、EventEditorPage の「下位置CG モジュール構成」セクション (JSON エクスポート/インポート/プリセット復帰ボタン) を全削除。`useEventModuleConfig` は互換性のため残存だが、常に `createDefaultEventModuleConfig()` を同期返却するスタブ化。`fetchEventModuleConfig` / `saveEventModuleConfig` / `useSaveEventModuleConfig` は廃止。サーバー側の `module_config` カラムと PUT エンドポイントは温存するが、UI から到達不可能。 ④**余興ポールを Dashboard から ControlPage に移設**: Dashboard ヘッダーの「余興ポール」ボタンを削除し、`ControlPage` の `CategoryPanel` 末尾に**部門一覧と同じ並びで「余興 (3 択ポール)」セクション + 「余興ポール を開く →」ボタン**を追加。ボタン押下で `/standalone-poll/event-{eventId}` にナビゲートし、event ごとに独立した room (`event-{id}`) で運用可能。)

(v2.8.129 — 表彰CG 投票演出のリファイン (4 点)。①**Poll レイアウト刷新**: ユーザー指定のモックアップに準拠して大改造。左 1380×800 の大型カメラ枠、右パネルは Q 大文字バッジ + 賞タイトル (オレンジ垂直帯, 縦書き) + 質問文 (縦書き)。下部 3 択カラー帯は**カメラ幅と揃え**右パネル下にカウントダウン (140×140 円) を配置。ラスト5秒は中央巨大表示 (`pollLast5Pulse`/`pollLast5Halo` keyframes)。 ②**TOP3 順番発表 + ランクバッジ撤去**: vote パターンの初回 TOP3 (poll 前) は従来通り 3→2→1 の stagger 順番発表に戻し、poll 経由の自動 top3 復帰時のみ overlap 一気切替 (cue.revealPhase=1 を marker に使用)。1/2/3 のランクバッジ (76px) は vote パターンでは非表示 (`hideRankBadge` prop)。 ③**Vote-reveal をアカデミー賞風フォーマル演出に全面刷新**: 派手な原色 (青/赤/緑) パーティクル + スキャンライン + 放射ビームを全廃。黒地 + 控えめな中央スポット + 細い 1px ゴールドヘアライン + 4 隅装飾 (薄)。バーは細身ゴールドグラデ (`rgba(245,215,110)→rgba(120,95,42)`) + 縦の薄いハイライト 1 本のみ。数値ラベルは Bebas Neue で控えめなフェード、`Noto Serif JP` を採用してクラシカルな厳粛感。 ④**大賞フルスクリーン (GrandWinner) 刷新**: 4 段ステージング (賞名 → "受賞者は…" 中間テキスト → 写真 fadeIn → ヘアライン区切り → 名前)。conic-gradient 回転枠 / 紙吹雪 / 4 隅星装飾を全廃。1px のシンプル金枠 + 静的 spot + Noto Serif JP 96px のミニマル組版。)

(v2.8.128 — 表彰CG 投票パターン UX 刷新 (7 点) + 余興用 3 択 Standalone Poll を新設。①**Poll 画面リデザイン**: オールスター感謝祭風レイアウトに刷新。中央 1300×720 の大型カメラ合成 PinP 枠 (太いゴールド枠 + 4 隅装飾 + 外側ダブルライン + ハロ)、上部に REAL-TIME VOTE chip + 賞タイトル (ゴールドグラデ) + 質問文、下部に TOP3 の 3 択カラーパネル。背景は **賑やかな award 演出**: 中央スポットライト + 斜め光線 (回転) + 80 個のキラキラ confetti (`pollSparkle` keyframe) + 上下ゴールド帯。カメラ枠内は CSS mask (`mask-composite: exclude`) で**くり抜いてアルファ透過**、OBS browser source で実映像をキー合成可能。②**スライド型カウントダウン**: 数字が変化するたび旧桁が下にワイプアウト + 新桁が上から滑り込む `pollDigitIn` / `pollDigitOut` keyframes (520ms cubic-bezier)。ラスト 5 秒は通常の右上円 (220×220) から**中央の巨大表示** (320×320 円 + 220px 数字 + 拡散ハロ `pollLast5Halo` + パルス `pollLast5Pulse`) にビジュアルが切り替わる。 ③**Vote-reveal 棒グラフ豪華化**: メタリックゴールド/ブルー/レッド/グリーンの 3D 風グラデーション棒 (`linear-gradient` + inner shadow + 縦ハイライト) + grow 中の `voteBarShine` スキャンライン + 棒上端から立ち上がる火花パーティクル (`voteSparkRise`)。背景に放射 16 ビーム (回転) + 中央スポットライト + ゴールドパルス。 ④**自動 GRAND PRIX 遷移**: grow フェーズ (phase 1) 完了 ~2.8s 後に operator が TAKE 不要で自動的に大賞フルスクリーン (phase 2) へ進行。 ⑤**GRAND PRIX フルスクリーン刷新**: 初期フラッシュ → SVG フレーム描画 (`gpFrameDraw`) → 「◆ GRAND PRIX ◆」タイトル スライドイン → 写真 ズームイン (`gpPhotoZoomIn`、回転 conic-gradient 枠 + 4 隅星装飾) → 名前 (110px のゴールドグラデ + `gpNameGlow` パルス) → 60 個の紙吹雪 (`gpConfettiFall` で `--drift` 横揺れ含む)。 ⑥**投票後 TOP3 のシンプル化**: `award_pattern === 'vote'` の部門で poll → 自動 top3 復帰時、`StepTop3` の `hidePoints` モードでポイント表示を非表示 + 3 枠を同時にオーバーラップ切替 (stagger 廃止)。 ⑦**投票数入力の自由入力**: `VoteSettingsDialog` の input を `type="number"` → `type="text" inputMode="numeric"` に変更し、空文字 / 任意の入力を許容 (regex `[^\d]` で数字のみフィルタ)、フォーカスで全選択。 ⑧**余興 Standalone Poll (新設)**: 表彰DB から完全独立した「3 択 → No.1」フローを Dashboard から起動可能に。新ルート `/standalone-poll/:room` (operator, 認証必須) + `/awards/output/standalone-poll/:room` (出力, 認証なし)。operator UI でタイトル / 質問文 (JA/EN) / 3 つの選択肢 (名前 / 会社 / 画像 / 投票数) を**直接入力**、画像は file 入力 → canvas で 480px に縮小 → data URL で broadcast (DB 不使用)、画像なしも成立。**フロー**: idle → TAKE → poll (30s カウントダウン) → 自動 reveal (棒グラフ shake → TAKE で grow → 2.8s 後に自動 winner) → GRAND PRIX。`StandalonePollCG` が synthesize した CgCategory/CgMappedEntry[] を介して既存 `StepPoll` / `StepVoteReveal` を再利用 (DRY)。**Server**: `?pollRoom=xxx` クエリで /awards namespace に接続したクライアントを per-room ルームに join、`standalonePoll:set` / `standalonePoll:sync` / `standalonePoll:clear` を in-memory `standalonePollByRoom` Map で per-room ブロードキャスト (DB 永続化なし、ad-hoc 用途)。`pollRoom` は `[a-zA-Z0-9_-]` のみ、最大 64 文字に正規化。)

(v2.8.127 — Hotfix: v2.8.125 で表彰CG operator が React error #310 (Rendered more hooks than during the previous render) でクラッシュしていた問題を修正。`CGSequence` の `voteWinner` 用 `useMemo` を `if (stepKey === 'idle') return null` の**後**に置いていたため、idle 時とそれ以外で hooks 数が変化。早期 return より前に移動して Rules of Hooks 違反を解消（CLAUDE.md v2.8.81 と同パターン）。

(v2.8.126 — 下位置CG カウントダウン アニメーション全面刷新 + 00:00 カットアウト化。①**3D シリンダー方式を撤回、スロットマシン式の縦スライドに変更**: v2.8.121〜124 の 10 面シリンダーは静止時/動作時とも違和感があり「ダサい」とのフィードバックを受け廃止。新桁は `translateY(100% → 0)` で下から滑り込み、旧桁は `translateY(0 → -100%)` で上に抜ける + opacity フェード。easing は `cubic-bezier(.22,.8,.36,1)` (in) / `cubic-bezier(.4,0,.68,.35)` (out) で滑らかに加速/減速。Digit に `slides: Slide[]` state を持たせ、value 変化で新スライドを push → 520ms 後に古いものを slice。 ②**00:00 はカットアウト**: フェード演出 (`.oscg-countdown--fade` の 1.2s opacity transition) を撤去。`done` 検知から 600ms (00:00 をしっかり見せる時間) ホールド後に `hidden=true` で **return null** → CSS フェードなしの即時カットアウト。 ③CSS 上の cylinder 関連 (`perspective`, `transform-style: preserve-3d`, reel transform, 上下マスク, leaving keyframes) を整理。digit container は背景グラデ + gold border + inner shadow を踏襲しつつ単純な 1 セルに。font-size を 0.62 → 0.66 に微増。)

(v2.8.125 — 表彰CG (ranking) に演出パターン 2 種を追加: 「No.1発表」(direct, 既存フロー) と「投票No.1決定」(vote, 新規)。)

(v2.8.124 — 下位置CG カウントダウン: ①**00:00 フェードアウト不具合修正**: v2.8.122 で導入したフェードロジックが useEffect の deps に `parts` (毎 250ms 新規オブジェクト) を渡していたため、cleanup が毎回 `setTimeout(1000ms)` をキャンセル → 永久に発火しなかった。`done = !!parts?.done` をスカラ依存にして修正、`fadingRef` は不要になったので撤去。②**動きの安定化**: reel の transition を `620ms cubic-bezier(.34, 1.4, .5, 1)` (1.4 オーバーシュートで bouncy) → **`480ms cubic-bezier(.32, .72, .35, 1)`** (上品な ease-out) に変更。秒桁が毎秒鳴っても落ち着いた印象に。③**直前桁にフェードアウト**: `.oscg-digit-face--leaving` クラスで `opacity 1 → 0` のキーフレーム (480ms) を発火、直前桁が幾何学的に見える位置にいても視覚的には消える → 静止時 1 桁、回転時のみ 2 桁が一瞬重なる挙動。Digit の unmount 遅延も 700ms→**520ms** に圧縮。④**TAKE を 1SHOT 専用化**: `SendActionRow` を 1SHOT タブ内に移動 (旧版は常時表示で両タブ共通)、カウントダウンは `CountdownControlPanel` 内の ON/OFF トグルで独立制御。これで 1SHOT TAKE がカウントダウンと干渉しなくなる。⑤**タブ名「送出」→「1SHOT」**にリネーム。

(v2.8.123 — 下位置CG カウントダウン: 静止時に隣接桁が覗いていた問題を修正。Digit の 10 面シリンダーを「現在桁 + (変化中だけ) 直前桁」の 2 面のみレンダリングに変更し、reel 自体は従来通り `rotateX(-current*36deg)` で回転して滑らかなアニメを保つ。)Digit の 10 面シリンダーを「現在桁 + (変化中だけ) 直前桁」の 2 面のみレンダリングに変更し、reel 自体は従来通り `rotateX(-current*36deg)` で回転して滑らかなアニメを保つ。`Digit` に `useState(current/previous)` を持たせ、value 変化で previous=旧 current / current=新 n に切替 → 700ms 後に previous を unmount。これで停止時は完全に 1 桁のみ表示。隣接桁を物理的に描画しなくなったため、digit container の上下黒マスクを 42%→**22%** に縮小、グラデも 95%→80% 不透明に弱めて軽い vignette のみに（動く数字を隠さない）。

(v2.8.122 — 下位置CG カウントダウン UX 改善 (5 点)。①**数字の上下重なり解消**: digit container を w 96→**116**px / h 132→**176**px に拡大、glyph を `0.82*h → 0.62*h` に縮小、上下の黒マスクを 28%→**42%** + グラデ強化 (95% 不透明 → 0%) して隣接桁の覗き込みを完全に隠す。 ②**コントロール UI をタブ化**: `OneShotControlPage` の controls 列を「送出」(Module + Ticker) / 「カウントダウン」の 2 タブに分割、カウントダウン ON 時はタブ右にゴールド点滅 dot。TAKE/CLEAR (`SendActionRow`) は両タブ共通で常時表示してアクセス維持。 ③**分秒指定で開始**: `CountdownControlPanel` に開始モード切替 (`指定日時` / `分秒指定`) を追加。`分秒指定` モードでは「今から M 分 S 秒」を入力 → 「開始」ボタンで `target = now + duration` をセット (同時に countdownOn=true)。30s/1m/3m/10m のプリセット ボタンも併設。`指定日時` の +1m〜+60m プリセットも同様に countdownOn=true で発火するよう統一。 ④**枕詞にベース**: `.oscg-countdown-prefix` に半透明黒の pill 背景 (`rgba(8,11,16,0.72→0.88)` + `border 1px solid var(--line)` + `border-radius: 999px` + inner glow) を追加し、明るい背景でも視認性確保。 ⑤**00:00 でフェードアウト**: 到達後 1 秒ホールド → 1.2 秒で opacity 0 (`.oscg-countdown--fade` クラス)。target 再設定で復活。

(v2.8.121: 下位置CG に「アワードまであと〇〇分〇〇秒」カウントダウンテロップを追加。3D 立体数字 (10 面シリンダー reel) がくるくる回り、lower-third / ticker と独立した CG レイヤーとして重ねられる。位置 (X/Y %) ・サイズ (scale) ・枕詞 (JA/EN) ・目標日時を operator UI から自由に設定可能。)ゴールド基調の 3D 立体数字 (10 面シリンダー reel) がくるくる回り、lower-third / ticker と独立した CG レイヤーとして重ねられる。位置 (X/Y %) ・サイズ (scale) ・枕詞 (JA/EN) ・目標日時を operator UI から自由に設定可能 (+1m/+5m/+15m/+30m/+60m のクイック プリセット付き)。①**DB**: migration 087 で `awards_oneshot_cue_state` に `countdown_on` / `countdown_target` / `countdown_prefix_ja` / `countdown_prefix_en` / `countdown_x` / `countdown_y` / `countdown_scale` を追加。 ②**CG レンダラ**: 新規 `CountdownCG.tsx` + `styles/countdown.css`。各桁は `perspective:1400px` の縦シリンダー (10 面ポリゴン) で `rotateX(-n*36deg)` により目標数字を選択、`transition: transform 620ms cubic-bezier(.34,1.4,.5,1)` でくるりと回る。数字面はゴールドのリニアグラデーション (`#f8efd8 → #e8c97c → #b89043`) + アワードCG 共通の `var(--gold)` `var(--line)` `var(--font-jp)` トークン参照。上下に黒グラデの「窓ガラス」グレアを重ねシリンダー感を演出、枕詞は `var(--gold-bright)` + `letter-spacing 0.18em` で固定、コロン `:` は `oscg-cd-pulse` で 1s 周期に瞬く。 ③**Operator UI**: 新規 `CountdownControlPanel.tsx` を `OneShotControlPage` 送出列に追加。ON/OFF トグル + datetime-local 入力 + 5 プリセット (+1m/+5m/+15m/+30m/+60m) + 枕詞 JA/EN テキスト + X/Y/サイズ スライダ&数値入力 (X:0-100%, Y:0-100%, scale:0.3-2.5)。設定変更ごとに `sendCue` で broadcast → 全 preview + output URL に即反映。 ④**伝搬**: `OneShotCueState` に 7 フィールド追加 + `useOneShotCue` defaults + sync で正規化、`OneShotStage` が `countdown` prop を受けて `<CountdownCG>` を絶対配置で重ねる、`OneShotControlPage` の 5 ヶ所の Stage 呼出全てに `countdown={countdownStage}` を配線、`OneShotOutputPage` は cue から組み立てて pass-through。 ⑤**Server**: `socket.ts` の `oneshot:set` / `oneshot:nextSet` / 初期 sync で countdown 7 フィールドを persist + broadcast。

(v2.8.120: SelectItem value="" が Radix UI で throw する根本バグを修正（TaskDialog・StudioBookingDialog）、PageErrorBoundary に componentDidCatch ログを追加)

(v2.8.113: 案件分類を手動選択化 + 発番後の A↔B 切替): これまでは GLS 発番時に `project_type` から自動で A/B を決定し `gls_number` の prefix に焼き付け、一覧の振り分けも `gls_number LIKE 'GLS-A%'` で行っていた。発番後に `project_type` を変えても振り分けに反映されない / `project_type` 未指定だと無条件で GLS-B 側になる等の意図せぬ挙動が出ていたため、分類を**明示選択**に変更し、発番後の A↔B 切替もできるようにした。①**DB**: migration 086 で `projects.gls_category CHAR(1) CHECK IN ('A','B')` と `previous_gls_numbers JSONB` を追加。既存 row は `gls_number` の prefix からバックフィル (`GLS-A* → 'A'` / `GLS-B* → 'B'`)。`idx_projects_gls_category` も追加。 ②**Server**: `sequence.service.ts` の `generateGlsNumber(projectType)` を `generateGlsNumber(category: 'A'|'B')` に変更し、`CATEGORY_A_TYPES` / `getGlsCategory()` を廃止。`project.service.ts` の `create()` / `update()` で `gls_category` を受け取り保存 (ヨミ段階のうちは PUT で変更可、発番後は無視)。`issueGls()` は `project.gls_category` を見る (未設定なら 400)。新メソッド `changeGlsCategory(id, newCategory)` を追加: 発番済の場合は新カテゴリ側 sequence から採番し直し、`projects.gls_number` 更新 + 旧番号を `previous_gls_numbers` に push + `episodes.episode_code` の `{旧GLS}` 部分を `{新GLS}` に書換 + `qsheet_documents.episode_code` も同様 + BOX 両フォルダ (社内限り / 社外共有可) を新 GLS 番号にリネーム。一覧フィルタは `gls_number LIKE` を `gls_category =` に置換。新ルート `PATCH /projects/:id/gls-category` (manager 権限)。 ③**Client**: `ProjectFormPage` の「基本情報」に案件分類トグル (スタジオ / ビジネス) を追加。新規作成時は必須バリデーション、`project_type` を選んだとき未選択なら推奨値を自動セット (ユーザー上書き可)。GLS 発番済の場合は読み取り Badge + 「分類を変更…」ボタン → 確認ダイアログで「採番し直し + episode_code / BOX フォルダ自動更新、既発行 PDF は変わらない」旨を明示。 ④**既発行 PDF**: revenue PDF filename は v2.8.107 で live `gls_number` で都度組み立て直しに済んでおり、切替後に再ダウンロードされる PDF は自動的に新 GLS 番号を反映する。 ⑤**`getProjectCategory(projectType)` (`client/src/types`) は廃止せず**、新規作成時のデフォルト推奨値生成用ヘルパーとして残置 (発番フローやカテゴリ判定の真実源は DB の `gls_category`)。

(v2.8.112: 音声サポート画面 OA / NEXT 横並び大画面化): ユーザー要望「次のキューもできるだけ大きく、NEXT / OA を横並びにしたい」に対応。`AudioSupportPage` を縦積み (現在のキューバナー → 差分チップ → Ch グリッド) から **左右 2 カラム** (lg 以上で横並び、それ以下で縦積み) に再構築。①新規 `CueColumn` コンポーネントが OA (赤) / NEXT (黄) を共通ロジックで描画、各カラム上端にキュー番号 + ラベル + バッジ、下に同じ Ch グリッド (auto-fill 180px)。②NEXT カラムの `ChCard` には `diffMap` から `turn_on / turn_off / standby / person_change / mic_change` を引いて 4px のリングと「ON へ / 人物交代 / マイク変更」等のフローティングバッジを表示。OA カラムは差分なしで現在のセル状態のみ。③下部 footer に差分カラーレジェンドを追加。④`min-h-screen` → `h-screen + overflow-hidden` に変更しページ全体を 1 画面に収め、各カラム内でのみスクロール可能に (副調整室の常時表示モニター用途を想定)。

(v2.8.111: Qシート音声ブロック拡張 (マイク香盤 + 音声サポート画面 Phase 1+2) を dev に統合。 音声ブロックを「BGM/SE 用既存 `audio`」と「マイク香盤専用 `audio_mic`」の 2 系統に分離。`audio_mic` セルは `{ assignments: [{ ch, person, micType, state: 'on'|'off'|'standby' }] }` の構造化データで、`masters.micChannels[]` (Ch番号 + ラベル) と `masters.micTypes[]` (SM58 等) を optional 追加。SQL マイグレーション不要 (JSONB)。①**エディタ**: 新規 `MicAssignmentCell.tsx` (3状態トグル + 出演者/マイク種類 datalist + 「前cueから継承」ボタン)。サイドバーマスタータブに「マイクCh」編集 UI。`CueTable` の `findPrevAudioMicAssignments(si, ri, blockId)` で同一 section → 直前 sections を末尾から遡る。`CueRowMobileEditor` に `MicAssignmentMobilePanel` を追加してモバイル対応。②**音声サポート画面**: 完全パブリック URL `/qsheet/audio/:docId` を新設、認証不要 GET `/qsheet/documents/:id/public-audio` (シナリオ本文・broadcast_date は返さず `X-Robots-Tag: noindex` を付与) + Socket.IO `/qsheet` の `cue:sync` 購読。Ch グリッド (auto-fill 220px、Roboto Condensed) で ON=赤・STBY=黄・OFF=灰の状態を表示、上部に「次cue差分」チップ (turn_on/turn_off/standby/person_change/mic_change の色分け)。③**URL共有 + QR**: 新規 `AudioShareDialog` (`qrcode` 1.5.4 を client-qsheet に追加) で 256x256 QR + URL コピー + 新タブで開く。EditorPage ヘッダーに「音声共有」ボタン (audio_mic ブロック存在時のみ表示)。④**回帰防止**: RundownPage / PreviewModal / pdf.routes は本マージでは触らず、`extractCellText` / CSV stringify に `audio_mic` 専用分岐を追加済 (`[object Object]` 出力防止)。Phase 3 (PDF 列追加 / 出演者匿名化) は別途検討。

(v2.8.110 — 機材一覧で **「機材登録 / 表編集」ボタンが時々消える** 問題と、**表が稀にエラーで出ない** 問題を修正。①**ボタン消失の根本原因**: `useAuth` (`shared/src/client/createAuthHook.ts`) が `permissions` を初期値 `{}` で起動し `/users/me/permissions` API レスポンスを待つ間、`hasPermission('equipment', 'editor')` が false を返して `canEdit = false` → 編集ボタンが非表示。さらに permissions API が遅延・失敗しても silent catch (`.catch(() => ({ data: { data: {} } }))`) で `{}` に上書きされ、cached 状態を温存できなかった。 **修正**: a) permissions を **localStorage `gmo_onair_permissions` にキャッシュ** し `useState` 初期化で同期復元 → リロード時に即時に編集ボタンが表示される、b) permissions API 失敗時は **キャッシュ値を温存** (silent fallback で `{}` 上書きしない、`console.warn` のみ) → 一時的なネットワークエラーで権限が消えない、c) logout 時に `gmo_onair_permissions` も削除。 ②**表エラーの耐性向上**: `shared/src/client/queryClient.ts` のグローバル `retry: 1` (= 計 2 試行) を **5xx / network 系のみ最大 2 回 retry (= 計 3 試行) + 指数バックオフ (1s, 2s, 4s, 最大 8s)** に強化。4xx (権限/認証エラー) は即時表示で UX を損なわない。これで `/equipment/items` がコールドスタートやネットワークブリップで 1 度失敗しても自動でリトライして表が描画される。 ③**影響範囲**: shared なので全 7 client (案件管理 / Qシート / 機材管理 / インタラクティブ / 技術資料 / ライブ / 表彰CG) に同時に効果が及ぶ。)

(v2.8.109 — 固定資産コードのユニーク制約 (`uq_fixed_asset_code`) を撤廃。ユーザー報告「固定資産コードはユニークではないです！」(v2.8.108 で事前検証エラーを返してしまったが、実は業務実態として 1 つの固定資産コードを複数機材で共有するケースがある)。**修正**: ①migration `085_drop_uq_fixed_asset_code.sql` で `DROP INDEX IF EXISTS uq_fixed_asset_code` (045 で導入した部分ユニーク index を撤去)、検索性のため非ユニークの `idx_fixed_asset_code` (同じ部分述語) に置換。 ②`server/src/contexts/equipment/routes/excel.routes.ts` から v2.8.108 で追加した重複検証 (faCodeMap 構築 + a) DB 既存重複 b) ファイル内重複 のチェック)、catch 句の uq_fixed_asset_code 翻訳メッセージを撤去。これで Excel インポートで同一固定資産コードの複数行が問題なく登録できる。)

(v2.8.108 — 機材 Excel インポートで `uq_fixed_asset_code` ユニーク制約違反が DB エラーのまま投げ返される問題を修正。ユーザー報告「機材登録すると `duplicate key value violates unique constraint "uq_fixed_asset_code"` エラー」に対応。**原因**: import-preview/import エンドポイントが `eq_code` の重複チェックは事前に行っていたが、`fixed_asset_code` の重複は事前検証していなかったため、INSERT 時に DB の部分ユニークインデックス (`uq_fixed_asset_code` — fixed_asset_code IS NOT NULL かつ deleted_at IS NULL の機材で固定資産コードがユニーク) が違反を投げてトランザクションが ROLLBACK される。エラーメッセージも生の Postgres 出力で操作者には何が原因か分からなかった。 **修正**: ①`import-preview` で `equipment_items` から `fixed_asset_code` 列も読み込み、`faCodeMap` (fa_code → 既存 item id) を構築。 ②各行の検証時に a) 「他の機材で既に使用されている fixed_asset_code」と b) 「同一インポートファイル内での重複 (seenFaCodeInFile マップ)」を検出して errors[] に追加 → preview の summary.error にカウントされ、ユーザーは commit 前に修正可能。 ③`import` エンドポイントの catch 句で `err.message.includes('uq_fixed_asset_code')` を検知した場合のみ「固定資産コードが既存の機材と重複しています…」という日本語メッセージに翻訳して 409 で返す (race condition 等で事前検証を擦り抜けた場合の保険)。重複モード ('error'/'update'/'skip') が 'update' の場合は同一 item への再代入なので errors に積まない。

(v2.8.107 — 請求書/見積書 PDF ファイル名が project の GLS 番号変更に追従しない問題を修正。ユーザー報告「DB の GLS ナンバーを DB 側で変更した際に、請求書の吐き出し名前がその変更に紐づかない」に対応。**原因**: `revenues.billing_key` は revenue 作成時のスナップショット (例: `GLS001-001-1`) で、project の `gls_number` を後から DB 更新しても自動連携されない。PDF エンドポイント `/revenues/:id/pdf` の filename がこの billing_key そのままを使っていたため、古い GLS のファイル名で出力されていた。 **修正**: `server/src/contexts/finance/routes/revenues.routes.ts` line 144 で、SELECT 時に joins している `p.gls_number` (live) を使ってファイル名を組み立てる。billing_key の最初のダッシュまで (例: `GLS001`) を live `gls_number` で置換し、エピソード/税枝番のサフィックス (例: `-001-1`) は保持。GLS 未発番 (gls_number=null) の場合は billing_key そのまま (フォールバック)。`/^GLS\d+$/i` の正規表現で billing_key の prefix が GLS 形式の場合のみ置換するため、別形式の billing_key (販管費等) には影響なし。PDF の**コンテンツ内表示** (右上の `{GLS}　{プロジェクト名}` ヘッダー) は元から `data.gls_number` (live join) を使っていたため修正不要。 **残課題**: revenue/purchase の `billing_key` 自体は依然 snapshot のままなので、画面上の表示は古い GLS のまま。これを根本的に直すには project の GLS 更新時に関連 row の billing_key + episode_code をカスケード更新する必要があり、より大きな変更となるため別バージョンで対応予定。

(v2.8.106 — 売上明細編集ダイアログの「項目追加」「料金表から追加」「シミュレーション」「全体値引き」ボタンを PC view でも表示。ユーザー報告 (スクリーンショット添付) 「ここで明細の項目追加ができるようにしたかったのですが」(売上明細編集ダイアログの PC 版に項目追加ボタンが見えなかった) に対応。**原因**: アクションボタン群 (`<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">`) が**モバイル専用セクション** (`<div className="sm:hidden">`) の内側に配置されていたため、PC (sm 以上) ではアクセス不能だった。 **修正**: アクションボタン群を PC table とモバイル card の**両レイアウト共通**の位置 (両方の `</div>` の外側、items 親 div 内) に移動。これで PC でも「項目追加」「料金表から追加」「シミュレーション」「全体値引き」の 4 ボタンが表示される。

(v2.8.105 — Phase C: 税込/税抜ヘルパー (主要な金額入力に適用)。ユーザー要望「すべての領域の金額入力に税込？税抜？を尋ねるヘルパー (税込なら 10%/8%/非課税 → 税抜計算)」に対応。①**新規共通コンポーネント `shared/src/client/ui/tax-aware-amount-input.tsx`**: a) `TaxAwareAmountInput` (Input + ヘルパーボタン込み版)、b) `TaxHelperButton` (ボタン単独版 — 既存の `<CurrencyInput>` 等カスタム input と組み合わせて使う)。クリックで「税込/税抜」確認 → 税込なら 10% / 8% / 非課税 を選択 → 税抜金額に四捨五入で換算 → `onResult` に返す 2 ステップ ダイアログ。 ②**適用箇所** (主要な金額入力): a) BusinessProjectView 売上明細ダイアログ (PC table + モバイル card) の単価、b) BusinessProjectView インライン編集 (Phase B v2.8.104) の単価、c) PurchaseListPage 仕入金額、d) SgaDialog 販管費 金額、e) RevenueListPage 売上金額 (items 空時) + 明細単価 (PC + モバイル)。 ③**仕様**: 「税抜きとして使う」を選ぶと入力金額がそのまま 税抜 として onResult に返る。「税込→税抜計算」→ 10% (×1/1.1) / 8% (×1/1.08) / 非課税 (変化なし) を選択 → 各税率での税抜プレビュー金額付きボタン → 選択で確定。**Phase C 残作業**: 機材レンタル料金、Q シート費用など他アプリ (client-equipment / client-qsheet / client-live 等) への展開は後続バージョンで継続。

(v2.8.104 — Phase B: 売上明細項目のインライン編集 (ダイアログを開かずに直接編集)。ユーザー要望「一度確定した売上明細に追加編集、削除ができる機能」のうち「明細項目をインライン編集可能に」に対応。①**新規 state**: `inlineEditId: string | null` (どの売上明細をインライン編集中か) + `inlineItems: RevenueItem[]` (編集中の items 配列)。 ②**新規 inlineSaveMutation**: 既存 revenue の他フィールド (tax_category / 計上日 / 請求日 / 支払期日 / notes / subtitle 等) を保持しつつ items のみ差し替えて PUT。amount は items の合計で再計算。 ③**UI**: 各売上明細カードの items テーブル上部に「明細を編集」ボタン (編集モード切替) を追加。編集モードでは項目名/数量/単価を `<Input>` 化、各行に削除アイコン、テーブル下に「行追加」ボタン + 合計表示、上部に「キャンセル」「保存」ボタン。 ④**項目ゼロ時**: items 空の売上明細にも「明細項目を追加」ボタンを表示してインライン編集モードに直接入れる。 ⑤**金額自動再計算**: 数量 or 単価変更時に amount = quantity × unit_price を即時更新 (UI 上の合計も同時更新)。 ⑥**ダイアログ経由の編集 (鉛筆アイコン) は据置**: 計上日/請求日/支払期日など item 以外のフィールドを編集したい場合は従来通りダイアログを使用。 **Phase C** (税込/税抜ヘルパーの全アプリ展開) は後続バージョンで継続実装。

(v2.8.103 — Phase A: 支払予定日 (および請求日) 自動入力の営業日対応。ユーザー要望「支払予定日について、自動入力を機能させる際に、土日祝日の場合は、その前営業日になるようにしたい」に対応。①**新規 `shared/src/utils/businessDays.ts`**: `@holiday-jp/holiday_jp` を利用し `isBusinessDay` / `previousBusinessDay` / `nextBusinessDay` / `toLocalDateStr` / `endOfNextMonth` / `endOfNextMonthBusinessDay` を提供。土日 + 日本の祝日 (年次自動更新) を非営業日として扱う。 ②**PurchaseListPage** の役務提供完了日入力時の自動入力 (計上月 + 支払予定日 = 翌月末) を `previousBusinessDay()` で営業日調整。 ③**RevenueListPage** の案件選択時の自動入力 (請求予定日 = 計上月末、入金予定日 = 翌月末) も同様に調整。 ④**BusinessProjectView** (売上明細編集) の計上日入力時の自動入力を新規追加。請求日 (計上月末) + 支払期日 (翌月末) を営業日調整して、フィールドが空のときのみ自動入力 (上書きはしない)。説明テキストも追加。 **Phase B** (売上明細項目のインライン編集) と **Phase C** (税込/税抜ヘルパーの全アプリ展開) は後続バージョンで継続実装。

(v2.8.102 — モバイル小スケール時に下位置CG テロップ下端に白線が見える問題を修正。ユーザー報告「CG作画プレビュー画面のテロップの下にはいっている線」(スクリーンショット添付) に対応。**原因**: `.lt-panel` の `border-bottom: 1px solid var(--line)` (ゴールド `rgba(201, 169, 97, 0.45)`) が、モバイル幅 (~390px) で 1920×1080 CG をスケール (×0.20) 表示した際、1px のゴールド薄線が**サブピクセル描画で淡灰/白っぽく描画される**ため白線として誤認されていた。**修正**: `.lt-panel` の `border-bottom` を撤去。上端 `border-top: 1px solid var(--line-strong)` (85% 透過 = 濃ゴールド) + 左の gold accent (`::before`, `width: 4px`) + 4 隅の corner decoration (`.lt-corner.tl/tr/bl/br`) で囲み感は維持。実際の OBS 1920×1080 ネイティブ表示でも見た目はほぼ変化なし (元々 45% 透過の薄線だったため)。

(v2.8.101 — 全画面中も CLEAR 操作可能に: 代替キー X を追加。ユーザー報告「全画面中もテロップ制御できないと意味ない」に対応 (v2.8.100 で全画面中の Esc を skip にしたが、それだと全画面中に CLEAR できなくなる本末転倒)。**修正**: `useShortcuts` (下位置CG) と ControlPage (表彰CG) の Esc 分岐の前に「`x` / `X` キー → CLEAR」を追加。X キーはブラウザの全画面解除と被らないため、全画面中でもテロップ OFF が可能。Esc は引き続き通常モードで CLEAR、全画面中はブラウザの全画面解除のみ (CLEAR は X キーで)。`ShortcutHints` (下位置CG) と ControlPage 下のヒント表示も「`X` / `Esc` CLEAR」「`F` 全画面」に更新。MODULE 表示も `0–6` → `0–9` に修正。

(v2.8.100 — 全画面中の Esc キー競合を回避。全画面中の Esc キー競合を回避。ユーザー報告「全画面にした際に Esc を押して OFF になる、これテロップ OFF とショートカット被ってるので回避」に対応。**問題**: ブラウザの全画面解除 (Esc) と operator UI の CLEAR (テロップ/CG OFF) ショートカット (Esc) が同じキーを共有していたため、全画面中に Esc を 1 回押すと「全画面解除」と「テロップ OFF」が同時にトリガされ、画面サイズだけ戻したいだけなのに放送中の CG が消えてしまう誤動作が発生していた。**修正**: `useShortcuts` (下位置CG operator) と ControlPage (表彰CG operator) の Esc 処理冒頭に `if (document.fullscreenElement) return;` を追加。全画面中はブラウザの全画面解除に専念させ、CLEAR は発火させない。通常モードでは従来通り Esc → CLEAR で動作。

(v2.8.99 — 送出 UI ラベル「PROGRAM」→「OA」に統一。ユーザー要望「PROGRAM の表記は OA で」に対応。①ControlPage: a) ヘッダー「出力」ボタンの title attr「PROGRAM 出力」→「OA 出力」、b) 大プレビュー左上のステータスバッジ「PROGRAM · ON AIR / PROGRAM · {step}」→「OA · ON AIR / OA · {step}」、c) 右パネル StatusBar の上段ラベル「PROGRAM」→「OA」。 ②OneShotControlPage: a) PROGRAM 領域のステータスバッジ「PROGRAM · ON AIR / PROGRAM · OFF」→「OA · ON AIR / OA · OFF」、b) STANDBY 中の中央オーバーレイ「PROGRAM OFF」→「OA OFF」。 ③EventEditorPage NEXT URL section: 説明文「PROGRAM (LIVE) URL」→「OA (LIVE) URL」。コード内コメント等の非表示テキストは据置 (機能変更なし)。

(v2.8.98 — 表彰CG (ranking) に preview/take ワークフロー導入 + NEXT (送出予約) 出力 URL + 全画面ボタン + キーボードショートカット。ユーザー要望「下位置CGのようにランキングCGもプレビュー機能 (ショートカット含め)、プレビューを NEXT として URL 出力可能に、両送出 UI に全画面コマンド」に対応。①**ControlPage preview/take 化**: step / category / oneshotStyle ボタン操作を「即時 broadcast」から「local NEXT state を更新 → TAKE で broadcast」に変更。`useAwardsCue` に `sendNextCue` 追加、socket `cue:nextSet`/`cue:nextSync` を新設。NEXT サムネイル (右下、CGFrame で preview state 描画) + 専用 CategoryPanel (LIVE 中の cat に LIVE バッジ) + StepRow (LIVE 中 step に LIVE バッジ + ショートカットキー数字) + StyleRow (同) + SendActionRow (TAKE/CLEAR) + StatusBar (PROGRAM + NEXT 2 段) を再構築。 ②**ショートカット**: 0=IDLE / 1=TITLE / 2=NOMINEES / 3=RANKS5→2 / 4=BEST3 / 5=WINNER BAR / 6=ONE SHOT、Space/Enter=TAKE、Esc=CLEAR、↑↓=部門循環。 ③**NEXT 出力 URL**: a) 新規 `/awards/output/:eventId/next` (ranking) と `/awards/output/:eventId/oneshot/next` (下位置CG) を追加、副調整室の director モニター用途。`useAwardsNextCue` / `useOneShotNextCue` で broadcast を購読 → CGFrame / OneShotStage で描画。サーバー socket は in-memory `nextCueByEvent` / `nextOneshotByEvent` Map で eventId 別に保持、新規接続に push、永続化なし (operator 揮発状態をミラーするだけなので)。 b) 下位置CG 側は OneShotControlPage の preview 状態変化のたびに `oneshot:nextSet` を発火する useEffect を追加。 c) ControlPage は NEXT 状態変化のたびに `cue:nextSet` を発火。 d) EventEditorPage に「NEXT 出力URL（送出予約モニター用）」セクションを追加し、表彰CG NEXT (JA/EN/JA-EN) + 下位置CG NEXT (JA/EN) の URL をコピー/開くボタンつきで表示。 ④**全画面ボタン + F キー**: `useFullscreen` フックを新設 (Fullscreen API + F キー監視)、両 operator (ControlPage / OneShotControlPage) のヘッダー右端に Maximize2 / Minimize2 アイコン トグルボタンを配置。送出に集中できるよう全画面化可能 (sidebar / header を非表示化)。 ⑤**ラベル変更**: OneShotControlPage の「PREVIEW · NEXT TAKE」「PREVIEW · {lang}」を「NEXT · 送出予約 ({lang})」に統一。

(v2.8.97 — CG ナビゲーション/UI 名称整理: 「表彰CG (= 下部テロップ)」→「下位置CG」、「送出コントロール (= ランキング演出)」→「表彰CG」に再分離。ユーザー要望「ボタン名を 下位置CG・表彰CG に変えて (アイコンも合わせて)、送出 UI の名前も合わせて」(スクリーンショット添付) に対応。①**EventEditorPage**: 2 ボタンを a) 「下位置CG」(amber, Subtitles icon, → /event/:id/oneshot/control) と b) 「表彰CG」(red, Trophy icon, → /event/:id/control) に変更。Tv2 → Trophy で「ランキング/大賞演出」感を強化、未使用の Tv2 import を削除。 ②**OneShotControlPage** (= 下位置CG オペレーター): a) ヘッダータイトル「表彰CG」→「下位置CG」、b) 出力 URL の title attr「表彰CG 出力 (JA/EN)」→「下位置CG 出力」、c) 表彰CG (ranking) ジャンプボタン「ランキングCG」→「表彰CG」+ Tv2 → Trophy アイコン。 ③**ControlPage** (= 表彰CG オペレーター): a) ヘッダー左上に Trophy アイコン + 「表彰CG」タイトルを追加 (従来は CONTROL ラベルのみ)、b) 下位置CG ジャンプボタン「表彰CG」→「下位置CG」 (Subtitles icon は据置)。 ④**ModuleConfigEditPage**: ヘッダー「表彰CG モジュール構成」→「下位置CG モジュール構成」、tooltip も同様に。 ⑤**EventEditorPage URL section**: 「表彰CG 出力URL（下部テロップ）」→「下位置CG 出力URL（下部テロップ）」、説明文も「表彰CG オペレーター」→「下位置CG オペレーター」、「ランキングCG とは別レイヤー」→「表彰CG (ランキング/大賞演出) とは別レイヤー」。 ⑥**ModuleConfigSection** (= 下位置CG 用モジュール構成編集): h3 ラベルを更新。アプリ全体の Sidebar / Header / Login / Dashboard 上の「表彰CG」(amber Trophy icon) は umbrella 名としてそのまま据置 — このアプリが含む 2 つのサブ機能 (下位置CG / 表彰CG) を束ねる呼称。

(v2.8.96 — v2.8.95 の不完全修正を完全修正。CG output URL のログイン不要アクセスを実装。**v2.8.95 の問題**: `router.use(['/events', '/box-backups'], requireAuth, ...)` のような path-scoped 配列形式に変更したが、`/events` プレフィックスは `/events/:id/oneshot/output` (oneshot.routes.ts 担当の public path) や `/events/:eventId/cue` (cues.routes.ts 担当の public path) も**マッチしてしまう**ため、これらが本来の router に到達する前に eventRoutes の auth に蹴られる状態が継続。**修正**: 公開 (auth 不要) エンドポイントを集約した `public.routes.ts` を新設し、`createAwardsRoutes()` で **最初に** マウント。これで `/awards/events/X/output` (ranking) / `/awards/events/X/oneshot/output` (1S CG) / `/awards/events/X/module-config` / `/awards/events/X/cue` (ranking 用 HTTP fallback) は publicRoutes で先回り解決され、後続の auth-blanket 付き router (events/categories/entries/oneshot) に到達する前に response が返る。`/awards/images/...` も imageRoutes (mount 順 2 番目) で auth 不要に処理。**ファイル変更**: a) `server/src/contexts/awards/routes/public.routes.ts` 新設 (4 endpoint を集約)、b) `server/src/contexts/awards/index.ts` で publicRoutes / imageRoutes を最初にマウント。各 router に残った `router.use([...], requireAuth)` は **auth 必須 path のみカバー**、public path は publicRoutes が先取り。

(v2.8.95: 表彰CG/ランキングCG 出力 URL のログイン不要アクセスを完全修復 + 表彰CG output を viewport スケール対応化。**根本原因 = Express router middleware leak**: 4 router が `router.use(requireAuth, requirePermission('awards'))` (パス無し) で auth ガードを掛けていた。この書き方だと **router 内のすべてのリクエスト**で middleware が発火するため、`/awards/images/...` 等の他 router 担当のパスがこれら router を通過する際に matching route が無くても requireAuth が走り、未ログインだと 401 で蹴られていた。**修正**: 4 router の `router.use(requireAuth, ...)` を **path-scoped 配列形式**に変更。**OneShotOutputPage を viewport スケール対応**: ranking CG `OutputPage`/`Stage` と同じ方式 (`Math.min(w/CG_W, h/CG_H)` で scale 計算 + offset で中央寄せ) に変更。OBS の 1920×1080 source では scale=1 / offset=0 で 1:1 ネイティブ表示、それ以外のブラウザでは自動縮小プレビューが効く。)

(v2.8.94: 表彰CG Headline 右側の affil-block (会社名 + 縦線 + 所属) のレイアウト崩れ防止。ユーザー報告 (スクリーンショット添付) 「企業名の左横の線、企業名が長いとレイアウト崩れの要因。所属も長すぎると影響あり、2 行までは OK・長体・長すぎないように」に対応。①**会社名 (`.lt-company`) を useCondense で長体スケール化**: `Headline.tsx` で `companyRef = useCondense<HTMLDivElement>([...], 0.6)` を JA/EN 共通で個人 + チームの両方に適用。長い会社名は `transform: scaleX(0.6〜1.0)` で affil-block の `max-width` 内に自動圧縮される。チーム時の "代表/Lead" 行にも `leadRef` を当てて代表者名+ロール文字列が長くても収まる。 ②**所属 (`.lt-dept`) を 2 行クランプ + 長体**: CSS のみで処理。`white-space: nowrap` を撤去し、`display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; word-break: break-word;` で 2 行までに制限・3 行目以降は ellipsis。`letter-spacing: -0.04em` + `font-feature-settings: "palt"` で 長体化 (NomineePanel と同じ手法)、`font-size: 20px → 19px`、`line-height: 1.1 → 1.25` で行間も確保。 ③**`.lt-affil-block` 容器強化**: `max-width: 320px → 360px` で会社名にもう少し余裕、`overflow: hidden` 追加で極端なはみ出しを物理的にクリップ、`white-space: nowrap` を撤去 (子要素ごとに制御)、`min-width: 0` 追加で flex shrink が効くように。縦線 (`::before`) は据置で見た目変化なし。これで「ネットワークソリューション事業本部 クリエイティブ部(NS) とくとくBBチーム」のような超長文 dept でも 2 行内に綺麗に収まり、会社名側もはみ出さないため CG 全体のレイアウト崩れが起きない。

(v2.8.93: ランキングCG ステップピッカー説明テキストの視認性改善 + PROGRAM OFF オーバーレイの読みやすさ向上。`ControlPage.tsx` line 299 の `<span className="text-[9px] text-slate-500 mt-0.5 leading-tight">{desc}</span>` を `text-[10px] font-medium text-slate-300 mt-1 leading-tight` に変更: ①フォントサイズ 9px → 10px で 1px 拡大、②色 `text-slate-500` (#64748b、AA 不適合) → `text-slate-300` (#cbd5e1、AAA 準拠の高コントラスト)、③`font-medium` (500 weight) を追加、④`mt-0.5` → `mt-1` で英ラベルとの行間を 2px → 4px に拡張。`OneShotControlPage` の PROGRAM OFF オーバーレイも同様に slate-500 → slate-300 + font-medium。)

(v2.8.92: 表彰CG: 送出 URL を**認証不要**に + 送出 UI 文字視認性改善。①**送出 URL 公開化**: ユーザー要望「送出 URL は ranking 同様ログイン不要 (アクセス制限解除)」に対応。`server/src/contexts/awards/routes/events.routes.ts` で `GET /events/:id/module-config` が `router.use(requireAuth, requirePermission('awards'))` ミドルウェアの**後ろ**に置かれていたため auth 必須になっていた。GET だけ前 (公開区画) に移動し ranking CG の `/events/:id/output` と同レベルに昇格。書き込みの PUT は auth 区画に残置。これで `/awards/output/{eventId}/oneshot?lang=ja` URL が OBS のブラウザソース等から認証なしでアクセス可能。 ②**送出 UI 文字視認性改善**: ユーザー報告「ranking + 表彰CG の送出 UI で文字色が黒ベースに同化、視認性極めて悪い」に対応。dark bg (黒系) operator pages の text-slate-{500,600,700} を一段階明るく統一: 500→**300**、600→**400**、700→**500**。対象は `ControlPage` / `OneShotControlPage` / `NomineePanel` / `LangPicker` / `TickerControlRow` / `SendActionRow` の 6 ファイル。light bg の dialog/edit page (`ExcelImportDialog` / `OneShotDataEditor` / `I18nDictDialog` / `ModuleConfigEditPage` / `EventEditorPage`) は逆効果なので revert して維持。フォント (Noto Sans JP) は v2.8.39 で全アプリ統一済。)

(v2.8.91: 表彰CG アニメーション消失バグ修正 (FLIP の stale Observer)。)ユーザー報告「v2.8.90 でアニメーション消失」の根本原因 = `LowerThirdCG` の FLIP ResizeObserver setup を `useEffect(..., [])` 空 deps で行っていたため、ノミネートまたは言語が変化して `<div className="lower-third" key={nomineeKey}>` の subtree が **remount** される (key 変更で React がアンマウント→再マウント) と、`.lt-panel` も新しい DOM 要素になるが、Observer は古い (削除された) 要素を closure で掴み続けて size 変化を検知できない、という stale Observer バグになっていた。修正: ① `useEffect` の deps を `[nomineeKey]` に変更し remount 時に Observer を再接続。② cleanup で `observer.disconnect()` を実行 (古い el への参照を解放)。③ remount 時は `prevSizeRef.current = null` にリセットして新 DOM の初測定は記録のみ (FLIP は次の resize から発火)。④ `animatingRef.current = false` も同時にリセット。これで「ノミネート切替後にモジュールを変更してもアニメーションしない」が解消、すべてのモジュール切替で FLIP の `transform: scale` が GPU 加速で発火する。

(v2.8.90: 表彰CG 不要コード一括整理 (legacy module / useAnimatedHeight / bilingual stacking 削除)。)
ユーザー要望「これまで色々実装してもらったので不要なソースコードがある気がする、整理してほしい」に対応。①**Legacy ハードコード module 削除** (7 ファイル): `oneshot/modules/{Title,Respect,Skills,Comment,Members,RecComment}Module.tsx` + `getModules.tsx` を全て削除 (v2.8.88 で `useDynamicRenderer=true` ハードコードに変えた時点で参照ゼロだった)。②**`useAnimatedHeight.ts` 削除**: v2.8.85 で JS height animation を撤去、v2.8.86+ で FLIP に置換した時点で未使用になっていたファイル。③**bilingual stacking コード削除**: v2.8.83 で in-CG bilingual を side-by-side preview に作り直した際、AwardHeader / Headline / DynamicModule の bilingual prop と関連 stacking JSX が残骸化していた。`renderSlotMaybeBilingual` 関数 + JA/EN 分岐 + `bilingual?: boolean` prop を全て削除し、純粋に単一 lang のみ描画するシンプル実装に。LowerThirdCG / OneShotStage / OneShotControlPage / OneShotOutputPage / ModuleConfigEditPage の prop 受け渡しチェーンも全部削除。 ④**Dynamic/Legacy トグル残骸**: v2.8.88 でフラグ廃止したが `useDynamicRenderer` ハードコード `const = true` が残っていた → 完全削除。`useDynamicRenderer && dynamicMod ? <DynamicModule> : legacyMod.render()` の三項演算子も簡素化。⑤**CSS 不要 rules 削除** (`lower-third.css` / `animations.css`): `.lt-bilingual` / `.lt-bilingual-en` / `.lt-award-bilingual` / `.lt-award-row-en` / `.lt-name-row-en` (bilingual stacking 用) と `.slot-fade-in` / `.slot-fade-out` / `.slot-hold-invisible` (3-phase 時代の旧版) を全削除。⑥**`timings.ts` 整理**: 未使用 export (`SLOT_DURATION` / `PANEL_HEIGHT_MS` / `SLOT_PHASE_RESIZE_MS` / `SLOT_PHASE_ENTER_MS`) を削除し `LT_EXIT_MS` / `TICKER_EXIT_MS` / `SLOT_PHASE_EXIT_MS` / `TICKER_DIV_SWAP_MS` の 4 つに集約。SlotSwitcher の `void SLOT_PHASE_ENTER_MS;` workaround line も除去。 ⑦**LowerThirdCG コメント整理**: 過去のバージョン履歴コメント (v2.8.86, v2.8.87, v2.8.88 等) を統合してファイル冒頭の意図説明だけに簡素化。 **削減効果**: client-awards JS bundle 609.88KB → **600.77KB (−9KB / gzip −1.4KB)**、CSS 63.62KB → **61.58KB (−2KB)**、ファイル数 8 削除。コードベースが意図に沿った最小構成になり、今後の機能追加も追いやすく。

(v2.8.88: 表彰CG NomineePanel リデザイン + FLIP「始点ピクツキ」完全排除 + Dynamic/Legacy トグル廃止。)
①**NomineePanel リデザイン**: ユーザー要望「賞 = プルダウン (サイズ縮小)、部門 = ボタン押しやすく 2 列固定 + 長文は長体、人 = 部門 + 名前のみで 2 列固定 + 縮小、長文は長体」に対応。`<select>` で賞をプルダウン化 (8 chip 3 行 → 1 行)。部門は `grid grid-cols-2 gap-1.5` に固定し各ボタン高 36px (h-9) で押しやすく、long label (>7 文字) は `letter-spacing: -0.04em + font-feature-settings: "palt"` で長体風に圧縮 + `truncate` で見切れ対応。人ノミネートは写真・会社・No・LIVE 大バッジを廃止し、**部門ラベル (10px 黄) + 名前 (xs 白) のみ**に簡略化、`grid grid-cols-2` で 2 列固定 (一覧性向上)、min-h 44px で iOS HIG 準拠タップ領域、long name (>9 文字) も同じく長体圧縮。LIVE 中ノミネートは右上に小さな赤バッジ。 ②**FLIP「始点ピクツキ」完全排除**: ユーザー報告「アニメーションの始点でほんの一瞬ピクつく」に対応。原因 = v2.8.87 で `ResizeObserver` callback 内で `requestAnimationFrame(triggerFlip)` 経由で 1 frame 後に transform を適用していたため、SlotSwitcher の content swap → ブラウザが新サイズで paint → 1 frame 後に inverse scale 適用、というギャップで「新サイズが一瞬見える」frame が発生。修正: `rAF` を削除して **ResizeObserver callback 内で同期的に transform を適用**。仕様上 ResizeObserver は paint 直前に発火するため、同期適用なら paint 前に inverse scale が乗りピクツキ排除。さらに `void el.offsetHeight` で **force reflow** して `scale(sx,sy)` 状態を確実にコミット → 続く `transition + scale(1,1)` がきちんと補間発火 (これがないと styler 結合で snap してしまう)。 ③**Dynamic/Legacy トグル廃止**: ユーザー指摘「レガシーモードとダイナミックモードの違いがよくわからない」に対応。v2.8.72 で段階2 検証用に追加した A/B 切替は、Legacy が v2.8.71 までのハードコード版で**モジュール編集に未対応**のため、ユーザー視点でメリットがない。`OneShotControlPage` ヘッダーから Cpu icon ボタン削除、`useDynamicRenderer` を `true` ハードコード、`localStorage` の `awards-cg-renderer` 参照も削除 (`OneShotOutputPage` も同様)。Legacy 用ハードコードコード (`getModules.tsx` + 6 モジュール) はソースに残置 (削除は別 PR で)。

(v2.8.87: 表彰CG FLIP を ResizeObserver ベースに刷新し高さだけの変化でも適用。)
ユーザー報告「2 から 3 に移行するなど縦だけに伸びるときに同様のアニメーションが起きてほしい」に対応。v2.8.86 は `useLayoutEffect` (deps: moduleKey 等) で測定していたが、SlotSwitcher の content swap が `useEffect` 経由 (= 非同期 setState) で起きるため、useLayoutEffect の発火タイミングではまだ DOM に旧コンテンツが残っていて新しい高さが取れず、結果**幅変化を伴わない高さだけの変化 (例: 尊敬→得意技、両方とも 1200px 幅) で FLIP がスキップ**されていた。修正: `useLayoutEffect` を破棄し **`ResizeObserver`** で `.lt-panel` の layout サイズ変化を直接購読 → SlotSwitcher の content swap でも .wide class toggle でも何でも検知 → 1 つの仕組みで全パターンカバー。`offsetWidth/Height` は transform の影響を受けない layout サイズなのでアニメ中の measure も安全。`rAF` で連続発火を 1 回に集約、`animatingRef` で進行中アニメ中は新規トリガをスキップ (rapid 連続クリック時のジャンプ回避)。アニメ完了後 (420ms) に `transition` / `transform` / `willChange` を全クリーンアップして次の measure に備える。これで 2↔3 (尊敬↔得意技) 等の「縦だけに伸びる」遷移でも After Effects 的な滑らかなスケール変化が適用される。

(v2.8.86: 表彰CG FLIP テクニックでなめらか拡大縮小を復活 (After Effects 的な GPU 加速)。)
ユーザー報告「v2.8.85 のアニメーション見直しは失敗、なめらかさ皆無、AfterEffects のような滑らかさが欲しい」に対応。v2.8.85 で全ての size transition / animation を撤去した結果、確かに「カクツキ」は消えたが「なめらかさ」も消えて snap 表示になっていた。今回 **FLIP テクニック** (First-Last-Invert-Play) で復活: ①`LowerThirdCG` に **`useLayoutEffect`** を追加して `panelRef.offsetWidth/Height` を実測 (`prevSizeRef` で前回値保持)、②サイズ変化を検出したら **`transform: scale(prevW/newW, prevH/newH)`** を即時適用 → 視覚的に旧サイズに戻す (DOM レイアウトは新サイズだが見た目は旧)、③`requestAnimationFrame` 内で **`transition: transform 400ms cubic-bezier(.45,.05,.55,.95)`** + `scale(1, 1)` をセット → ブラウザが **GPU の compositor 層で滑らかに補間** (CPU レイアウト処理なしで 60fps 維持可能)。`transformOrigin: 50% 100%` (下端中央) で「下端固定 + 上方向に成長/縮小」する自然な動き。`will-change: transform` で GPU レイヤープロモートを明示。サイズ変化なしの遷移 (例: タイトル→尊敬ポイント、両方とも min-height 210px に収まる) はスキップ。子要素もスケールに連動するためテキストが僅かに伸縮するが、cross-dissolve のフェードと同時進行で違和感は隠れる。これで After Effects のような「水のように均等な速度で物体が変形する」motion が iOS Safari でも frame drop なしで実現。

(v2.8.85: 表彰CG アニメ根本見直し (JS height anim 撤去 + width transition 撤去 → 純粋クロスディゾルブのみ) + 'both' モード EN ティッカー修正。)
①**アニメ根本見直し (カクツキ撲滅)**: ユーザー報告「テロップベースのアニメーションがカクつく、根本的にプログラムを見直して」に対応。これまで JS height animation (`useAnimatedHeight`) と CSS width transition (`.lower-third` の transition: width) が**異なる timing/easing** で動いて競合し、特に wide module 切替時 (1200px ⇔ 1500px) に複数のアニメ/トランジションが発火 → ResizeObserver が連発 → 進行中アニメを cancel/restart のループに陥る → カクツキの源だった。今回**全部撤去**: a) `useAnimatedHeight` import + ref + 呼び出しを `LowerThirdCG` から削除、b) `.oneshot-cg-root .lower-third` の `transition` から `width` / `margin-left` を削除し `bottom` のみ残す (ticker on/off 時のせり上げ用)、c) wide ⇔ default 幅変化は cross-dissolve 中に snap で起こる (フェードに隠れる)、d) 高さ変化は CSS の `height: auto` で自然リサイズ (snap)。**唯一のアニメは SlotSwitcher の cross-dissolve** (旧 fade-out 180ms + 新 fade-in 240ms, 30% delay でオーバーラップ ~360ms)。これで JS と CSS の競合が完全になくなり、iOS Safari でも frame drop なしの軽快な動作に。 ②**'both' モード EN ティッカー修正**: ユーザー報告「ティッカーも英語は英語で出してほしい」に対応。`OneShotControlPage` の side-by-side ('both' mode) で **JA / EN 両方の `ScaledStage` に同じ `tickerCategory` (operator の primary lang = JA で計算) を渡していた**ため、EN 側にも JA ティッカーが表示されていた。修正: `awardsJa = groupNomineesForTicker(nominees, 'ja')` と `awardsEn = groupNomineesForTicker(nominees, 'en')` を別々に計算し、`tickerCategoryJa` / `tickerCategoryEn` を導出。'both' mode の ScaledStage に各々を渡すように変更 (PROGRAM 領域 + PREVIEW thumb 両方)。これで EN 側プレビューには EN 賞名 + EN 部門名 + EN ノミネート名がティッカーで流れる。output URL `?lang=en` 側も既に v2.8.84 で URL 優先になっており、こちらは元から正常動作。

(v2.8.84: 表彰CG HTML5 Graphics 出力を 1920×1080 固定 / 常に透過 + 送出↔実出力の初期同期バグ修正。)
①**出力 1920×1080 固定 + 常に透過**: ユーザー指摘「HTML5 Graphics は 1920×1080px 固定です。かつ、常に透過してください (送出 UI は今のままで OK、実際の出力は常に透過固定)」に対応。`OneShotOutputPage` から viewport letterbox スケール (`scale` / `off` の useState + ResizeObserver) を**完全削除**し、`<div style={{ width: 1920, height: 1080, position: 'fixed', top: 0, left: 0, background: 'transparent' }}>` で**ネイティブ 1920×1080 固定描画**。OBS 等のブラウザソースは 1920×1080 で作成すれば 1:1 で表示される。透過は `<OneShotStage transparent={true}>` で**ハードコード固定** (cue.transparent は operator preview 用のみで実出力には影響しない)。`bilingual={false}` も固定 (in-CG bilingual stacking は廃止済)。`<body data-output-transparent>` 属性は維持。 ②**URL ?lang= を優先**: 出力 URL の `?lang=ja` / `?lang=en` を**常に尊重**するよう変更 (`langParam === 'en' || 'ja' ? langParam : (cue.lang ?? initialLang)`)。これで JA / EN のブラウザソースを別タブで 2 本立てる運用が崩れなくなる (operator が JA/EN モード切替しても各 URL は固定言語を表示)。 ③**送出↔実出力 初期同期バグ修正**: ユーザー指摘「送出と実際の出力が連動していないかも？」の根本原因 = operator 側の `liveFlow` (UI ローカル state) と `cue` (DB/socket 経由の broadcast 状態) が **マウント時に同期していない**。直前のセッションで TAKE 済み (`cue.isLive=true`) でも、operator がページを開き直すと PROGRAM 領域は `default (空)` 表示、output URL は前回の TAKE 内容を放送中、という「送出ボタンを押してないのに放送されてる」感じの desync になっていた。修正: マウント後に nominees + cue が揃ったタイミングで mismatch 検知 → `liveFlow.setExternal` + `setPreviewId` / `setPreviewModule` / `setLangMode` / `setTransparent` / `setShowPortrait` / `tickerFlow.turnOn` を一括同期して **operator UI を broadcast 状態に揃える**。比較ロジックで mismatch 時のみ更新するため、operator 自身の TAKE で発火する cue 更新には反応しない。`cue.isLive=false` への sync down (CLEAR 同期) は operator 側 `liveFlow.clear()` の退場アニメを尊重するため意図的に行わない。

(v2.8.83: 表彰CG アニメ「ぴくつき」修正 + JA/EN モードを ranking CG 流の **横並びプレビュー** に再設計。)
①**「ぴくつき瞬間」修正**: ユーザー報告「だいぶ良くなったが一瞬ぴくつく」に対応。原因 = `useAnimatedHeight` が width transition 中の連続的な `scrollHeight` 変化に反応して、進行中アニメを毎フレーム cancel + start していたため。修正: 進行中アニメは cancel せず**完走を待つ**仕様に変更。アニメ終了時に最終 `scrollHeight` が target からズレていれば 1 度だけ follow-up アニメを発火 → 全体としては「1 回の滑らかなアニメ + 必要なら追従」のシンプルな動きに収束。 ②**JA/EN を横並びプレビューに再設計**: ユーザー報告「日英同時表示は in-CG スタックではなく ranking CG と同様、JA / EN それぞれの出力を横並びに見せるモードのこと」に対応。在 v2.8.74-82 までの「1 つの CG 内に JA + EN を縦スタック」(`AwardHeader` / `Headline` / `DynamicModule` の bilingual prop) は不要だったため、`fromLangMode('both')` を `bilingual=false` に変更して in-CG スタックを発火しないように。代わりに `OneShotControlPage` に **`ScaledStage`** ヘルパーコンポーネント (内部で `ResizeObserver` + letterbox 計算) を追加し、`langMode === 'both'` のとき PROGRAM 領域と PREVIEW thumbnail (xl+) を**左右 2 つの独立した CG プレビュー** (左=JA / 右=EN, 中央 1px の縦線で区切り、各上端に `JA` / `EN` ラベル) として描画。各 ScaledStage は自前で ResizeObserver で 1920×1080 → コンテナサイズへスケール計算、独立した OneShotStage を持つ。PREVIEW thumb は 'both' 時に `xl:w-[480px]` (通常 320px の 1.5 倍) に拡張。出力 URL は単一言語のまま (`?lang=ja` / `?lang=en` を別々に開く運用) なので、operator が JA/EN を確認しつつ、放送は per-URL で配信される。

(v2.8.82: 表彰CG アニメ全面シンプル化 (3-phase 廃止 → クロスディゾルブ) + 「白線」(ティッカー) 誤認修正。)
①**アニメーション全面リワーク**: ユーザー報告「CG ベースのカクつき直ってない」「全面的に見直して」に対応。v2.8.78 で導入した SlotSwitcher の 3-phase シーケンス (exit → resize → enter) は、setTimeout chain + width/height transition 同期 + flap-block paused 制御 など複雑度が高く iOS Safari で frame drop しやすい構造だった。v2.8.82 で**シンプルなクロスディゾルブ**に戻す: 旧コンテンツ fade-out (180ms) + 新コンテンツ fade-in (240ms, 30% delay で少しオーバーラップ)、合計 ~360ms。`useAnimatedHeight` が height の自然リサイズを担うため一体感を維持。**`delayedModuleKey` ロジックも削除**して `LowerThirdCG` の useEffect / useState 依存を減らし、純粋に props ベースで描画。`slot-hold-invisible .flap-block { animation-play-state: paused }` ルールも不要 (3-phase 専用) なので関連 CSS も整理。 ②**「白線」誤認バグ修正**: ユーザー報告 (スクリーンショット: PROGRAM OFF 状態でティッカーだけスクロールしている画面に「よくわからない白線」と疑問)。実体は **TICKER (下部スクロール) のテキスト**で、PROGRAM (lower-third) が OFF でもティッカー ON 時には正しく描画されている (broadcast 上は正しい挙動)。誤認の原因は「PROGRAM OFF / Press TAKE to send」オーバーレイがティッカー ON 時にも出ていて、ティッカーの存在を打ち消すように見えたこと。修正: `tickerFlow.on` 時はオーバーレイを非表示にし、代わりに**右上に `TICKER ONLY` バッジ** (amber, 点滅 dot) を表示。これで操作者にティッカーのみが流れている状態が一目で分かる。

(v2.8.81: 表彰CG モジュール編集 React error #310 (Hooks 違反) 修正 + アニメ短縮 (780ms)。)
①**React error #310 修正**: ユーザー報告 (スクリーンショット: 「エラーが発生しました」赤画面 + JS console: "Rendered more hooks than during the previous render")。原因 = `ModuleConfigEditPage` で `useMemo(sortedModules, ...)` が `if (isLoading || !draft) return spinner` の **早期 return より後** に置かれていた → draft が null → undefined のレンダーで hooks の数が変わる Rules of Hooks 違反。修正: `useMemo` を early-return より**前**に移動 + null-safe 化 (`draft ? [...draft.modules].sort(...) : []`)。これで編集ページが iOS でも正常に開く。 ②**アニメーション短縮 + 同期強化**: ユーザー報告「カクつき直ってない」に対応。v2.8.79 で 1200ms にしたのが長すぎて「動きが切れて見える」感あり → **780ms** に短縮 (exit 180ms + resize 360ms + enter 240ms)。`PANEL_HEIGHT_MS` も 360ms に揃え、`.lower-third` の CSS width transition も 360ms sineInOut に同期。これで JS height animation と CSS width transition が完全同タイミング・同 easing で「ひとつの動き」として連動。 ③**Bilingual 確認 + モバイル変更確認**: コード上 AwardHeader / Headline に bilingual prop は伝搬済 (v2.8.79)、`.lt-award-row-en` / `.lt-name-row-en` CSS 定義済 (`.oneshot-cg-root` scope)、ModulePickerRow は `grid-cols-3` (mobile) になっている。React error #310 で page が壊れていた可能性 + ブラウザキャッシュで古い bundle を見ていた可能性が高い。v2.8.81 デプロイ後に hard reload (cmd/ctrl+shift+R or 履歴クリア) で再確認推奨。

(v2.8.80: 表彰CG モジュール編集 iOS Safari 互換性修正 + flap-block アニメ復活 + ErrorBoundary 改善。)
①**モジュール編集が iOS で「エラーが発生しました」になる問題の修正**: ユーザー報告 (スクリーンショット: `dev.gmo-onair.jp` 赤エラー画面) に対応。原因 = `structuredClone` (iOS Safari 15.4+ で導入) を呼んでいた箇所が古い iOS でスローしていた。`ModuleConfigEditPage` の `setDraft(structuredClone(serverConfig))` を `setDraft(JSON.parse(JSON.stringify(serverConfig)))` に変更 (ModuleDef は serializable なので JSON 経由で安全に deep clone 可能)。`crypto.randomUUID()` も同様に `safeUUID()` ヘルパに置き換え (RFC 4122 v4 風の Math.random ベース fallback、UI ID 用としては十分)。 ②**ErrorBoundary 改善**: `main.tsx` の ErrorBoundary が「エラーが発生しました」だけ出して詳細を隠していたため原因特定が困難だった。`componentDidCatch` で `console.error` 出力 + 画面上に collapsible `<details>` でエラー名 / メッセージ / stack を表示。今後同種のクラッシュが起きても初見で原因が分かる。 ③**flap-block アニメーション復活**: ユーザー報告「テロップベース挙動確認したら一部アニメーションが働いていません」に対応。原因 = v2.8.78 で導入した SlotSwitcher の 3 フェーズ (exit → resize → enter) によって、resize phase 中 (560ms 不可視) に新コンテンツが mount → flap-block アニメ (タグチップ / メンバーカードの順番に入る演出) が**バックグラウンドで再生完了** → enter phase で親が fade-in したときには子の入場アニメは既に終わっていた。修正: CSS rule `.slot-hold-invisible .flap-block, .slot-hold-invisible .flap-char { animation-play-state: paused }` を追加して resize phase 中はアニメを pause、enter phase で `.slot-hold-invisible` クラスが外れたタイミングで自然再生されるように。これでタグや人カードの「順番にパッパッと入る」演出が enter phase の親 fade-in と一緒に見えるようになる。

(v2.8.79: 表彰CG (旧 下位置CG) アニメ最大限見直し + bilingual 全面拡張 + モバイル clutter 削減 + リネーム。)
①**アニメーション最大限見直し**: ユーザー報告「v2.8.78 でアニメーションが悪化、スピードが速すぎてカクついて見える」に対応。**根本原因 = expoOut easing (.16,1,.3,1)**: 0→25% 時間で 80% 動くため「ジョルト→停止」感 → カクツキの主因。修正: ①easing を **sineInOut `cubic-bezier(.45,.05,.55,.95)`** (三角関数カーブ、速度変化が滑らかな「水のような」均等な動き) に統一、②durations を ~1.5x に拡張 (exit 200→**280ms**, resize 300→**560ms**, enter 260→**360ms**, 計 760→**1200ms**)、③`.lower-third` の CSS width transition も同 560ms / 同 sineInOut に統一して JS height animation と完全同期。 ②**Bilingual 全面拡張**: ユーザー報告「日英同時表示できません」に対応。v2.8.74 では DynamicModule のスロットだけが bilingual 対応 (賞ヘッダー / 氏名は単一 lang のみ) → 「JA/EN モード選択しても見た目が JA とほぼ同じ」だった。`AwardHeader` と `Headline` に `bilingual?: boolean` prop を追加して JA + EN の **2 行 stack 表示** に拡張。AwardHeader: JA 行 (賞 + 部門 + GMO AWARDS 2026) → EN 行 (smaller, dim, 点線 border-top で区切り)。Headline: 既存 JA name + romaji → 下に EN name + EN company を smaller font で追加。team 時は JA project name + JA leader → EN project name + EN leader。CSS `.lt-award-row-en` / `.lt-name-row-en` で EN 行のスタイルを定義 (font-size 縮小 + opacity 0.85 + 点線 border)。LowerThirdCG が bilingual prop を AwardHeader / Headline に伝搬するよう修正。 ③**モバイル clutter 削減**: ユーザー報告「スマホで見るとガチャついてる」に対応。`ModulePickerRow` をモバイル時 **3-col grid** + `text-[10px]` + `py-1.5` に圧縮 (旧 2-col + text-xs + py-2 から)、ボタン高さ ~40px → ~28px に縮減。`TickerControlRow` の info text (流す賞 → ○○ N部門ループ N名) を `hidden sm:flex` でモバイル非表示、ボタンは title 属性で情報保持。`NomineePanel` の 賞・部門 chip も `text-xs` + `px-2 py-1` でコンパクト化。 ④**「下位置CG」 → 「表彰CG」リネーム**: ユーザー要望「送出コントロールは表彰CGという名前に」。OneShotControlPage / EventEditorPage / ControlPage / ModuleConfigEditPage の inline ラベル・ボタン・section title・URL section title を「下位置CG」→「**表彰CG**」に統一 (合計 7 箇所)。AppShell breadcrumb と一致 → ユーザー導線が一本化。コード内コメントは「(下部テロップ)」など補足表記を残置して機能識別性を保つ。 ⑤**moduleConfig fetch resilience**: `fetchEventModuleConfig` を try/catch で囲み、500/404 時に null を返してクライアント側でデフォルトプリセットにフォールバック → migration 未適用環境でも編集ページが開ける。

(v2.8.78: 下位置CG 拡大縮小アニメーションのなめらかさ向上 (時間短縮 + expoOut + 同期)。)
ユーザー報告「やはりベースの拡大縮小のアニメーションのなめらかさは課題」に対応。①**フェーズ時間短縮 + 統一**: `SLOT_PHASE_EXIT_MS` 220→**200ms**、`SLOT_PHASE_RESIZE_MS` 480→**300ms**、`SLOT_PHASE_ENTER_MS` 320→**260ms**、合計 1020 → **760ms** に圧縮 (約 25% 高速化)。`PANEL_HEIGHT_MS` も 520→300ms に揃えて resize phase と JS height animation が完全同期。②**Easing 改善**: `useAnimatedHeight` の easing を Material 標準 `cubic-bezier(.4,0,.2,1)` → **expoOut `cubic-bezier(.16,1,.3,1)`** に変更 (「すっと動いて柔らかく止まる」自然な減速)。CSS `slot-fade-out-seq` も `cubic-bezier(.4,0,1,1)` (snappy in)、`slot-fade-in-seq` を `cubic-bezier(0,0,.2,1)` (gentle out) に分離して各フェーズの方向性を明確化。 ③**translateY 撤去**: `slot-fade-out-seq` (`translateY(0 → -2px)`) と `slot-fade-in-seq` (`translateY(2px → 0)`) の vertical 移動を**完全削除**して**純粋 opacity のみ**に。height animation との競合 (panel が動く + content が動く) を排除。④**width transition 同期**: `.lower-third` の CSS `transition: width 520ms cubic-bezier(.4,.0,.2,1)` (旧) を `width 300ms cubic-bezier(.16,1,.3,1)` に変更し、wide ⇔ default の幅変化を JS height animation と**同タイミング・同 easing** に揃える。`bottom` / `margin-left` も同様。 ⑤**wide 切替の delayed sync**: `LowerThirdCG` に `delayedModuleKey` state を追加し、`moduleKey` 変化後 200ms (= exit phase 終了時) に `setDelayedModuleKey(moduleKey)` を発火。`isWide` 判定を `delayedModuleKey` ベースに変更して、**旧コンテンツがフェードアウトするまで古い width を維持** → フェードアウト完了後に width / height が「ひとつの動き」として同時にリサイズ → 新コンテンツのフェードインに繋がる。これで 4 つの動き (fade-out / width / height / fade-in) が綺麗な 3 段シーケンスに収束。

(v2.8.77: 下位置CG モバイル UI 再設計 + 柔軟化フェーズ 段階4 仕上げ / ライブプレビュー。)
①**モバイル UI 再設計**: ユーザー報告「送出 UI のスマホ画面レイアウトが下位置とランキングで一貫性がない、ランキングのほうがすごくよい」に対応。`OneShotControlPage` の bottom controls 領域から **PREVIEW thumbnail を mobile/tablet (< xl) で非表示** に (`hidden xl:flex`)、代わりにテキストベースの **PREVIEW info strip** (1 行コンパクト) を追加し、queue されているノミネート名 + モジュール label を表示。`ShortcutHints` も `sm` 以下で非表示 (キーボード非搭載端末では不要)。`SendActionRow` を拡張して画像 ON/OFF + 透過 ON/OFF を統合、TAKE/CLEAR の 1 行 (sm+) または 2 行 (mobile, flex-wrap) で配置。OneShotControlPage の inline 画像トグル div を削除して整理。 ②**段階4 仕上げ / ライブプレビュー**: ユーザー要望「段階4 仕上げ (ライブプレビュー) も並行で」に対応。`ModuleConfigEditPage` に **`LivePreviewPane`** を追加 (sticky top, collapsible, max-h-[40vh])。各モジュールカードの新規「**プレビュー**」ボタン (lucide `Eye` icon, amber selected state) でクリック → 上のペインに対象モジュールが描画。`<LowerThirdCG>` を `useDynamicRenderer={true}` + `moduleConfig={draft}` で render し、編集中の `draft` (= 未保存変更を含む) を毎フレーム反映 → 編集が即座にプレビューに現れる。サンプルノミネートは `SEED_NOMINEES` (rookie_1 = individual / synergy_1 = team) を `mod.visibility === 'team-only'` 判定で自動選択。`ResizeObserver` でレターボックススケール計算、`expanded` toggle (Maximize2/Minimize2 icon) で折りたたみ可能 (画面が手狭なら閉じてエディタにフォーカス)、JA/EN ミニ lang toggle も内蔵。プレビュー対象モジュールが選択されると編集中のカード枠が amber + ring でハイライト。

(v2.8.76: 下位置CG 柔軟化フェーズ 段階4 続き / 操作 UI 動的化 + スロット編集 UI。)
①**操作 UI が EventModuleConfig を読む**: ユーザーが ModuleConfigEditPage で編集したモジュール構成 (順序 / ラベル / shortcut / 追加 custom モジュール) が **送出 UI に即反映** されるよう refactor。`ModulePickerRow` を「ハードコード ORDER 配列 + ModuleMap」から **「ModuleDef[] (visibility/order 適用済み) を直接受け取る」** 形に書き直し、ボタンは ModuleDef.label / shortcutKey から動的生成。`useShortcuts` も同様に固定 KEY_TO_MODULE 表を捨てて ModuleDef[] 走査でキー解決。`OneShotControlPage` / `OneShotOutputPage` で `useEventModuleConfig` (react-query) を fetch して `OneShotStage` → `LowerThirdCG` まで `moduleConfig` prop で流し、`LowerThirdCG` の動的レンダラ参照を `findModuleByCueKey(config, cueKey)` (ID + cueKey 両対応) に変更。`isWide` 判定も hard-coded 'comment'/'recComment' から `ModuleDef.width === 'wide'` 動的読みに変更。`hasModule` も dynamic 時はスロット数 0 = 非表示。 ②**ModuleKey 緩和 + cueKey/moduleId 変換**: `ModuleKey` 型を string union → `string` に緩和し custom-{uuid} を許容。`oneshot/lib/moduleKeyMap.ts` に `moduleIdToCueKey` (`'preset:title'`→`'title'`, `'custom-X'`→`'custom-X'`) と `cueKeyToModuleId` (逆)、`findModuleByCueKey` (config 内検索) を集約。レガシー cue 値 (`'title'` 等) と新 custom ID (`'custom-{uuid}'`) を両方解決可能。 ③**DB migration 084**: `awards_oneshot_cue_state.module_key` の CHECK 制約 (preset 7 種限定) を `DROP CONSTRAINT IF EXISTS` で削除 + VARCHAR(20) → VARCHAR(80) に拡張 (`custom-` + UUID 36 文字 = 43 字)。custom モジュールが cue に保存可能に。 ④**スロット編集 UI**: `ModuleConfigEditPage` の各モジュールカードに **`SlotsEditor`** (collapsible) を追加。`@dnd-kit` でスロット DnD 並び替え、「スロット追加」(`crypto.randomUUID().slice(0,8)` で id 発行)、削除、編集 (kind ドロップダウン 9 種 + binding source 4 種 + 条件付き入力)。binding 別フォーム: `literal` (JA / EN textinput), `nominee` (field input + datalist 候補 title/comment/ism/skills/members 等), `recommender` (field input + datalist name/position/respect 等), `oneshot_raw` (key input — Excel "そのまま保存" 列との連携)。各 SlotKind に短い hint コピーを付けて使い分けを明示。 **段階4 残作業 (v2.8.77+)**: ライブプレビュー連動 (右ペインに `<DynamicModule>` を埋め込み編集即反映)。

(v2.8.75: 下位置CG 画面揺れバグ修正 + 柔軟化フェーズ 段階4 first cut / モジュール編集ページ。)
①**画面揺れバグ修正**: ユーザー報告「テロップベースの拡大縮小の際に画面揺れのようなバグが発生」に対応。原因 = `useAnimatedHeight` が (a) アニメ進行中に `prevHeight` から再計算した `from` 値を使用 → 視覚的にカクついた位置にジャンプ、(b) width transition (1200px↔1500px wide) 中に scrollHeight が連続変化 → ResizeObserver が次々と新規アニメをトリガー、の 2 点。修正: `el.getBoundingClientRect().height` を `from` に使用 (現在描画中の実 box 高さから連続的に補間)、`requestAnimationFrame` で連続発火する ResizeObserver イベントを 1 フレーム coalesce、アニメ終了時に `prevHeight` を最新 `el.scrollHeight` に同期して drift 補正、`el.animate` を `try/catch` で囲んで古いブラウザでも安全。 ②**段階4 first cut / モジュール編集ページ**: ユーザー要望「段階4 は並行で進めて」に対応。新ルート `/event/:id/oneshot/modules` (`pages/ModuleConfigEditPage.tsx`) を新設。`@dnd-kit/core` + `@dnd-kit/sortable` を使った **DnD 並び替え** (drag で order 自動更新、PointerSensor activationConstraint distance:6 で誤発動防止)、**モジュール追加** (`crypto.randomUUID()` で `custom-{uuid}` 発行)、**削除** (confirm dialog)、**基本フィールド編集** (label JA/EN, shortcutKey 0-9, visibility 'always'/'team-only'/'individual-only', width 'default'/'wide')。`useEventModuleConfig` (react-query) で取得 → ローカル draft state で編集 → 「保存」ボタンで `useSaveEventModuleConfig` mutation → react-query invalidate。「プリセットに戻す」ボタンも提供 (confirm → `createDefaultEventModuleConfig()` で draft 再構築 → 保存で永続化)。`EventEditorPage` の `ModuleConfigSection` に「モジュール編集」ボタン (amber, lucide `Subtitles` icon) を追加してこのページにジャンプ。**段階4 残作業 (次の v2.8.76+)**: スロット編集 (binding source / field / kind / style)、ライブプレビュー連動、操作 UI への反映 (ModulePickerRow が EventModuleConfig.modules.order を読む / DB 制約緩和で custom-{uuid} を cue に保存可能にする)。

(v2.8.74: 下位置CG 日英両方表示モード + 柔軟化フェーズ 段階3 / 永続化 + JSON I/O。)
①**bilingual モード**: ユーザー要望「日英両方表示や部門/賞の選択方法の UIUX を共通化したい」に対応。`OneShotCueState.bilingual: boolean` を追加 (default `false`)、`LangPicker` を 2-mode (JA/EN) → **3-mode (JA / EN / JA+EN)** に拡張、ranking CG の `previewLang='both'` と同等の UX。`langMode` ('ja'|'en'|'both') ↔ `(lang, bilingual)` ペアの相互変換ヘルパ (`toLangMode` / `fromLangMode`) を提供。socket `oneshot:set` / `oneshot:sync` payload + DB UPSERT に `bilingual` を含めて output へ伝搬。`DynamicModule` は `bilingual=true` のときスロットを `<div class="lt-bilingual">` でラップして `.lt-bilingual-ja` (primary) + `.lt-bilingual-en` (smaller / dim, font 0.7em / opacity 0.78) の縦スタックで描画。`header-byline` と `body-members-grid` はバイリンガル化に向かないため単一レンダリング維持。レガシー (ハードコード版) レンダラは bilingual 非対応 (primary lang のみ表示)。 ②**柔軟化フェーズ 段階3 / 永続化**: 段階1 で定義した `EventModuleConfig` を実際に DB に保存できるようにする。migration 083 で `awards_events.module_config JSONB` カラムを追加 (NULL = デフォルトプリセット使用)、`GET /awards/events/:id/module-config` (現在の構成を返却、未設定は null) と `PUT /awards/events/:id/module-config` (config: object \| null を受け取り保存、null で「プリセット復帰」) を新設。`?::jsonb` 明示キャストでサーバー側保存。`oneshot/lib/moduleConfig.ts` に `useEventModuleConfig` (react-query で取得 + サーバー値が null のときデフォルトで補完) と `useSaveEventModuleConfig` mutation を追加。 ③**JSON エクスポート/インポート UI** (Q1=A の要件): `EventEditorPage` 末尾に「下位置CG モジュール構成」セクションを新設。lucide `Download` / `Upload` / `RotateCcw` アイコン付きの 3 ボタン構成 (JSON エクスポート / JSON インポート / プリセットに戻す)。エクスポートは `URL.createObjectURL` + `<a download>` で `oneshot-module-config_event-{id}_{YYYY-MM-DD}.json` をダウンロード、インポートは `<input type=file>` 経由で JSON parse → `version === 1 && Array.isArray(modules)` バリデーション → PUT 保存。BOX バックアップは既存の 3 時間ごと DB pg_dump → BOX 自動アップロードでカバーされるためカラム保存だけで自動的に保護される (Q1=A 要件 100% 達成)。

(v2.8.73: 下位置CG アニメ改善 + 「部門部門」重複修正 + ティッカー部門切替シームレス化。)
①**モジュール切替時のカクツキ解消**: ユーザー報告「ノミネート者コメント表示時など、テロップサイズ拡大縮小時の挙動がカクツク」「文字フェードアウト→ベースサイズ拡大縮小→文字フェードインの順がいい」に対応。`SlotSwitcher` を 3 フェーズ シーケンシャル化: `exit (220ms 旧コンテンツ fade-out)` → `resize (480ms パネル高さ補間 / 新コンテンツ opacity:0 で mount)` → `enter (320ms 新コンテンツ fade-in)`、合計 ~1020ms。`useAnimatedHeight` を `useLayoutEffect + deps` 方式 → **ResizeObserver ベース**に変更し、SlotSwitcher が新コンテンツを mount したタイミングで自動的に scrollHeight 変化を検知 → 高さ補間が走る。CSS に `.slot-fade-out-seq` / `.slot-hold-invisible` / `.slot-fade-in-seq` を追加。 ②**「部門部門」重複表示バグ修正**: ユーザー報告「テロップで『部門部門』と部門が重なる」に対応。`AwardHeader.tsx` line 11 で `n.subcategory` (Excel import 時に既に「部門」サフィックスが auto-append されている) にさらに ` 部門` を追加していたため重複していた (例: 「エントリー部門」→「エントリー部門 部門」)。サフィックス追加処理を削除し、データ値をそのまま表示。subcategory が空のときは divider ごと非表示。 ③**ティッカー部門切替シームレス化**: ユーザー報告「ティッカーの部門の切り替わりがなめらかではない」に対応。旧版は 1 ループ完走時点で `key` 変更 → padding-left:100% から新部門が登場するため、流れる文字列との間に「空白の数秒」が発生していた。新版は **クロスフェード** で旧 (outgoing) + 新 (incoming) を 600ms 重ねて描画: outgoing は scroll 継続 + opacity fade-out、incoming は標準 scroll + opacity fade-in、部門ラベルも同時にスライド/blur で切替 (`oscg-divisionSwapOut`)。`animationDuration` を inline ではなく CSS 変数 `--track-dur` で渡し、scroll と fade の 2 アニメ shorthand が衝突しないように。タイミング定数 `TICKER_DIV_SWAP_MS = 600` を `animation/timings.ts` に追加。

(v2.8.72: 下位置CG 柔軟化フェーズ 段階2 / 動的レンダラ + A/B 切替。)
①**DynamicModule renderer** (`oneshot/modules/dynamic/DynamicModule.tsx`): `ModuleDef.slots[]` を順番に走査し、9 種 `SlotKind` ごとに JSX テンプレートを生成。`header-label` + `header-byline` が連続している場合は `<div class="lt-module-head">` でグループ化 (現行 RespectModule / RecCommentModule の構造を再現)。`header-byline` は recommender の name + position を従来通り「| 推薦/by 名前 役職」で組立て。 ②**resolveBinding** (`oneshot/modules/dynamic/resolveBinding.ts`): SlotBinding (literal / nominee / recommender / oneshot_raw) を実値に解決。lang='en' のときは `${field}En` を探し、無ければ JA フォールバック。`asText` / `asList` ヘルパで型安全に文字列・配列化。 ③**A/B 切替**: `LowerThirdCG` / `OneShotStage` に `useDynamicRenderer?: boolean` (default `true`) prop を追加し、true で `<DynamicModule>`、false で従来 `mod.render()` を呼び分け。`SlotSwitcher.keyId` を切替で変えてアニメリプレイを誘発。`OneShotControlPage` ヘッダーに「Dynamic / Legacy」トグルボタン (`Cpu` icon、緑/灰) を追加し localStorage `awards-cg-renderer` で永続化。`OneShotOutputPage` も同 localStorage を参照してデバイス別に default 動的。 ④**段階1 と動作の互換性**: ハードコード版コード (`getModules.tsx` + 6 モジュールコンポーネント) は**未削除**で並走中。段階2.1 で同等性を確認したら削除予定。`oneshot_raw` バインディング (Excel "そのまま保存" 列) は段階4 で `Nominee._raw` を追加して有効化予定 (現状 undefined フォールバック)。 ⑤**既知の差分**: MembersModule の旧版ラベル「チームメンバー · N」が動的版では「チームメンバー」(カウント無し)。段階4 編集 UI でユーザーが自由にカウント表示を加える形にリファインする予定。

(v2.8.71: 下位置CG 柔軟化フェーズ 段階1 / 設計図 + 種データ (動作変更なし)。)
ユーザー要望「ユーザーによる送出項目の任意追加・修正等、より柔軟性の高いCGシステムの実装」のフェーズ計画 4 段の最初。①**型定義** (`oneshot/types.ts`): `ModuleDef` / `SlotDef` / `SlotKind` / `SlotBinding` / `EventModuleConfig` を追加。`SlotKind` は 9 種 (`header-label` / `header-byline` / `body-title` / `body-text` / `body-ism-text` / `body-large-quote` / `body-rec-quote` / `body-tags` / `body-members-grid`) を列挙、各 kind に固有の CSS テンプレートが対応。`SlotBinding` は 4 source (`literal` / `nominee` / `recommender` / `oneshot_raw`) で、最後の `oneshot_raw` は v2.8.69 で導入した Excel "そのまま保存" 列を直接バインドできる経路。 ②**種データ** (`oneshot/data/presetModules.ts`): 現行ハードコード版 6 モジュール (TitleModule / RespectModule / SkillsModule / CommentModule / MembersModule / RecCommentModule) + 'none' を `ModuleDef[]` (7 件) として 1:1 で書き起こし。`order: 0..6`、shortcutKey '0'〜'6'、visibility は MEMBERS のみ `team-only`、width は COMMENT / REC_COMMENT が `'wide'`。プリセット ID は `'preset:{key}'` 形式 (ユーザー追加は `'custom-{uuid}'` 予定)。`createDefaultEventModuleConfig()` で deep copy を返却。 ③**ヘルパー** (`oneshot/lib/moduleConfig.ts`): `loadEventModuleConfig(eventId)` は段階1 では常にデフォルトプリセットを返す (段階3 で API/DB 呼び出しに差し替え)、`isModuleVisible(mod, nominee)` で team-only / individual-only 判定、`getOrderedVisibleModules(config, nominee)` で order 昇順 + visibility 適用済み一覧、`findModuleByShortcut` / `detectShortcutConflicts` (段階4 用)。④**この段階での影響範囲**: 既存レンダリング・操作コード (LowerThirdCG / getModules / ModulePickerRow / useShortcuts) には**一切変更なし**。型と種データを追加しただけ。次の段階2 で DynamicModule renderer を実装してプリセットから JSX を生成し、現行ハードコード版と並走 → 同一見た目を確認後にハードコード版を削除する。

(v2.8.70: 下位置CG: 送出時の「画像 ON/OFF」トグル + 「情報なし」モジュールを左端/デフォルトに。)
①**画像 ON/OFF**: ユーザー要望「CG送出で画像有無を選べるようにしたい」に対応。`OneShotCueState.showPortrait` を追加 (default `true`)、operator 画面のコントロール行に画像トグルボタン (Image / ImageOff icon、緑/灰) を追加し、socket `oneshot:set` で output へ伝搬。`LowerThirdCG` を `showPortrait` 受け取って Portrait 描画を条件分岐 + CSS で `.lt-panel.no-portrait` 時は `grid-template-columns: 168px 1fr` → `1fr` に畳んで単列レイアウト + `min-height: auto` でコンパクト化。`.lt-info` の左 padding も対称に。②**情報なしを左端 / デフォルト**: ユーザー要望「情報なしパターンの送出ボタンを一番左、かつデフォルトにしたい」に対応。`ModulePickerRow.ORDER` を `[none, title, respect, skills, comment, members, recComment]` に並び替え (キーボードショートカットは互換維持)。`useOneShotCue.DEFAULT_CUE.moduleKey` / `OneShotControlPage` の `previewModule` 初期値 / `useTakeFlow` の初期 LiveSnapshot / `OneShotOutputPage` のフォールバック / `LowerThirdCG` の fallback を `'title'` → `'none'` に統一。③**DB**: migration 082 で `awards_oneshot_cue_state` に `show_portrait BOOLEAN NOT NULL DEFAULT TRUE` を追加 + `module_key` の DEFAULT を `'title'` → `'none'`。socket は `oneshot:set` / `oneshot:sync` の payload + DB UPSERT に `showPortrait / show_portrait` を含める。④**情報なし + 画像 OFF パターン**: 「(情報なし) + 画像なし」が最もコンパクトな lower-third (賞ヘッダー + 氏名/会社のみ) として `.lower-third.no-portrait.no-module .lt-info { padding: 16px 24px 18px }` で見栄え調整。

(v2.8.69: 下位置CG: Excel インポート UX を「**列が主役 / 自動分類 + 推奨確認**」型に作り直し + 任意列の `oneshot_data` 保存対応。)
①**列の自動分類 (server)**: `previewAwardsExcel()` を拡張し、Excel 各列の値を全行解析して `ColumnAnalysis = { header, type, avgLength, maxLength, filledRatio, samples, suggestedKey, suggestedConfidence }` を返す。`type` は `shortText / longText / list / date / number / id / url / empty` の 8 種を文字列パターンで自動判定。`suggestedKey` は AUTO_HEADERS とのヘッダー名照合 (exact → partial の 2 パス) で提案、すでに使用済みの cgKey は重複回避。②**カード型確認 UI (client)**: `ExcelImportDialog` を「CG 項目 を for-each した縦長フォーム」から「**Excel 列を for-each した 1 列 = 1 カード**」のグリッド (lg:2 列) に作り直し。各カードは `[タイプバッジ + ヘッダー名 + 入力率%] / [サンプル値 chip] / [推奨ヒントバナー (採用ボタン)] / [アクションプルダウン]` の 4 段。プルダウンは「📦 そのまま保存 (oneshot_data.{ヘッダー})」「⊘ 使用しない」「→ 既知 CG 項目 (グループ化, 他列で使用中表示付き)」の 3 ジャンルから 1 つ選択。確認 (🟢推奨採用) / 修正 (🔵CG 項目変更) / そのまま保存 (🟡asIs) / 使用しない (灰) で枠色を切替。③**任意列の保存 (extraColumns)**: `importAwardsExcel(buffer, eventId, customMapping?, extraColumns?)` 第 4 引数に「既知 CG 項目に該当しないが保存したい Excel ヘッダー一覧」を受け取り、`oneshot_data[sanitizeKey(header)]` として書き込み。これで「私のイズム」「○○年実績」など Excel 独自列も全部 DB に流れる。`POST /awards/events/:id/import-excel` body に `extraColumns: JSON 配列` を追加、サーバーで JSON.parse → `string[]` に絞り込んで forward。④**検証バー**: 必須 (`category`, `name`) 未割当 / 同 cgKey の重複割当を画面上部の赤バーで通知し、満たすまで「インポート」ボタンが灰化。⑤**localStorage の鍵刷新**: 旧 `awards-cg-import-mapping-{eventId}` (cgKey → header) → 新 `awards-cg-import-assignments-{eventId}` (header → assignment {action, cgKey?}) に変更。前者は不要なので参照削除。①**Excel 列マッピング UI** (ユーザー要望「今後 Excel フォーマットが同様とは限らないので、どの列を CG のどの項目にはめるか UI で紐付けたい」): `ExcelImportDialog` を新設。3 段フローで `ファイル選択 → プレビュー&マッピング編集 → 実行/結果表示`。サーバー側に `POST /awards/events/:id/import-preview` を新設し、Excel を解析して `{ headers, sampleRows, totalRows, suggestedMapping }` を返す。クライアントでは ~32 個の CG 項目 (賞 / 部門 / 氏名 / 会社 / 部署 / 役職 / 勤務地 / イズム / 得意技 / タイトル / コメント / 推薦者各種 / 尊敬ポイント など) について、各列の Excel ヘッダーをプルダウンで選択 + サンプル値プレビュー (1〜2 件) を表示。マッピングは localStorage `awards-cg-import-mapping-{eventId}` に保存され、次回以降のインポートで自動復元。「推奨に戻す」「(マップしない)」「他で使用中」などの状態表示あり。 ②**Excel importer の柔軟化**: `importAwardsExcel(buffer, eventId, customMapping?)` で mapping を受け取り、未指定項目は従来 auto-detect。Excel 由来の oneshot_data フィールド (ism / skills / title / comment / recommender 各種) も収集して JSONB に書き込む。skills は `カンマ/、/／` 区切りで自動配列化。重複時は `oneshot_data = COALESCE(oneshot_data, '{}'::jsonb) || $::jsonb` で**上書きマージ**: Excel に値があるキーは更新、無いキーは保持。 ③**DB 連携信頼性強化**: `PUT /awards/entries/:id/oneshot-data` を `?::jsonb` 明示キャストにし、保存後の row を返却。クライアント `OneShotDataEditor` に **保存成功/失敗バナー** (緑 / 赤、X で閉じる) と **JSONB プレビュー トグル** (送信される実際の JSONB を確認可能) を追加。保存後はモーダルを閉じずに残し、Inspector のバッジが 🟡 oneshot_data に切り替わるのを確認可能。 ④**モバイルレスポンシブ**: 各 modal を `items-end sm:items-center` + `h-[100dvh] sm:max-h-[95vh]` でモバイル時は full-screen bottom sheet 風に。OneShotDataEditor の 2 ペイン (CG プレビュー / フィールド一覧) は mobile では縦スタック、CG プレビューを `h-[34vh]` に制限してフィールド一覧をスクロール可能に。 ⑤**Excel upsert (再アップロード時の二重表示防止)**: 同 event + 同 category 内で氏名一致するエントリは UPDATE (rank / points / photo_url / oneshot_data など運用データは保持)、新規のみ INSERT。

(v2.8.68: 下位置CG: Excel 列マッピング UI 初版 (CG 項目主役) + DB 連携の信頼性強化 + モバイルレスポンシブ + Excel upsert。)

(v2.8.67: 下位置CG: マッピング Inspector/Editor を**ビジュアル連動型**に作り直し + 全体フォントサイズ見直し。OneShotDataEditor を 2 ペイン (CG プレビュー + 番号付きホットスポット ⇔ フィールド一覧 + ホバー連動) に再構築、source 別に色分けバッジ (🟢DB列 / 🟡oneshot_data / 🔵i18n / 🔴未設定)、充足率%バッジ表示。Modal/NomineePanel/操作系のフォントを text-xs → text-sm 基準に底上げ。)

(v2.8.66: 下位置CG: 賞・部門 英訳辞書 (localStorage) + DB↔CG マッピング Inspector/Editor 初版。)

(v2.8.65: アワードCG オペレーター回遊性向上: ランキングCG ⇄ 下位置CG 相互ジャンプボタン。)

(v2.8.64: アワード下部テロップCG: ページ名を「1S CG」→「下位置CG」にリネーム (UI 表示のみ)。ルートパス・内部コード・socket イベント・DB テーブル名は維持。)

(v2.8.63: アワード1S CG: ティッカー賞単位化 + 階層選択 UI + 賞/部門マッピング修正。①**ティッカー賞単位化**: ユーザー要望「ティッカーは部門単位ではなく賞単位、賞内の複数部門は一本化してループ」に対応。`TickerCategory` を `{ award, divisions: TickerDivision[] }` の階層構造に再構成、`Ticker` コンポーネント内部で `divIdx` state を持ち、1ループ完走後 (= track の animationDuration 経過後) に次の部門へローテーション。UI 表示は `[◆ ○○賞 │ ○○部門]` の固定エリアで、部門ラベル + 流れる人 (track) が部門切替時に key 変更で再マウント、部門ラベルに 620ms スライド + フェード + ブラー解除アニメ (`oscg-divisionSwap`)、track は `padding-left:100%` のおかげで自然に右端からスライドイン。②**階層選択 UI (賞→部門→人)**: 「まずは賞/部門を選択しそれに紐づく人の1Shot/ティッカーが出せるように」に対応。`NomineePanel` を 3段構成に再構築 — 賞 chip 列 (Trophy アイコン + 件数) → 選択した賞内の部門 chip 列 (Filter アイコン + 「すべて」ボタン) → フィルタ済みノミネートリスト。`OneShotControlPage` の state を `previewIdx: number` から `previewId: string` ベースに変更し、フィルタ変更でも previewId を維持。↑↓ ショートカットも `filteredNominees` を循環するよう変更。`TickerControlRow` は ON/OFF + 「流す賞 → ○○ (N部門ループ · N名)」表示のみにスリム化、賞選択は `NomineePanel` に統合。③**賞/部門マッピング修正**: 旧 `mapEventToNominees` は `category = cat.description` (= 部門) と逆に設定しており、lower-third のヘッダー (`◇ 賞名 | 部門名`) も逆表示されていた。`category = cat.name` (賞名) / `subcategory = cat.description` (部門名) に修正。④**回遊性**: header に「ランキングCG」ジャンプボタンを追加し、同イベントの `/event/:id/control` (ランキング) と `/event/:id/oneshot/control` (1S) を相互に行き来可能。⑤**STANDBY ガイド**: PROGRAM 真っ黒時に「PROGRAM OFF / Press TAKE to send」を中央に薄字表示。⑥**lang バッジ**: PROGRAM / PREVIEW ラベルに `(JA)` / `(EN)` を表示。)

(v2.8.62: アワード1S CG: TAKE/CLEAR 挙動修正 + DB 紐付け改善。PROGRAM/PREVIEW 分離 + oneshot_data 任意化 + Nominee.id を `entry-{id}` 形式に統一。)

(v2.8.61: アワード1S CG (下部テロップ) 統合: 別途共有された standalone HTML/React UMD/Babel-standalone のオペレーター駆動テロップCGを `client-awards/src/oneshot/` に Vite + TS で全面ポート。新ルート `/awards/event/:id/oneshot/control` (operator) と `/awards/output/:eventId/oneshot` (broadcast) を追加。既存ランキングCG (cue:set/cue:sync) と並走できるよう socket は `oneshot:set` / `oneshot:sync` を新設、DB は `awards_entries.oneshot_data JSONB` 拡張 + 新テーブル `awards_oneshot_cue_state` (migration 081)。)

(v2.8.60: アワードCG BEST3 演出のテンポ調整 + 二段階リビール: 全体テンポを ~2 秒 → ~6 秒にゆっくり化。各ランクを「Phase 1: ランクバッジ + 空フレーム + ポイント数字 (CountUp)」→ 「Phase 2: 写真本体 + 会社名 + 氏名」の 2 段階に分け、ポイント先出しで期待感を演出してから写真と名前で正体を明かす流れに。タイミングは 3 位 0.6/1.5s, 2 位 2.4/3.3s, 1 位 4.2/5.1s。)

(v2.8.59: アワードCG BEST3 遷移時のネタバレ修正: 写真をグリッドから移動させず StepTop3 側で独立描画。)

(v2.8.58: アワードCG BEST3 演出のリファイン: `RANKS 5→4` ステップ撤去、strip 重なり解消、NOMINEES 一覧と意匠統一。`migration 080` で CHECK 制約から ranks54 を削除。)

(v2.8.57: アワードCG TOP3 演出のレイアウト調整: 1 位を中央拡大配置から均等サイズ横並びに変更、投票テロップ削除。)

(v2.8.56: アワードCG: TOP3 リアルタイム投票演出パターンを追加。`RANKS 5→4` と `TOP 3` の 2 ステップを新設、migration 079 で CHECK 制約を拡張。)

(v2.8.55: セキュリティ修正（QシートPreviewModalのXSS、JWT_SECRETフォールバック撤廃、ADMIN_EMAILの環境変数化）)

(v2.8.53: アワードCG タイトル総尺を日本語と同じ ~3 秒に統一 + WINNER BAR でランク 6 位以下が strip から消えていたバグ修正。)

(v2.8.52: アワードCG: BOX をイベント別サブフォルダ化 + イベント削除時のローカル削除 + BOX バックアップからの復元 UI。)

(v2.8.51: アワードCG BOX ミラー保存先を「社外共有可 / 11_awards_photo」に変更。)

(v2.8.50: アワードCG 画像が再デプロイで消える問題の修正（Docker volume 永続化 + BOX ミラー保存 + ローカル消失時の自動復元）。)

(v2.8.49: アワードCG タイトル文字 stagger を文字数連動に変更（総尺 ~5 秒固定）。)

(v2.8.48: アワードCG `PhotoStage` が英語切替に未対応だったのを修正。)

(v2.8.47: アワードCG 放送送出 UI 英語/日英切替 + カテゴリ英語名 + 自社票→Own Vote。)

(v2.8.46: アワードCG ダミーポイント自動生成をエントリ ID 順 → 完全ランダムに変更。)

(v2.8.45: アワードCG 画像インポート — DB image_id の拡張子による不一致を修正。`norm()` に画像拡張子除去を追加。)

(v2.8.44: アワードCG 画像インポート — Unicode NFC 正規化 + mojibake 復号 + 診断情報表示。)

(v2.8.43: アワードCG ノミネートインポート不具合 2 件修正 — 英語列「ノミネート者氏名（英語）」を NAME_EN_HEADERS に追加、`findCol` を完全一致優先化、画像フォルダを真の folder picker 化 + 「画像ID → 氏名/英語名」多段マッチに拡張、`.DS_Store` 等を skip。)

(v2.8.42: ケーブル一覧の並び順を変更): ユーザー要望「優先順位 ①設置場所 ②商品名 ③長さ (m, 小さい順)」に対応。`server/src/contexts/equipment/routes/cables.routes.ts` の GET `/equipment/cables` (一覧) と `/equipment/cables/export-xlsx` (Excel 出力) の `ORDER BY` を `c.sort_order, c.kind, c.name` → `loc.name NULLS LAST, c.name, c.length_m NULLS LAST, c.kind` に変更。設置場所未設定 (NULL) は最後尾、長さ未入力 (NULL) も同名内では最後尾。

(v2.8.41: ケーブル管理 不具合 2 件修正 — デスクトップにコピーボタン追加 + 表編集 select の stale state バグ修正): ①**デスクトップ表示にコピーボタン追加**: モバイルカード表示にはあったコピーボタンが PC `<table>` 行のアクション列に欠落していた → `Copy` アイコンボタンを `openCopy(it)` で追加 (ConnectorPage は既に両方ある)。②**表編集で `<select>` 系セル (種別/設置場所/メーカー) の変更が反映されないバグ修正**: 原因は `<select onChange>` で `handleInlineChange` (setState) → 即 `saveInlineRow` を呼んでいたため、`saveInlineRow` 内で参照する `tableEdits[id]` が **stale state** (まだ古い値) のまま PATCH リクエストが組み立てられていた。修正: `saveInlineRow(id, immediate?)` 第二引数に「今変更したフィールド」を渡せるようにし、select の onChange で `saveInlineRow(it.id, { [f]: e.target.value })` を呼ぶ形に。input (text/number) は onBlur で発火するため state 反映後に保存され、影響なし。CablePage / ConnectorPage 両方を同じパターンで修正。

(v2.8.40: KpiCard 値末尾の和数単位 (万/億/兆) を小さく描画): ユーザー報告「`¥2,380万` の "万" が数字と同じ大きさで違和感」(進行中案件カードの "件" は `unit` prop で正しく小さくなっているのに対し、`万` は値文字列に埋め込まれているため大きく出ていた) に対応。`shared/src/client/dashboard/KpiCard.tsx` の `renderValue()` ヘルパーを追加し、`value` が string で末尾が `[万億兆]+` にマッチした場合のみ正規表現で分割し、suffix を `text-[0.55em] font-medium ml-0.5 align-baseline` で小さく描画。文字列以外（数字 `Number` や JSX）は素通し。これで `client/HomePage.tsx` `client/DashboardPage.tsx` の `formatYen()` が返す `¥X,XXX万` 形式が全て自動で改善（callsite 変更不要）。チャート tooltip 用の `formatYenShort` には影響なし。

(v2.8.39: 全アプリ フォント統一: Noto Sans JP 一本化 + 数字は Roboto Condensed): ユーザー報告「フォントが部分的に違う」(機材リストで `OCC30N-ARIB / 30m` が等幅・他は Noto Sans JP) に対応。①**`font-mono` 全削除**: 全 client (`client/`, `client-qsheet/`, `client-equipment/`, `client-interactive/`, `client-techsheet/`, `client-live/`, `client-awards/`) の Tailwind `font-mono` クラス 134 箇所を perl `(?<![-\w])font-mono(?![-\w])` で一括除去 (48 ファイル)、`font-mono-num`/`font-mono-ui` 等の派生 token は保護。②**数字フォントを Oswald → Roboto Condensed**: `shared/tailwind.preset.ts` の `fontFamily.number` と `shared/src/client/tokens.css` の `--font-mono-num` を Roboto Condensed に差し替え、qsheet の inline `'Oswald'` 参照 (CueTable/OnAirPage/EditorPage/PreviewModal) も全置換。③**Google Fonts ロード整理**: 各 `index.html` から未使用の Noto Serif JP / Inter を削除、qsheet に Noto Sans JP を追加 (従前は Oswald のみで日本語はシステムフォント フォールバック)、Roboto Condensed をロード対象に追加。awards CG (`Bebas Neue` / `Noto Serif JP`) は CG 演出のため据置。④**個別 CSS 統一**: 各 `client*/src/index.css` の `font-family: 'Noto Sans JP', ...` を全て `var(--font-sans)` に置換。⑤**shared tokens 整理**: `--font-serif` / `--font-mono-ui` を `var(--font-sans)` に内部統合 (実利用ゼロのため形骸化)。

(v2.8.38: ケーブル/コネクタ管理ページに表示列・印刷・表編集・コピー・Excel I/O を追加): 機材一覧と同等の高機能ツールバーをケーブル管理 (`CablePage`) とコネクタ管理 (`ConnectorPage`) に実装。①**Excel インポート**: 共通 `ConsumableExcelImportDialog` 経由でテンプレートDL → ヘッダー自動マッチ → 列マッピング UI → dry-run 検証 → commit。サーバーは `/equipment/cables/import-preview` `/equipment/cables/import` (mode=dry_run/commit) を新設、メーカー名は未登録なら自動作成、設置場所名は既存マスタと照合。②**Excel 出力**: `/equipment/cables/export-xlsx` でフィルター適用後の全件をダウンロード。③**印刷**: タイトル + 横向きトグル付きプレビューダイアログ → `window.print()` + `hidden print:block` で専用テーブルを出力。④**表示列ピッカー**: `localStorage` で列の表示/非表示と並び順を永続化、デフォルト復元ボタン付き。⑤**表編集モード**: 各セルが inline `<input>` / `<select>` に切り替わり、onBlur で `PATCH /equipment/cables/:id` を呼んでセル単位保存。⑥**コピー**: 行の右側 Copy ボタンで「コピー登録」モード起動 (個体固有の本数/個数だけリセット)。サーバー側に PATCH エンドポイント新設、許可フィールドは name/model_number/color/storage_method/notes/length_m/quantity/kind/location_id/manufacturer_id (コネクタは color/length_m を除く)。

(v2.8.37: モバイル InsertGap タップ展開式に変更 (UI ノイズ削減)) ユーザー報告「これが再発しました」(複数の `+ CM / + VTR` ボタンが常時表示でセクション間が散らかって見える) に対応。モバイル CueCardList の InsertGap を「常時 3 ボタン表示」から「**デフォルトは小さな `+` 1 個 + 点線**、タップで pill 形式の 3 種ボタン inline 展開（右端に × 閉じボタン）」に変更。①`expandedGap` state (`number | null`) で展開中のギャップを 1 つだけ追跡。②非展開時はサイズ `size-6 rounded-full` の `+` ボタンのみ表示し、点線で挿入位置を示すだけ。③タップで「ロール · CM · VTR · ×」の pill UI が点線上に重なって表示、選択で挿入＋自動閉じ。④挿入インデックス計算と機能は v2.8.34 と完全互換。デスクトップ CueTableLg の InsertGap (hover 表示式) は v2.8.33 のまま据置。

(v2.8.36: 機材ダッシュボードにケーブル/コネクタを追加 — Cable/Plug クイックアクション + 消耗品サマリー KpiCard。)
(v2.8.35: 機材管理: ケーブル管理 + コネクタ管理ページ追加 — equipment_cables / equipment_connectors テーブル新設、サーバー CRUD + クライアントページ + サイドバー追加。マイグレーション 076。)
(v2.8.34: モバイル スクロール不能 Fix + レスポンシブ強化 — EditorPage 親 div を `overflow-y-auto lg:overflow-hidden` に変更、CueCardList ボタンを iOS HIG 準拠タップ領域に拡大。)
(v2.8.33: InsertGap UI 安定化 — 固定高 28px + 点線 + 3 ボタン opacity 切替で layout shift を完全排除。)
(v2.8.32: CM/VTR 任意位置挿入 + ロール/行 DnD)

(v2.8.30: Hotfix - リサイズで CueTable がクラッシュ。Rules of Hooks 違反を解消。)
(v2.8.29: Qシート UI/UX モダン化 Phase 1〜4 完了)

## ブランチ運用
- **ブランチは `main` (本番) と `dev` (検証) の 2 本のみ** (v2.5.3 で master / claude/* / *-reference を全廃止)
- **本番デプロイ**: `main` ブランチへの push で GitHub Actions が auto-deploy
- **検証デプロイ**: `dev` ブランチへの push で GitHub Actions が auto-deploy
- **バージョン管理**: インクリメンタル（v1.1.93, v1.1.94...）、大きくジャンプしない
- **バージョン更新ルール**: プッシュする際は必ずパッチバージョンを上げる（例: v1.1.94 → v1.1.95）。以下の全箇所を同時に更新すること:
  1. `CLAUDE.md` の「現在のバージョン」
  2. ルート `package.json` の `"version"`
  3. 各ワークスペース `package.json` の `"version"` (`client/`, `client-qsheet/`, `client-equipment/`, `client-interactive/`, `client-techsheet/`, `client-live/`, `server/`)
  4. `README.md` の「現在のバージョン」＋「バージョン履歴（抜粋）」に新バージョン行を追記（本番プッシュ時は GitHub 上の README も同期更新される）
  5. コミットメッセージに `vX.X.X` を明記
  6. **プッシュ完了後、チャットでバージョン番号とデプロイ先（dev/main）をユーザーに必ず報告すること**

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
- **技術構成**: React 19 + Vite 8 + TailwindCSS 4 + shadcn/ui
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

## CoNoHa VPS構成 (5ブロックアプリ)
```
CoNoHa VPS (2GB RAM)
├── Nginx (リバースプロキシ + SSL)
│   ├── /              → 案件管理 (client/)
│   ├── /qsheet/      → Qシート (client-qsheet/)
│   ├── /equipment/   → 機材管理 (client-equipment/)
│   ├── /interactive/  → インタラクティブ (client-interactive/ + WebSocket)
│   └── /techsheet/   → 技術資料 (client-techsheet/)
├── Express サーバー (port 3000)
│   ├── /api/v1/internal/* — 全ブロックアプリ共通API
│   ├── Socket.IO: /qsheet, /interactive
│   └── 各ブロックアプリの静的ファイル配信
├── PostgreSQL 16
│   └── 単一DB: projects, documents, equipment_items, interactive_*, techsheet_documents...
└── Volume: pgdata
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
