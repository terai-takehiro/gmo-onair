/**
 * AI フィードバックループの共通レイヤー (ai-feedback-loop Phase 1)
 *
 * 方針「AIを使い捨てにしない」(.claude/skills/ai-feedback-loop/) の実装基盤。
 * AI 接点はここを 1 行呼ぶだけで、出力の記録 → 人間の修正差分 → 成果 が繋がる。
 *
 * 設計上の要点:
 *  - **記録の失敗で業務処理を壊さない**。audit() と同じく best-effort で、
 *    失敗は warn に落とす (フィードバック収集は業務より優先度が低い)。
 *  - **全文を保存する**。mcp_audit_log は args を 1000 文字で切り詰めるため
 *    教師データにならない。ここでは切り詰めない。
 *  - **時間窓で「AI の誤り」と「正常な業務更新」を分ける**。3 ヶ月後の金額変更は
 *    AI の間違いではない。窓を切らないと修正率が無意味な数字になる。
 */
import { v4 as uuidv4 } from 'uuid';
import { execute, queryOne } from '../db/connection';

/** AI 出力から何日以内の変更を「人間の修正」として扱うか (既定 7 日) */
export const CORRECTION_WINDOW_DAYS = 7;

export type CorrectionType = 'fix' | 'enrich' | 'reject' | 'rephrase' | 'none';

export interface AiOutputInput {
  kind: string;
  targetTable?: string | null;
  targetId?: string | null;
  /** AI が出した内容そのもの (切り詰めない) */
  payload: unknown;
  toolName?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  actorId?: string | null;
  requestedBy?: string | null;
  sourceChannel?: string | null;
  messageId?: string | null;
}

export interface CorrectionInput {
  fieldPath: string;
  before?: unknown;
  after?: unknown;
  type: CorrectionType;
  note?: string | null;
}

/**
 * AI の出力を記録する。返り値は ai_outputs.id (失敗時 null)。
 * id は後続の修正差分・成果を紐づけるのに必要なので await して受け取る。
 */
export async function recordAiOutput(input: AiOutputInput): Promise<string | null> {
  const id = uuidv4();
  try {
    await execute(
      `INSERT INTO ai_outputs
         (id, kind, target_table, target_id, payload_snapshot, tool_name, model,
          prompt_version, actor_id, requested_by, source_channel, message_id)
       VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.kind, input.targetTable ?? null, input.targetId ?? null,
        JSON.stringify(input.payload ?? null), input.toolName ?? null, input.model ?? null,
        input.promptVersion ?? null, input.actorId ?? null, input.requestedBy ?? null,
        input.sourceChannel ?? null, input.messageId ?? null,
      ],
    );
    return id;
  } catch (e) {
    console.warn('[ai-output] record failed (non-blocking):', (e as Error).message);
    return null;
  }
}

/**
 * 対象レコードに紐づく直近の AI 出力を返す。
 * withinDays で時間窓を切るのが重要 (上のコメント参照)。
 */
export async function findLatestAiOutput(
  targetTable: string,
  targetId: string,
  kind: string,
  withinDays: number = CORRECTION_WINDOW_DAYS,
): Promise<{ id: string; payload: any; created_at: Date } | null> {
  try {
    const row = await queryOne(
      `SELECT id, payload_snapshot, created_at FROM ai_outputs
        WHERE target_table = ? AND target_id = ? AND kind = ?
          AND created_at >= NOW() - (? || ' days')::interval
        ORDER BY created_at DESC LIMIT 1`,
      [targetTable, targetId, kind, String(withinDays)],
    ) as any;
    if (!row) return null;
    return { id: row.id, payload: row.payload_snapshot, created_at: row.created_at };
  } catch (e) {
    console.warn('[ai-output] lookup failed (non-blocking):', (e as Error).message);
    return null;
  }
}

/**
 * その出力に**もう差分が残っているか**。
 *
 * 無修正採用（`type: 'none'` を一式）を書く前に見ます。**同じ出力に二度積まない**
 * ため — 積むと、よく開かれる案件ほど精度が高く見えます。
 */
export async function hasCorrections(outputId: string): Promise<boolean> {
  try {
    const row = await queryOne(
      'SELECT 1 AS x FROM ai_corrections WHERE output_id = ? LIMIT 1', [outputId],
    );
    return !!row;
  } catch (e) {
    console.warn('[ai-output] correction lookup failed (non-blocking):', (e as Error).message);
    // 分からないときは**書かない側**に倒す（二重に積むより、1件記録しないほうが安全）
    return true;
  }
}

/** 人間の修正差分を記録する (best-effort)。 */
export async function recordCorrections(
  outputId: string,
  corrections: CorrectionInput[],
  correctedBy?: string | null,
): Promise<void> {
  if (!corrections.length) return;
  for (const c of corrections) {
    try {
      await execute(
        `INSERT INTO ai_corrections
           (id, output_id, field_path, before_value, after_value, correction_type, note, corrected_by)
         VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?)`,
        [
          uuidv4(), outputId, c.fieldPath,
          JSON.stringify(c.before ?? null), JSON.stringify(c.after ?? null),
          c.type, c.note ?? null, correctedBy ?? null,
        ],
      );
    } catch (e) {
      console.warn('[ai-output] correction insert failed (non-blocking):', (e as Error).message);
    }
  }
}

/** 成果・顧客反応を記録する (best-effort)。 */
export async function recordAiOutcome(
  outputId: string,
  outcomeType: string,
  metric?: { key?: string; value?: number },
  note?: string | null,
): Promise<void> {
  try {
    await execute(
      `INSERT INTO ai_outcomes (id, output_id, outcome_type, metric_key, metric_value, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), outputId, outcomeType, metric?.key ?? null, metric?.value ?? null, note ?? null],
    );
  } catch (e) {
    console.warn('[ai-output] outcome insert failed (non-blocking):', (e as Error).message);
  }
}

