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
v2.8.79 — 表彰CG (旧 下位置CG): アニメーション最大限見直し + bilingual 全面拡張 + モバイル clutter 削減 + リネーム。①**アニメーション最大限見直し**: ユーザー報告「v2.8.78 でアニメーションが悪化、スピードが速すぎてカクついて見える」に対応。**根本原因 = expoOut easing (.16,1,.3,1)**: 0→25% 時間で 80% 動くため「ジョルト→停止」感 → カクツキの主因。修正: ①easing を **sineInOut `cubic-bezier(.45,.05,.55,.95)`** (三角関数カーブ、速度変化が滑らかな「水のような」均等な動き) に統一、②durations を ~1.5x に拡張 (exit 200→**280ms**, resize 300→**560ms**, enter 260→**360ms**, 計 760→**1200ms**)、③`.lower-third` の CSS width transition も同 560ms / 同 sineInOut に統一して JS height animation と完全同期。 ②**Bilingual 全面拡張**: ユーザー報告「日英同時表示できません」に対応。v2.8.74 では DynamicModule のスロットだけが bilingual 対応 (賞ヘッダー / 氏名は単一 lang のみ) → 「JA/EN モード選択しても見た目が JA とほぼ同じ」だった。`AwardHeader` と `Headline` に `bilingual?: boolean` prop を追加して JA + EN の **2 行 stack 表示** に拡張。AwardHeader: JA 行 (賞 + 部門 + GMO AWARDS 2026) → EN 行 (smaller, dim, 点線 border-top で区切り)。Headline: 既存 JA name + romaji → 下に EN name + EN company を smaller font で追加。team 時は JA project name + JA leader → EN project name + EN leader。CSS `.lt-award-row-en` / `.lt-name-row-en` で EN 行のスタイルを定義 (font-size 縮小 + opacity 0.85 + 点線 border)。LowerThirdCG が bilingual prop を AwardHeader / Headline に伝搬するよう修正。 ③**モバイル clutter 削減**: ユーザー報告「スマホで見るとガチャついてる」に対応。`ModulePickerRow` をモバイル時 **3-col grid** + `text-[10px]` + `py-1.5` に圧縮 (旧 2-col + text-xs + py-2 から)、ボタン高さ ~40px → ~28px に縮減。`TickerControlRow` の info text (流す賞 → ○○ N部門ループ N名) を `hidden sm:flex` でモバイル非表示、ボタンは title 属性で情報保持。`NomineePanel` の 賞・部門 chip も `text-xs` + `px-2 py-1` でコンパクト化。 ④**「下位置CG」 → 「表彰CG」リネーム**: ユーザー要望「送出コントロールは表彰CGという名前に」。OneShotControlPage / EventEditorPage / ControlPage / ModuleConfigEditPage の inline ラベル・ボタン・section title・URL section title を「下位置CG」→「**表彰CG**」に統一 (合計 7 箇所)。AppShell breadcrumb と一致 → ユーザー導線が一本化。コード内コメントは「(下部テロップ)」など補足表記を残置して機能識別性を保つ。 ⑤**moduleConfig fetch resilience**: `fetchEventModuleConfig` を try/catch で囲み、500/404 時に null を返してクライアント側でデフォルトプリセットにフォールバック → migration 未適用環境でも編集ページが開ける。

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
