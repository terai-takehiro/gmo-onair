/**
 * 締め（`settle`）の差分計算 — 純関数（段7 §5-4・§8-2）。**DB もネットワークも触らない。**
 *
 * before は `applied_payload`（**`proposal` でも「保存直前の行」でもない**。理由は
 * `07-ai-proposals-impl.md` §5-4 手順1）。after は現在の `data`（呼び出し側が渡す）。
 * 突合するのは **`applied_ids` の id 集合だけ**（人が後から足した行を対象外にする）。
 */
import { diffByKey, type CorrectionType } from '../../../shared/services/ai-output.service';
import { shiftYmd } from '../../../shared/utils/jst';
import { redactedFieldsOf, redactText } from './redact';
import { toComparableItem, toComparableRow } from './comparable';
import type { AppliedIds, AppliedPayload, CorrectionInput, SettledReason } from './types';
import { AI_EARLY_SETTLE_DAYS, AI_TIMEOUT_SETTLE_DAYS, REPHRASE_SIMILARITY_THRESHOLD } from './kinds';

export interface ComputeSettleInput {
  kind: string;
  /** 取り込んだ内容そのもの（AI が置いた値。§4-4 の表現） */
  appliedPayload: AppliedPayload;
  appliedIds: AppliedIds;
  /** 現在の `data` / `qsheet_schedule_items`（**全部**でよい。ここで id 集合に絞る） */
  after: { rows?: unknown[]; items?: unknown[] };
  stage: 'early' | 'final';
  /** scenario ブロックの id（無ければ null。フラットな `{name,html}` として比較する） */
  scenarioBlockId: string | null;
}

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function rowIdOf(r: Record<string, unknown>): string {
  return String(r.row_id ?? r.id ?? '');
}

/** 正規化した編集距離（0=完全一致 〜 1=まったく別）から類似度を出す */
function similarity(a: string, b: string): number {
  const MAX = 500; // 長い本文で O(n*m) が重くならないよう切る（台詞は短い前提）
  const s1 = a.slice(0, MAX);
  const s2 = b.slice(0, MAX);
  if (s1 === s2) return 1;
  const n = s1.length, m = s2.length;
  if (n === 0 || m === 0) return 0;
  const dp: number[] = Array(m + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= n; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= m; j++) {
      const tmp = dp[j];
      dp[j] = s1[i - 1] === s2[j - 1]
        ? prevDiag
        : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = tmp;
    }
  }
  const dist = dp[m];
  return 1 - dist / Math.max(n, m);
}

/**
 * `fix` の `html` 差分を、言い換えらしさで `rephrase` に格上げする。**まだ redact しない**
 * （類似度は生の文字列で計算する必要があるため。redact は `redactCorrection` で後段に一本化する）。
 * `diffByKey` 自体は `fix`/`reject`/`enrich` の3つしか出さないので、後段でここを通す
 * （`diffByKey` 自体は変えない — 見積・タスク投入が使っている共通ヘルパーのため）。
 */
function upgradeRephrase(c: CorrectionInput): CorrectionInput {
  if (c.type !== 'fix' || typeof c.before !== 'string' || typeof c.after !== 'string') return c;
  const sim = similarity(c.before, c.after);
  const type: CorrectionType = sim >= REPHRASE_SIMILARITY_THRESHOLD ? 'rephrase' : 'fix';
  return { ...c, type, note: `sim=${sim.toFixed(2)}` };
}

/**
 * `fields` に載ったフィールドを本文として落とす。**2つの形を両方見る**:
 *   - フィールド単位の差分（`fieldPath` が `.html` などで終わる）→ `before`/`after` 自体が本文
 *   - 行まるごとの reject/enrich（`diffByKey` が行オブジェクトを丸ごと返す）→
 *     オブジェクトの中の `html` プロパティだけを落とす（`label`/`duration`/`name` は残す）。
 *     ここを取りこぼすと、行が丸ごと消えた/増えたときの `before`/`after` に台詞の本文が
 *     生のまま残ってしまう。
 */
function redactCorrection(c: CorrectionInput, fields: Set<string>): CorrectionInput {
  if (fields.size === 0) return c;
  const field = c.fieldPath.split('.').pop() ?? '';
  if (fields.has(field)) {
    const before = typeof c.before === 'string' ? redactText(c.before) : c.before;
    const after = typeof c.after === 'string' ? redactText(c.after) : c.after;
    return { ...c, before, after };
  }
  const redactObj = (v: unknown): unknown => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    const obj = { ...(v as Record<string, unknown>) };
    for (const f of fields) {
      if (typeof obj[f] === 'string') obj[f] = redactText(obj[f] as string);
    }
    return obj;
  };
  return { ...c, before: redactObj(c.before), after: redactObj(c.after) };
}

