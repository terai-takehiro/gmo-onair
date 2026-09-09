# 制作資料 v4 — 実装設計の索引と、利用者が決めたこと

> **状態**: 実装済み（記録）
> **最終確認**: 2026-09-08（v4.6.10）
> **位置づけ**: 設計書 00〜09 を実装するときに実装と突き合わせた記録。§2 の表は全段 ✅ のまま（2026-09-08 にコードで再確認。impl 文書の無い段は表の下の補足）。§3 の migration 番号は着手前の予定で、実番号も同じ補足にある

> **これは設計書（`../`）の隣に置く「実装のための設計」です。**
> 設計書10本は**実装を読まずに書かれた部分が残っていた**ため、着手前に段ごとに
> **実装と1件ずつ突き合わせ**、その結果をここに置いています。
> 各文書の末尾に「設計書との食い違い」の表があります。**設計書より、こちらが新しい。**

---

## 1. 利用者が決めたこと（2026-08-21・このセッション）

| # | 決めたこと | 効く先 | 根拠にした事実 |
| --- | --- | --- | --- |
| **①** | **進行・ランダウン・プロンプターの3画面も v4 の見た目にする**（旧見た目のスコープ固定はしない） | 03（01アプリ構造）・05（編集画面）・凍結解除 | 1バンドル1CSS（`client-qsheet/src/main.tsx:10` → `index.css:2`、動的 import ゼロ）。**公開音声は意味トークンの使用が0件**なので影響を受けず、変わるのは**4画面ではなく3画面** |
| **②** | **MCP は「提案まで」**（会話内での取り込みは第1版では作らない） | 05-mcp | サーバーから Yjs に書く経路は**現在1つも存在しない**（`roomManager` の公開メソッド6つはすべて中継）。MCP ツールは実測82本 → 90本 |
| **③** | **Excel は (A) 自社の台本を `.xlsx` で往復**（他社フォーマットの取込は作らない） | 03-excel | ⚠️ **制作資料に `.xlsx` の実装は1本もない**。「Excel出力」の実体は `.csv` を落とす `exportCsv`、取込も CSV パーサ。**今あるものを `.xlsx` に格上げする作業**になる |
| **④** | **`slide` は編集できるようにする**（＝訊かずに決めた。工数が実質ゼロのため） | 05（編集画面） | 画像アップロード経路（`server/src/.../upload.routes.ts`・マジックバイト検証つき）は**既に本番稼働中**で、読み出し側も `cell.image` を読む口を持っている |
| **⑤** | **実尺の記録を AI より先に入れる**（＝訊かずに決めた。後回しにする理由が実装側に無いため） | 01（実尺）・07（AI） | 計測ロジック自体は既にランダウン画面で動いている（`RundownPage.tsx:135,139-150`）。**保存されていないだけ** |
| **⑥** | **実尺の書き手は進行（OnAir）に固定する** | 01（実尺） | 「進行は必ず開く／ランダウンは案件による」との回答。⚠️ `cue:next` を出すのは**ランダウンだけ**なので、進行側に id を持たせる改修が要る |

### ①に伴って必ず直すもの（設計書に記述が無かった）

⚠️ **ダークモードが壊れます。** `tokens-v4.css` に `.dark` の定義が1件も無く、`@import './tokens.css'` の
**後**に書かれた `:root` が詳細度同点・後勝ちで `.dark`（`tokens.css:197`）を潰します。
ランダウンとプロンプターは `<html>` に `dark` を付けて動作中
（`RundownPage.tsx:181-186` / `PrompterPage.tsx:91-94`）。
v4 の3アプリは `dark` を一度も付けないため、今は露見していないだけです。
**①を選んだ以上、これは凍結解除と同じ PR で直す必要があります。**

---

## 2. 段ごとの実装設計

| 段 | 文書 | 対応する設計書 | 状態 |
| --- | --- | --- | --- |
| 0 | [`00-datamodel-fixes-impl.md`](00-datamodel-fixes-impl.md) | 00 | ✅ |
| — | [`00-confirmations-evidence.md`](00-confirmations-evidence.md) | README §4 | ✅（上の①〜⑥の根拠） |
| 1 | [`01-cue-actuals-impl.md`](01-cue-actuals-impl.md) | 07 §3・04 §5-3a | ✅ |
| 2 | [`02-audio-share-token-impl.md`](02-audio-share-token-impl.md) | 07 §4 | ✅ |
| 3 | [`03-app-structure-impl.md`](03-app-structure-impl.md) | 01 | ✅ |
| 4 | [`04-schedule-impl.md`](04-schedule-impl.md) | 02 | ✅ |
| 5 | [`05-editor-impl.md`](05-editor-impl.md) | 06 | ✅ |
| — | [`08-recording-streaming-impl.md`](08-recording-streaming-impl.md) | 08 | ✅（並行・段依存なし） |
| — | [`09-live-timer-impl.md`](09-live-timer-impl.md) | 09 | ✅（並行・段依存なし） |
| 7 | [`07-ai-proposals-impl.md`](07-ai-proposals-impl.md) | 04（04-a のみ） | ✅ |

