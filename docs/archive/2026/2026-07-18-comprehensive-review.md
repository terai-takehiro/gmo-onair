# GMO ONAiR 総合レビュー (2026-07-18 / v2.9.206 時点)

対象: モノレポ全体 (server 186 TSファイル / クライアント7アプリ + shared 464 ファイル)。
方法: 6観点 (セキュリティ / サーバーロジックバグ / コード健全性 / UIUX×3) の並行精読レビュー + 主要 High 指摘の実コード再検証 (全 High は行番号まで裏取り済み)。
コード変更なし (読み取り専用レビュー)。

---

## 0. 総評

土台は堅牢。SQLインジェクション対策 (プレースホルダ / sort ホワイトリスト)、秘密情報管理 (本番での必須チェック + AES-256-GCM)、ファイルアップロード検証 (マジックバイト)、Socket.IO の Origin 検証、qsheet のアクセス制御は良く実装されている。TODO/FIXME は実質ゼロ、ルート `npm run build` は全 9 workspace 通過。

一方で、急速な機能追加の歪みが 3 箇所に集中している:

1. **財務データを静かに壊すバグが 2 件** (案件更新→確定売上の無条件上書き / billing_key の COUNT 採番による請求キー重複) — 通常操作で再現し、発覚が遅れるタイプ。
2. **MCP が HTTP 側の権限モデルを完全にバイパス** — OAuth で入った閲覧のみユーザーでも全業務データへ書き込める。AI 連携を広げる前に塞ぐべき。
3. **タッチデバイスで「見えない・押せない・危ない」UI が横断的に残存** — hover 依存ボタン、確認なし削除/リセット、削除済みキーボードショートカットの案内残骸。スマホ最適化は v2.9.145 以降の対応で土台 (共有 DialogContent の max-h / grid-cols-1 等) は良いが、операレータ系・タスク系に穴が集中。

---

## 1. 最優先対応 Top 10

| # | 区分 | 内容 | 場所 |
|---|---|---|---|
| 1 | バグ High | 案件を保存するたびに最古の確定売上 amount が想定金額で無条件上書き (変更検知なし・明細と乖離) | `server/src/contexts/sales/services/project.service.ts:483-493` |
| 2 | バグ High | billing_key が COUNT ベース採番 — 売上削除後の新規作成で既存請求キーと重複。EST キーに案件コード欠落 | `server/src/contexts/finance/routes/revenues.routes.ts:288-315` |
| 3 | セキュリティ High | MCP 全ツールに権限チェックなし — OAuth 経由の任意ユーザーが案件作成/GLS発番/見積確定/財務登録可能 | `server/src/contexts/mcp/` (requirePermission 参照ゼロ) |
| 4 | セキュリティ High | MCP (`/api/v1/mcp`, oauth/token, register) にレート制限なし — APIキー総当たり/DCR濫用 | `server/src/contexts/mcp/index.ts`, `app.ts` |
| 5 | バグ High | Google カレンダー同期に nextPageToken ページングなし — 取りこぼした実在予定を「消えた」と誤認し soft-delete | `server/src/contexts/schedule/services/google-calendar.service.ts:194-269` |
| 6 | UIUX High | 削除済みキーボードショートカット (Space=TAKE 等) の案内がリアルタイムCG送出画面・マニュアルに残存 — 本番中の operator が操作不能と誤認 | `client-awards/src/pages/ControlPage.tsx:618-624`, `manual/content.tsx:226,243` |
| 7 | UIUX High | タスクの編集/削除ボタンが hover 時のみ表示 + 削除が確認なし — タッチでは編集不能・誤タップ 1 回でタスク消失 | `client/src/contexts/tasks/components/` KanbanCard:144,160 / TaskListItem:147,163 ほか |
| 8 | UIUX High | Qシート OnAir: Esc / 停止で確認なしに計時全リセット (Rundown は v2.9.166 で confirm 済みなのに親画面が無防備)。計時LIVE の RESET も同様 | `client-qsheet/src/pages/OnAirPage.tsx:249-284`, `client-live/src/components/timer/TimerControls.tsx:90-92` |
| 9 | UIUX High | ガント (v2.9.205/206 の目玉): ヘッダー/左パネル/本体のスクロール非同期 + タッチドラッグ非対応 (touch-action / pointercancel なし) | `client/src/contexts/tasks/components/GanttView/GanttView.tsx:176-205`, `GanttRow.tsx:30-113` |
| 10 | バグ High | タスク依存の循環検出が直接の逆向きエッジのみ — A→B→C→A の間接循環を素通し | `server/src/contexts/tasks/services/project-tasks.service.ts:343-347` |

