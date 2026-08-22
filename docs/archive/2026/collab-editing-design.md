# Qシート 同時共同編集 (リアルタイム・コラボ編集) 設計メモ

> ステータス: **設計 + Phase 0 着手**（本番未反映 / dev 検証前提）
> 対象: `client-qsheet/` エディタ (`EditorPage` + `CueTable` 系) と `/qsheet` Socket.IO ネームスペース
> 最終更新: v2.9.167 系

---

## 1. Context（なぜやるか）

現状の Qシート編集は **「1 つの巨大 JSON ブロブ (`qsheet_documents.data`) を 2 秒デバウンスで丸ごと PUT 保存」+ 「読み込み時点の `updated_at` を送る楽観ロック (409 CONFLICT)」** で動いている (v2.9.166)。

これは「後勝ち全上書き」を**検知して止める**ところまでは実現したが、本質的に **同時共同編集はできない**:

- 2 人が同じシートを開くと、片方が保存した瞬間もう片方は 409 で保存不能になり、退避 → リロードを強いられる。
- セル単位のマージが無いため、A さんが台本を、B さんが尺を同時に直しても片方が捨てられる。
- Socket.IO `/qsheet` は **OnAir↔Rundown の cue 同期専用のステートレス中継**で、**ドキュメント内容は一切流れていない**。しかも **認証ゼロ** (docId を知っていれば誰でも room に入れる)。

目標は **Google Docs 相当の同時編集**: 複数人が同じシートを開いて、互いの編集がリアルタイムに反映され、競合せずマージされ、誰がどこを編集中か見える状態。

---

## 2. 現状アーキテクチャの要点（調査結果）

| 項目 | 現状 | コラボ化への含意 |
|---|---|---|
| データモデル | `EditorPage.tsx` にインライン定義の単一 JSONB。`sections[] → rows[] → cells{blockId}`。ブロック種別ごとにセル形状が異なる (scenario/video/audio/telop/audio_mic/stage_diagram/led_xr) | ネストが深い構造化データ。フラットなテキストではないので CRDT は Y.Array/Y.Map のツリーで表現する |
| **安定ID** | **セクション/行に安定IDが無く index 位置指定** (`si`/`ri`)。React key も配列 index。ただし**モバイル (`CueCardList`) は既に `id` を使用済み** | ★最大の障害。2 クライアントの index ベース変更は安全にマージできない。**Phase 0 で全 section/row に安定 ID を付与** |
| 変更の集約点 | すべての構造変更が `updateData`(=`updateState`) 単一ファネルを通る (CueTable の全ヘルパ + EditorPage/Sidebar の直接呼び出し + モバイル `CueCardList` の 2 系統) | マージ層をこの 1 関数に差し込める。ただしモバイル/Sidebar の別ファネルも網羅が必要 |
| 保存 | 全ブロブ LWW + ミリ秒粒度の楽観ロック (HTTP PUT) | 同一 ms 内の 2 保存は両方通過し得る。コラボ化後は「更新 = op のブロードキャスト」に変え、PUT は定期スナップショットに降格 |
| Socket | `/qsheet` はステートレス中継・**認証なし**・cue:* のみ | ★内容同期を載せる前に**認証必須**。room 参加時に `canAccessDoc` を検証する |
| アクセス制御 | `canAccessDoc` (作成者/共有先/admin) は HTTP 側に存在 (`access.ts`) | Socket ハンドシェイクでも同じ判定を再利用する |

---

## 3. 方式の選択

### 推奨: Yjs (CRDT)

Qシートは**ネストした構造化データ**で、編集は「セル値の変更」+「行/ロールの挿入・削除・並び替え・DnD」+「マスタ/立ち位置図」。これは Yjs の `Y.Array<Y.Map>` ツリーにきれいに写像でき、**自動で競合なしマージ**され、**awareness (在席/カーソル/選択) がほぼ無償**で付いてくる。データ欠損が許されない本番アプリでは最も堅牢。

- ✅ 競合フリーマージ（2 人が別行を同時編集しても衝突しない）
- ✅ 在席・ライブカーソル・アバターが awareness で標準装備
- ✅ 成熟・実績豊富、オフライン耐性
- ⚠️ `DocumentData` 全体を Y 型にミラーする大改修、バイナリ更新の永続化、既存 JSONB ドキュメントの移行が必要

### 不採用（軽量案）: 独自パッチ中継

既存 Socket.IO で「このセルを○○に」「行を挿入」等の粒度 op を全員に中継し各自適用。実装は小さいが、**行/ロールの並び替えを 2 人同時にやった時の構造衝突を手作りルールで捌く必要**があり、真の競合フリーにはならない。端のケースでデータ欠損リスクが残るため、本番の共同編集には非推奨。

> Phase 0（安定 ID）は**どちらの方式でも必須**なので、方式確定前でも安全に着手できる。

---