/**
 * 明細リストの差分を取る汎用ヘルパー。
 *
 * **配列 index ではなく業務キー (keyField) で突き合わせる**のが要点。
 * index でやると 1 行挿入しただけで以降全部が「変更された」ことになり、
 * 修正率が実態とかけ離れる。
 *
 * 返す field_path は `items[<キー>].<フィールド>` 形式。
 */
export function diffByKey(
  before: any[],
  after: any[],
  keyField: string,
  compareFields: string[],
  label = 'items',
): CorrectionInput[] {
  const out: CorrectionInput[] = [];
  const beforeMap = new Map<string, any>();
  for (const b of before ?? []) if (b && b[keyField] != null) beforeMap.set(String(b[keyField]), b);
  const afterMap = new Map<string, any>();
  for (const a of after ?? []) if (a && a[keyField] != null) afterMap.set(String(a[keyField]), a);

  // 変更 / 削除
  for (const [key, b] of beforeMap) {
    const a = afterMap.get(key);
    if (!a) {
      // AI が出したがユーザーが落とした = 不採用
      out.push({ fieldPath: `${label}[${key}]`, before: b, after: null, type: 'reject' });
      continue;
    }
    for (const f of compareFields) {
      const bv = b[f], av = a[f];
      // 数値は型 (string/number) が混ざるため数値比較に寄せる
      const same = (bv == null && av == null) ||
        (isNumericLike(bv) && isNumericLike(av) ? Number(bv) === Number(av) : String(bv ?? '') === String(av ?? ''));
      if (!same) {
        out.push({ fieldPath: `${label}[${key}].${f}`, before: bv ?? null, after: av ?? null, type: 'fix' });
      }
    }
  }
  // 追加
  for (const [key, a] of afterMap) {
    if (!beforeMap.has(key)) {
      out.push({ fieldPath: `${label}[${key}]`, before: null, after: a, type: 'enrich' });
    }
  }
  return out;
}

function isNumericLike(v: unknown): boolean {
  if (typeof v === 'number') return true;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return true;
  return false;
}