---

## 2. セキュリティ

### High

- **S-1. MCP に認可 (permission) チェックが無い** — `mcpAuth` は認証 (静的キー or OAuth トークン検証) のみで、OAuth actor の `user_permissions` を一切参照しない。全ツール (create_project / issue_gls / set_project_simulation / record_finance_doc 等) が `requirePermission` 不使用。HTTP 側の sales/budget editor 権限モデルを MCP が完全バイパスする。
  → 書き込みツールで actor のモジュール権限 (editor 以上) を検証。静的キーは「フルアクセス運用鍵」として明示ドキュメント化。
- **S-2. MCP エンドポイントにレート制限なし** — `/api/v1/mcp` と OAuth 系 (`token` / `register` / `authorize`)。静的キー総当たり・DCR 無制限登録 (DB 肥大) が可能。rate limit は auth.routes のログイン系のみ。
  → IP ベースのレート制限を MCP 全体に追加 (特に register / token)。

### Medium

- **S-3. `?key=` の MCP APIキーが URL 露出** (`mcp/auth.ts:22-24`) — nginx アクセスログ・ブラウザ履歴に共用フルアクセス鍵が平文で残る。→ nginx でクエリマスク + ローテーション運用の徹底 + OAuth への移行推奨。
- **S-4. Awards CG 出力 API が未認証 + 連番 eventId** (`awards/routes/public.routes.ts:30-122`) — `SELECT *` で受賞者氏名・会社・コメント・チームメンバー等の個人情報を誰でも列挙可能。studio calendar.ics はトークン保護済みなのに非対称。→ フィードトークン化 or 出力に必要な最小フィールドへ絞る。
- **S-5. Teams webhook が clientState 未検証** (`liveops/routes/webhooks.routes.ts:7-21`) — subscriptionId を知る第三者が視聴者数を偽装可能。→ clientState 発行・照合。
- **S-6. studio フィードトークン比較が `===`** (`production/routes/studio.routes.ts:38`) — timingSafeEqual へ。`/calendar-status` の tokenTail 露出も撤去検討。
- **S-7. awards/quiz Socket namespace の書き込み無認可** — eventId を知れば誰でも `cue:set` / `oneshot:set` / `quizStack:set` を発火し放送 CG を書き換え可能 (Origin 制限のみに依存)。qsheet socket (`canAccessDoc`) と非対称。→ 認証済みユーザー限定の発火に。

### Low / 確認済み・問題なし

- mock-login は authMode ガード済 (isProduction 二重ガード追加を検討)。
- **問題なし**: SQLi (全プレースホルダ + sort ホワイトリスト + LIKE ESCAPE)、qsheet 認可 + public-audio の情報最小化、Socket Origin 検証 (polling+WS)、アップロードのマジックバイト検証 + UUID ファイル名、Open Redirect 対策 (resolveRedirect)、XSS (dangerouslySetInnerHTML 不使用)、秘密情報 (本番必須チェック / dev エフェメラル生成 / AES-256-GCM + mask)、OAuth 実装 (コード単回使用 / PKCE S256 / refresh 失効)。

---

## 3. バグ

### High