## 4. 段階的ロードマップ

各フェーズは独立して価値を出し、リスクを刻む。**本番反映は各フェーズごとにユーザー承認 + dev 検証を経てから。**

### Phase 0 — 安定 ID + 変更ファネルの地固め（着手中・方式非依存）
- 読み込み時マイグレーション `ensureStableIds(data)` を新設し、全 section / row に安定 `id` を付与（既存の `splitMultiEntryRows` と同じ「読み込み時 1 回」パターン）。
- デスクトップ `CueTableLg` の生成ヘルパ (addSection/addRow/insertRow/duplicateRow/addBreak/addVtr/addPageBreak/insertSectionAt) で `id` を採番（`duplicateRow` は**新規 id**）。
- React key を index → `id` に統一（モバイル `CueCardList` は既に対応済み）。
- **効果**: 並び替え時の入力フォーカス喪失防止という即時 UX 改善 + 以降の全方式の前提が整う。破壊的変更なし・後方互換。

### Phase 1 — Socket 認証 + 在席表示（低リスク・既存 Socket 流用）
- `/qsheet` ハンドシェイクに JWT/セッション認証 + `canAccessDoc` 検証を追加（**現状ゼロ認証のセキュリティ穴の解消も兼ねる**）。
- `presence:*` イベントで「今このシートを開いている人」をヘッダーにアバター表示。内容同期はまだしない。
- **効果**: 「誰かが同時に開いている」が見える → 楽観ロック 409 の心当たりが付く。単独でも価値。

### Phase 2 — Yjs ドキュメントモデル（フラグ付き・dev 限定）
- `DocumentData ⇄ Y.Doc` の相互変換層を実装（section/row = `Y.Array<Y.Map>`、cell = `Y.Map`、テキストは `Y.Text` or LWW 文字列）。
- `y-socket.io` 相当のプロバイダを既存 Socket.IO 上に載せ、`Y.Doc` 更新をブロードキャスト + Postgres に Y update (バイナリ) を永続化。
- 既存 JSONB ドキュメントを Y.Doc へ移行するスクリプト。
- **フィーチャーフラグ**で dev の一部ドキュメントだけ有効化して検証。

### Phase 3 — Awareness カーソル/選択（フル Google Docs 体験）
- 他ユーザーのカーソル・選択セルをリアルタイム表示 + 色分けアバター。

### Phase 4 — カットオーバー
- 全ブロブ PUT は「定期スナップショット/バックアップ」に降格し、Y update を正とする。フラグ撤去。

---

## 5. 主要な決定事項（ユーザー確認待ち）

1. **同期方式**: Yjs (CRDT) 推奨 vs 独自パッチ中継（軽量）。→ 本メモは **Yjs 前提**で記述。
2. **機能範囲**: フル（在席 + ライブカーソル + 選択ハイライト）vs まずは「安全な同時編集 + 簡易在席」。→ 段階的（Phase 1 で在席、Phase 3 でカーソル）を推奨。
3. **依存追加の可否**: `yjs` + `y-protocols`（クライアント ~数百 KB）+ サーバー側 Y persistence。

---

## 6. 触るファイル（Phase 0）

| ファイル | 変更 |
|---|---|
| `client-qsheet/src/lib/stableIds.ts` (新規) | `ensureStableIds(data)` + `genId(prefix)` |
| `client-qsheet/src/pages/EditorPage.tsx` | 読み込み effect で `splitMultiEntryRows` の後に `ensureStableIds` を呼ぶ |
| `client-qsheet/src/components/editor/CueTable.tsx` | 生成ヘルパで `id` 採番、`duplicateRow` は新規 id、`key={si/ri}` → `key={section.id/row.id}` |
| `client-qsheet/src/components/editor/CueCardList.tsx` | 既に `id` 対応済み（差分小）。整合確認のみ |

既存の `id` 規約: `CueCardList` は `row_${Date.now()}_${rand}` / `sec.id`、`migrateEntries.ts` は `row.id` を安定 ID 前提で扱う。→ **`id` フィールドで統一**（`_id` は使わない）。

---

## 7. 検証（Phase 0）

1. `npx tsc -b client-qsheet` / `npm run build -w client-qsheet` が通ること。
2. dev で既存シートを開く → 全 section/row に `id` が付き、保存 → 再読込で維持されること。
3. 行/ロールの並び替え・複製・挿入・削除後も `id` が一意（複製は新規 id）であること。
4. デスクトップ ⇄ モバイル (幅 1024px 境界) 切替でクラッシュしないこと。
5. 並び替え中に編集中セルのフォーカスが飛ばないこと（key 安定化の副次効果）。

> **本番反映は Phase ごとにユーザーの明示指示 + dev 検証後。** 特に Phase 1 の Socket 認証は既存の cue 同期 (OnAir/Rundown/Prompter/AudioSupport) の疎通に影響するため要回帰確認。