> **2026-09-08 の補足（コードで確認）**: impl 文書の無い段も実装済み —
> 段6（Excel）は `server/src/contexts/qsheet/excel/`・migration 224、
> 段8（04-b 生成）は `server/src/contexts/qsheet/ai/{event-plan-ai,script-outline-ai,script-line-ai,chat}.service.ts`、
> 段9（04-c）は同 `monthly-review.service.ts`・`knowledge.ts`・migration 226、
> 段10（MCP）は `server/src/contexts/mcp/tools/production.tools.ts`・migration 223。
> migration の実番号は 212 実尺／213 公開音声／214 `doc_no`／215 ジャーニーのピン／216 スケジュール表／
> 220 収録・配信／221 計時／222 AI／223 MCP／224 Excel 取込／225 壁打ち／226 ナレッジ
> （§3 の予定番号とは 217〜219 の分がずれた）。

---

## 3. migration の採番（**README §6 の表は全部ずれています**）

⚠️ **実際の最大は `211_drop_techsheet_schema.sql`。** README §6 は「最大 210」の前提で書かれているため、
**211〜217 の割り当ては全部 1 ずつずれています。**
さらに **`206` が2本存在**します（`206_drop_untracked_drift_tables.sql` と
`206_weekly_unreviewed_notification.sql`）。`migrate.ts` はファイル名順に流すだけなので、
**CI は落ちず、黙って想定と違う順で流れます。**

**PR を出す直前に必ず `ls server/src/shared/db/migrations | sort | tail -3` で再実測してください。**
他の PR と必ず取り合いになります。

### 予定番号（README §7 の実装順で割り当てたもの・**確定ではない**）

段ごとの実装設計は並行して書かれたため、**段1 と段2 がどちらも「212」を主張しています。**
取り合いを避けるため、ここで実装順に沿って**予定番号**を決めておきます。
**枝を切った時点で必ず取り直してください。**

| 予定 | ファイル | 中身 | 段 |
| --- | --- | --- | --- |
| 212 | `212_qsheet_cue_actuals.sql` | 実尺（`qsheet_cue_actuals`） | 1 |
| 213 | `213_qsheet_audio_share.sql` | 公開音声のトークンと失効 | 2 |
| 214 | `214_qsheet_doc_no.sql` | `qsheet_documents.doc_no` ＋部分 UNIQUE | 3 |
| 215 | `215_production_journey_marks.sql` | ジャーニーの人のピン | 3 |
| 216 | `216_qsheet_schedule.sql` | スケジュール表5本＋共有1本 | 4 |
| 217 | `217_qsheet_ai.sql` | AI 提案・壁打ち・索引・ナレッジ | 7 |
| 218 | `218_qsheet_import_batches.sql` | Excel 取込の履歴とスナップショット | 6 |
| 219 | `219_qsheet_mcp.sql` | MCP 3列 ＋ `idempotency_key` | 10 |
| 220 | `220_qsheet_device_settings.sql` | 収録設定・配信設定（`meetings` 込み） | 08（並行） |
| 221 | `221_liveops_server_measure.sql` | 組織共通の鍵・計測の状態・取得ログ | 09（並行） |

⚠️ **08 と 09 はどの段にも依存しません**（08 は `projects`/`users`、09 は `liveops_*` にしか触らない）ので、
**上の 212〜219 より先に入っても構いません。** その場合は先に空き番号を取り、段側が後ろにずれます。

⚠️ **`206` の重複は既に起きた事故です。** README §5-2 #31 は「起こりうる」と書いていますが、
`migrate.ts` がファイル名を `.sort()` するだけなので**CI は落ちないまま既に2本入っています**
（`197`・`205` は欠番）。

---

## 4. 段をまたいで効く「壊れやすい点」（実装で裏を取ったもの）