- **B-1. 案件更新で確定売上を無条件上書き** (`project.service.ts:483-493`) — コメントは「変わった場合」だが変更検知なし。備考 1 つの修正でも最古の confirmed 売上 amount が expected_amount に書き換わり、`revenue_items` は据え置きのため `amount ≠ SUM(items)` に乖離。MCP `update_project` は read-merge-write で expected_amount を常にラウンドトリップするため AI がタグ変更しただけでも発火。→ 変更時のみ + 明細を持つ売上は対象外に。
- **B-2. billing_key の COUNT 採番** (`revenues.routes.ts:288-315`) — 削除で count が減り既存キーと同番を再採番 (index は非ユニークで DB は止めない)。並行 POST でも重複。estimate は `EST-連番-税枝番` で案件コードが入らず全案件横断で衝突。→ MAX+1 のトランザクション採番 or sequences 化。
- **B-3. タスク依存の間接循環素通し** (`project-tasks.service.ts:343-347`) — 直接逆向きエッジのみチェック。→ 再帰 CTE で到達可能性判定。
- **B-4. Google/MS カレンダー同期の削除暴発** — Google は nextPageToken 未処理 (`google-calendar.service.ts:194-269`)、MS は MAX_EVENTS=1000 打ち切り後も削除フェーズ実行 (`ms-calendar.service.ts:187-207`)。ページ取りこぼし分を「消えた予定」と誤認して soft-delete。→ ページング完走 + 打ち切り時は削除フェーズをスキップ。

### Medium

- **B-5. GLS/OPP 採番が read-then-write で非アトミック** (`shared/services/sequence.service.ts`) — UI + MCP の並行発番で同一 GLS 番号が 2 案件に付与され得る。→ `UPDATE ... SET counter=counter+1 RETURNING` の 1 文に。
- **B-6. finance PUT の部分更新契約が 3 ルートで不統一** — revenues PUT は省略フィールドの一部が null 化 (計上日消失→月次集計から消える)、purchases PUT は `invoice_qualified` 省略で適格が 0 に強制降格。sga PUT のみ existing フォールバックが正しい。→ sga 方式に統一。
- **B-7. ICS 同期の RECURRENCE-ID 照合キーが UTC 日付** (`ics-sync.service.ts:129`) — JST 0:00-8:59 開始の変更済みオカレンスを拾えず元の時刻で表示。→ フル ISO + イベント TZ 暦日の 2 段照合。
- **B-8. MCP の idempotency_key が INSERT 後の後付け UPDATE** (`mcp/tools/projects.tools.ts:144-181` ほか) — 並行呼び出し/途中クラッシュでキー無し重複行が残り、BOX フォルダ生成も二重実行。→ INSERT 文にキーを含め unique violation を捕捉。
- **B-9. トランザクション欠如 (横断)** — revenues PUT の `DELETE FROM revenue_items`→INSERT ループ (途中失敗で明細全損)、`set_project_simulation` の DELETE→INSERT、changeGlsCategory / relinkExistingGls の多段更新 (途中失敗で GLS と episode_code 不整合)。→ BEGIN/COMMIT ヘルパー導入、最低限 DELETE→再INSERT 型と GLS カスケードを包む。
- **B-10. タスク soft-delete で task_dependencies 残置** (`project-tasks.service.ts:294-314`) — 削除済みタスクへの依存が API から返り続けガント矢印を汚染。→ delete 時に依存行も削除 or listDependencies に生存 JOIN。
- **B-11. studio listBookings の TEXT 期間比較** (`studio-booking.service.ts:62-63`) — 日付のみ/日時混在で終了日当日を取りこぼす可能性 (PLAUSIBLE)。getAvailability は v2.9.196 で substr 比較に修正済みなのに本経路が旧式のまま。→ 同方式に統一。

### Low (抜粋)

- 非課税の税枝番が経路で不一致 (billing-key.service は '1' / インラインは '0')。
- purchases PUT で episode/税区分変更時に billing_key 未再生成。
- `CURRENT_DATE` が DB タイムゾーン基準 — JST 朝 9 時まで「期限超過」「今日」が 1 日ずれる可能性 (dashboard/activity-log/keep-report)。
- 請求書 Excel の明細番号が全請求書で同一連番 (M00010000001…) — 監査提出で一意性が必要なら要修正。
- bulkUpdate の e_lost 一括変更が lost_at/lost_reason を記録せず失注分析から漏れる。
- refresh_token 失効 (invalid_grant) 後も 15 分ごと永久リトライ (google/ms)。
- 検索 LIKE のワイルドカード未エスケープ (revenue 検索のみ対応済み・挙動不整合)。