/** rows の差分（scenario セルの name/html を含む） */
function rowCorrections(input: ComputeSettleInput): CorrectionInput[] {
  const idSet = new Set(input.appliedIds.rows);
  const beforeRows = asArray(input.appliedPayload.rows)
    .filter((r) => idSet.has(rowIdOf(r)))
    .map((r) => toComparableRow(r, input.scenarioBlockId));
  const afterRows = asArray(input.after.rows)
    .filter((r) => idSet.has(rowIdOf(r)))
    .map((r) => toComparableRow(r, input.scenarioBlockId));
  const redactFields = new Set(redactedFieldsOf(input.kind));
  return diffByKey(beforeRows, afterRows, 'row_id', ['label', 'duration', 'name', 'html'], 'rows')
    .map((c) => (c.fieldPath.endsWith('.html') ? upgradeRephrase(c) : c))
    .map((c) => redactCorrection(c, redactFields));
}

/** items（①枠）の差分。時刻はもともと数値なので表現ずれが無い */
function itemCorrections(input: ComputeSettleInput): CorrectionInput[] {
  const idSet = new Set(input.appliedIds.items);
  const beforeItems = asArray(input.appliedPayload.items)
    .filter((it) => idSet.has(String(it.item_id ?? it.id ?? '')))
    .map(toComparableItem);
  const afterItems = asArray(input.after.items)
    .filter((it) => idSet.has(String(it.item_id ?? it.id ?? '')))
    .map(toComparableItem);
  return diffByKey(beforeItems, afterItems, 'key', ['title', 'kind', 'start_min', 'end_min', 'assignee', 'note'], 'items');
}

/**
 * 差分を計算する。
 * - `stage === 'final'` なら**すべての `fieldPath` に `late.` を付ける**（この関数の中で付ける。
 *   呼ぶ側に任せると必ず片方で忘れる）
 * - **差分 0 件なら `[{ fieldPath: '(全体)', type: 'none' }]` を返す**（この関数の責任）
 */
export function computeSettleCorrections(input: ComputeSettleInput): CorrectionInput[] {
  const raw = [...rowCorrections(input), ...itemCorrections(input)];
  // 差分 0 件でもここで `none` を1行作る。**late. を付ける前に作る**— 付けたあとだと
  // final で差分 0 件のときに `late.(全体)` にならず分母が読み違えられる（§5-2）
  const corrections: CorrectionInput[] = raw.length === 0
    ? [{ fieldPath: '(全体)', before: null, after: null, type: 'none' }]
    : raw;
  if (input.stage === 'final') {
    return corrections.map((c) => ({ ...c, fieldPath: `late.${c.fieldPath}` }));
  }
  return corrections;
}

// ============================================================
// 締めの「いつ」を決める純関数（§5-1・§5-2）
// ============================================================

export interface FinalDueInfo { dueAt: Date; reason: SettledReason }

/**
 * 2段目（`final`）の期限と理由を決める。
 * - `firstCueActualDate` があれば `on_air`（本番トランスポートが動いた日の翌日 03:00 JST）
 * - 無ければ `broadcastDate` から `broadcast_date_passed`
 * - どちらも無ければ `applied_at` から `AI_TIMEOUT_SETTLE_DAYS` 日後の `timeout`
 *   （⚠️ 「最も早いもの」にしない。本番が8日以上先だと毎回 timeout が勝ち、
 *   測りたい「当日の直し」を取りこぼす。§5-1 の警告）
 */
export function computeFinalDueInfo(input: {
  appliedAt: Date;
  /** `qsheet_documents.broadcast_date` / `qsheet_schedules.service_date`（`YYYY-MM-DD`） */
  broadcastDate: string | null;
  /** `qsheet_cue_actuals` にその文書の行が最初に入った日（JST の `YYYY-MM-DD`） */
  firstCueActualDate: string | null;
}): FinalDueInfo {
  const nextDay0300 = (ymd: string): Date => new Date(`${shiftYmd(ymd.slice(0, 10), 1)}T03:00:00+09:00`);
  if (input.firstCueActualDate) return { dueAt: nextDay0300(input.firstCueActualDate), reason: 'on_air' };
  if (input.broadcastDate) return { dueAt: nextDay0300(input.broadcastDate), reason: 'broadcast_date_passed' };
  return {
    dueAt: new Date(input.appliedAt.getTime() + AI_TIMEOUT_SETTLE_DAYS * 86400000),
    reason: 'timeout',
  };
}

/**
 * 1段目（`early`）の実効期限。**「取り込みから7日」と「2段目の期限」のうち、先に来たほう**（§5-2）。
 * 本番が取り込みから7日以内にあると2段目の期限が先に来るので、そちらで early を締める
 * （そうしないと early が永久に締まらないか、`late.` の有無で二重に積まれる）。
 */
export function computeEarlyDueAt(appliedAt: Date, finalDueAt: Date): Date {
  const natural = new Date(appliedAt.getTime() + AI_EARLY_SETTLE_DAYS * 86400000);
  return natural.getTime() <= finalDueAt.getTime() ? natural : finalDueAt;
}