1. **サーバーは `shared/` を import できない。** `server/tsconfig.json` の `rootDir: "./src"` により、
   `server/src` からの `@gmo-onair/shared` import は**0件**です。共通化したいものは
   既存の作法（複製＋`scripts/check-collab-parity.mjs` の `PAIRS`）に揃えます。
   設計書 00 §3-2 の「呼ぶのは全員：サーバー…」は**そのまま書くとビルドが通りません**。
2. **合計尺のフォールバックが実装内で逆向きに2種類ある。**
   編集画面（`EditorPage.tsx:516-518`）は**ロール尺が勝ち**、本番画面
   （`OnAirPage.tsx:91-99`・`RundownPage.tsx:233-241`）は**行の合計が勝ちます**。
   `docTotalSec` を1本にすると**どちらかの画面の総尺が必ず変わって見えます**。
   さらに PDF（`pdf.routes.ts:165`）はフォールバック無しで、**ロール尺が空の台本の総尺は既に 0 分**です。
3. **公開画面は URL の値をそのまま Socket.IO の room 名に使っている**
   （`AudioSupportPage.tsx:308` → `socket.ts:49-56` の `doc:<docId>`）。
   資料ID をトークンに差し替えると**誰もいない room に入り、画面は正常に見えるのに
   進行へ追従しなくなります**（HTTP ポーリングは効いたままなので、本番中まで気づけない）。
4. **資料ID だけで socket room に匿名 join でき、`yjs:update`（台本の編集差分＝シナリオ本文）と
   `presence:sync`（在席社員の氏名）が届く。** 「シナリオ本文は返さない」という約束は
   **HTTP についてだけ**正しい。room を cue 用と members 用に分ける必要があります。
5. **`data` の書き込みは必ず `applyDataUpdate` 経由・`updater` は `prev` の関数。**
   定数を返すと、同時編集で入った行が黙って消えます。
6. **モバイルのセル置換は破壊的。** 色を付けただけで `stage_diagram` の
   `templateIndex`/`note` や `slide` の `image` が**復元不可能に消えます**。
   さらに**モバイルの削除はゴミ箱を通りません**（`CueCardList.tsx:110-119,153-159`）＝
   スマホで消したものは戻せません。
7. **編集画面は collab 有効時に `PUT` を一度も飛ばさない。** `title` / `status` /
   `broadcast_date` / `episode_*` の**列が更新されません**。一覧の検索は `d.title` を見る一方
   カード表示は `meta.title` を優先するため、**編集後のタイトルで検索に当たらないのに
   画面上は正しく見えます**。
8. **`templateIndex` → `templateId` の移行対象が設計書で2本漏れている**
   （`PreviewModal.tsx:738` と `RundownPage.tsx:690`）。そのまま実装すると
   **印刷とランダウン（本番画面）から立ち位置図が黙って消えます**。
9. **凍結を守っている検査は設計書が言う4つではなく7スクリプト。**
   しかも **`check:frozen` は CI に入っていません**（01 §0 の「外し忘れると CI が落ちる」は不成立）。
   実際に `npm run lint` を落とすのは `check-shared-wiring.mjs:236-238` と `apps.test.ts:39` です。
10. **`client-qsheet` を見ていない検査が3本ある**
    （`check-mobile-declared.mjs` / `check-file-size.mjs` / `check-ui-tokens.mjs` の `V4_DIRS`）。
    **凍結を解くと、新しく作る画面が全部無検査で入ります。** 登録を忘れないこと。
11. **PR #279（収録設定・配信設定）はドキュメント 2,199 行だけで、コードもテーブルも1行も入っていない。**
    08 は「合わせ直す」ではなく**初めて作る**段です。
12. **案件単位のアクセス判定（`:ownerKey`）が存在しない。** 既存の `canAccessDoc` は**文書単位**
    （`qsheet_document_shares`）です。08 が要る `resolveOwner` は新設で、
    **「その案件が見えてよい人」の定義が未決**です。
13. **`exceljs` はリポジトリに1件も入っていない**（既存は全部 SheetJS の `xlsx@0.18.5`）。
    「ExcelJS に統一」は統一ではなく**新規依存の追加**で、依存追加 PR が先に要ります。

---

## 5. 検証の gate（毎回）

```bash
npm run verify:up   # 検証用 Postgres（ポート5433・本番とは完全分離）
npm run typecheck
npm run lint
npm run test
```
画面を作った PR は `npm run verify:ui`、凍結解除の前後では `npm run check:frozen` も回します。