### 確認済み・問題なし (重要ポイント)

app.ts の async エラー捕捉パッチ (全ルートカバー) / monthly-summary の月末 '-31' 文字列比較 / pg 型パーサー / `?`→`$n` 変換の混在事故なし / poller 群の多重起動防止 / migration 128-131 の冪等性 / createBooking の自動仮押さえ削除ガード / MCP read-merge-write と confirm 2 段階の実装。

---

## 4. プログラムの無駄 (コード健全性)

実測: `npm ci` 後の `npm ls` は invalid ゼロ (宣言と lockfile 整合)。ルート `npm run build` 全通過。TODO/FIXME 実質 0 件。

### 依存関係

- **未使用依存の削除候補**: server の `pdfmake` (+@types、実使用は pdfkit のみ)・`@types/socket.io` (deprecated)。client の `zod`・`@tanstack/react-table`・`@hookform/resolvers`・radix popover/collapsible/tooltip。qsheet/equipment の `framer-motion`。6 アプリの radix tooltip / dropdown-menu。
- **shared のファントム依存**: 実 import する react / lucide-react / radix / zustand / axios 等 約 10 パッケージが未宣言 (hoisting 依存)。→ peerDependencies 明示。
- **宣言レンジ揺れ**: zod (client ^3.24.1 / server ^3.25.0)、radix select、socket.io-client、yjs。lockfile 上は単一解決で実害なしだが統一推奨。
- **ワークスペースバージョン乖離**: `client-daily@2.9.193` / `shared@2.9.173` がルート 2.9.206 とずれ。CLAUDE.md のバージョン更新ルール列挙にも両者が漏れている。

### デッドコード

- awards module-config API 3 本 + `awards_events.module_config` カラム (クライアントはスタブ化済みで呼び出しゼロ)。
- `PUT /categories/:id/vote-counts` — 参照ゼロの**書き込み系**オーファン API (セキュリティ的にも削除優先)。
- `client-awards/src/oneshot/hooks/useScale.ts` (孤児)、moduleConfig.ts の未参照関数群、`shared/src/client/UnifiedHeader.tsx` (孤児)、tokens.css の形骸トークン。
- `scripts/loadtest/stamp-loadtest.js` (削除済み interactive エンドポイント対象で動作不能)、`scripts/create-pptx.js` (依存未宣言で実行不能)。
- `server/scripts/import-kessan-dev.mjs` と `server/src/shared/collab/yjsDoc.ts` は service/shared との**二重管理** — 正本を明示 or 統一。
- client-live の `ProjectSelectorPage` — ルーティングされていない (UIUX レビューでも検出)。

### 重複コード (共通化候補・効果順)

1. **Header.tsx ×7** — SharedHeader + 3 モーダル配線の完全コピペ。設定注入型 `AppHeader` に。
2. **qsheet pdf.routes ↔ shared pdf.service** — フォント登録/整形の独立二重実装。`createPdfDoc()` 抽出。
3. **equipment excel.routes (451行)** — finance/sales は共通ルーター化済みなのに独自実装。
4. Sidebar 外枠 ×7 / client-live・daily の utils コピペ / awards の tailwind.config 単独インライン定義。

### ビルド・Lint

- **ESLint が実態なし**: `client` に lint script はあるが eslint 未インストール・config 皆無で即死。CLAUDE.md ポリシー (flat config を shared に集約) が未着手のまま。
- tsconfig: client-live/daily のみ `noUnusedLocals: false`。shared に tsconfig 自体が無い。
- バンドル: 全クライアント単一チャンク (awards 839KB / daily 580KB)。route 単位 dynamic import は低優先の改善候補。

### ドキュメント乖離

- **CLAUDE.md / README の「React 19 + Vite 8 + TailwindCSS 4」は誤り** — 実態は React 18.3.1 / Vite 6.4.2 / Tailwind 3.4.19。
- README「既知の課題」の High 2 件 (Tailwind invalid / build 失敗) は解消済みなのに未解消として掲載。
- CLAUDE.md のバージョン節が全体の 9 割超 — 古いエントリ (v2.8.x) を `docs/version-history-archive.md` に退避しスクリプトが両方読む形にすればフォーマット互換のまま 1/5 に圧縮可能。

---

## 5. UI/UX

### 5.1 横断テーマ (全アプリ共通)

**(a) hover 依存 UI がタッチで「見えない・押せない」** — 最頻出の問題パターン。
- タスク編集/削除 (KanbanCard:144 / TaskListItem:147 / TaskListGroup:69 / ChecklistItems)
- awards イベント一覧の「出力を開く/削除」(DashboardPage:316,328 — `hidden group-hover:flex` で操作不能)
- live セッション削除 (SessionHomePage:201 — 透明だがタップ可能=見えない削除ボタン)
- qsheet 共有ボタン (DashboardPage:184) / LED シーン削除 (EditorSidebar:318) / InsertGap (CueTable:490 — 見えないままタップ可能で誤挿入)
- techsheet 行削除 (EditorPage:536 — /30 透明度でほぼ不可視)
→ 方針: `sm:opacity-0 sm:group-hover:opacity-100` でタッチ幅は常時表示、非表示時は `pointer-events-none`、を全アプリ共通ルールに。

**(b) 破壊的操作の confirm 非対称** — 同じ破壊度でも画面によって保護がバラバラ。
- 確認なし: タスク削除 / qsheet OnAir の Esc・停止 / live タイマーRESET / awards エントリ削除 / equipment 棚卸し完了 (未確認残数の警告なし) / techsheet 行削除
- 確認あり: Rundown RESET (v2.9.166) / イベント・カテゴリ・クイズ・セッション削除 / ProjectGroup 等
→ 「破壊的操作は confirm または Undo トースト」を統一ルール化。特に本番運転中 (running) の計時リセットは最優先。

**(c) title 属性 (hover ツールチップ) 依存の情報開示** — AI 指示者・GLS/種別・役割・ガントのタスク詳細などがタッチで一切見えない。重要情報は常時表示 (AiInboxSection の方式) かタップ Popover に。

**(d) タップ領域 44px 未満** — ホームの完了/延期 (h-6)、一括レビューのチェック (h-4)、QuizList 並び替え ↑↓ (20×28px)、棚卸し ✓/✗ (32px)、dialog 閉じる X (16px)、TaskDialog 依存削除「×」(テキストのみ) など。共通の最低 36-44px ルールを。

**(e) ヘッダーの 375px オーバーフロー** — SharedHeader は appLabel が数 px まで潰れる (MCP/履歴/マニュアル 3 ボタン常設のため。sm 未満はユーザーメニューへ格納推奨)。awards の OneShotControlPage / QuizStackControlPage / CgCockpitPage / EventEditorPage ヘッダーは v2.9.35 の圧縮パターン (ControlPage のみ適用済み) が未適用で右端ボタンが到達不能。AppSwitcher ドロップダウンに max-h/スクロールなし。

**(f) grid-cols 固定によるダイアログ内の窮屈さ** — FinanceDocsPage:205 の `grid-cols-3` 日付 3 連 (375px で各 ~100px、High)、qsheet 新規作成 / KeepReport / Inquiries / CablePage 等の grid-cols-2/3 (Low)。プロジェクト標準 `grid-cols-1 sm:grid-cols-N` へ。

### 5.2 アプリ別の主要指摘

**案件管理 (client) + 日常業務 (client-daily)**
- High: ガントのスクロール非同期 (GanttView:176-205 — ヘッダー/左パネル/本体が独立スクロールで日付とバーがずれる。ドラッグ編集画面として致命的) / ガントのタッチ非対応 (touch-action なし・pointercancel 未処理・7px ハンドル・「PC推奨」ガードが sm 未満のみで iPad が谷間) / タスク編集の hover 依存 + 無確認削除 / FinanceDocs の grid-cols-3。
- Medium: ガントバーにタスク詳細への導線がない (title のみ・クリックでダイアログが開かない) / カンバン DnD のタッチ信頼性 (`button { touch-action: manipulation }` が dnd-kit 推奨と競合) / ホーム最大 12 セクションの優先順位不明瞭 + 作成系導線 (新規案件・活動記録) がホームに無い / スケジュールチップが操作不能 / FinanceDocs のバリデーション・aria-label 欠如。
- 良い点: ProjectFormPage のステージガイド + エラーサマリー、client-daily ホームの状態バッジ付きメニュー、AiInbox の常時指示者表示、共有 DialogContent の防御 (max-h / grid-cols-1)。

**Qシート / 機材管理 / 技術資料**
- High: StageEditor がマウス専用 (タッチで一切操作不能) / OnAir の Esc・停止の無確認リセット / **techsheet に楽観ロック・保存状態表示が皆無** (Qシートは v2.9.166 対応済み — 後勝ち上書きでデータ消失リスクが 3 アプリ中最大)。
- Medium: モバイル削除が trash を通らない即時削除 (デスクトップと非対称) + ゴミ箱がモバイル非表示 / モバイル空状態の誤案内 (「デスクトップで追加してください」— 実際は + で追加可能) / 保存状態バッジ・CSV・印刷・ランダウン・プロンプター導線がスマホに存在告知ゼロ / プロンプターのタッチ操作競合 / equipment「表編集・表示列」がモバイルカードビューで機能しないのに表示される / 棚卸しの完了警告なし + ✓/✗ を未確認に戻せない / techsheet カメラ表のモバイル代替なし + スタッフ配列に削除ボタンがない。
- Low: `prompt()`/`alert()` 依存、稿番号 +1 仕様の説明なし、techsheet の bg-white ハードコード (ダークテーマ非対応)。

**計時LIVE / リアルタイムCG / shared**
- High: 死んだショートカット案内 (ControlPage:618 のヒントバー / マニュアル / NomineePanel「↑/↓」/ ModulePickerRow の kbd バッジ — keydown ハンドラは全廃済みと grep で確認) / OneShot・QuizStack・Cockpit のモバイルヘッダーはみ出し / TimerControls RESET の無確認。
- Medium: コックピット wide 表示で埋め込みページが viewport 基準 `lg:` レイアウトのままカラム内で崩壊 (右パネル 320-420px 固定 > カラム幅) / 「黒ベース濃さ」スライダーだけ staged 列の中で唯一ライブ即時反映 (誤操作リスク) / 送出画面に「PC推奨」案内が皆無 / モバイルで 3-way 回遊ナビ非表示のため他送出画面への導線ゼロ / live「QR」ボタンが QR を描画しない (qrcode 依存なし・URL テキストのみ) / ダッシュボードのタイマー操作対象が timers[0] 固定で切替不能 / QuizEdit の保存フィードバックがモバイル非表示 / コピー成功フィードバックなし (放送前の URL 貼り間違いリスク)。
- 良い点: 出力 URL のスマホ表示 (viewport スケール + レターボックス) / TAKE・CLEAR の confirm なし (放送の即時性優先で妥当) / ManualModal 等のモバイル対応 / TimerDisplayPage の landscape フォールバック。

---

## 6. 初見ユーザー ジャーニー評価 (マニュアルなしでの操作可能性)

**案件管理**: 「新規案件 → GLS発番 → 売上入力」の幹は良く辿れる (ステージガイド / 状態に応じた導線 / 発番ダイアログの 2 択カード)。弱点は ①ホームが閲覧系 12 セクション積みで「まず何をすべきか」の視線誘導が弱く、作成系エントリがホームに無い、②「ヨミ / ネタ / 仮押さえ / GLS」が画面内説明ゼロで登場 (タブ横 info アイコン → 1 行定義の Popover で大きく改善する)、③タスク系がタッチ環境で「見るだけ」以下 (編集不能) になっている点がジャーニー最大の断絶。

**Qシート**: 作成までは良好だが、エディタの「ロール → 行 → ブロック → マスター」の概念階層を伝えるオンボーディングが無く、サイドバータブ名 (列/マスター/メタ) も初見に不親切。**「共有しないと他人に見えない」ことが作成フロー内で一度も伝わらない** (共有ボタン自体 hover 不可視) — 作成直後のトーストで一言添えるだけで解決する。ONAIR ボタンが何を起動するか押すまで不明 → 「本番進行(親) / ランダウン / プロンプター / 音声」のメニュー化を推奨。

**機材管理**: 一覧→登録→貸出 2 ステップ→返却は最も導線が明快。弱点は棚卸しのステータス遷移 (draft→進行→完了) が見えず完了の不可逆感が警告されないこと、モバイルで機能しないツールバーが同列に並ぶこと。

**技術資料**: タブ構成の見通しは良いが、必須項目なし・保存状態の手がかりなし・「3 秒自動保存」がマニュアル頼み、と 3 アプリ中もっとも作りかけ感が残る。まず楽観ロック + 保存バッジの移植を。

**計時LIVE**: 導線は最も素直 (空状態 CTA → 作成 2 択 → ダッシュボード、API 未設定バナー + 接続テスト + 取得方法ガイド)。最終成果物 (表示画面) への導線の弱さと QR 不実装が残ギャップ。

**リアルタイムCG**: イベント作成→Excel インポート (3 段フロー) →送出の幹は辿れる。①EventEditor「イベント情報」タブに URL 約 20 行が縦積みで「どれを OBS に貼るか」の選別コストが高い (機能別アコーディオン + 「まずはこれ」推奨バッジ or 送出URLタブ分離)、②operator 4 入口 (統合/字幕/クイズ/ランキング) の役割区別が色のみ、③「決定 (仕込み) → TAKE → CLEAR」のフロー図が無い、が改善点。

**日常業務 (client-daily)**: 初見到達性は 7 アプリ中で最良。状態バッジ付きメニューカード、既定フィルタ「未処理」、次アクションを示す空状態文言、確定 confirm の説明文いずれも良実装。

---

## 7. 推奨対応ロードマップ

**フェーズ 1 (即時・データ保全とセキュリティ)**
1. B-1 確定売上上書き / B-2 billing_key 採番 (財務データ破壊の停止)
2. S-1 MCP 権限チェック / S-2 MCP レート制限
3. B-4 カレンダー同期の削除暴発 (ページング + 削除スキップ安全弁)
4. UIUX #6 死んだショートカット案内の除去 (数行の削除で済む)

**フェーズ 2 (本番オペの安全性)**
5. OnAir Esc/停止・計時LIVE RESET・タスク削除・エントリ削除への confirm/Undo 統一
6. hover 依存ボタンのタッチ常時表示化 (共通ルール適用)
7. ガントのスクロール同期 + touch-action + バークリック→TaskDialog
8. B-3 依存循環 / B-10 依存残置 (ガント矢印の健全性)

**フェーズ 3 (整合性と品質基盤)**
9. B-5 採番アトミック化 / B-6 PUT 契約統一 / B-9 トランザクション導入
10. 未使用依存・死んだ API・孤児ファイルの一括削除
11. ESLint 実態化 (shared flat config) + ドキュメント整合 (React 18 表記 / README 既知課題表 / ワークスペースバージョン同期)
12. techsheet の楽観ロック移植、モバイルヘッダー圧縮パターンの横展開 (OneShot/QuizStack/Cockpit/EventEditor/SharedHeader)

**フェーズ 4 (ジャーニー改善)**
13. ホームの「要対応」統合 + 作成系クイックアクセス
14. 画面内用語ヒント (ヨミ/ネタ/GLS の 1 行 Popover)、Qシート共有の告知トースト、EventEditor 送出URLタブ分離
15. Header/Sidebar/PDF 初期化/equipment Excel の共通化リファクタ
