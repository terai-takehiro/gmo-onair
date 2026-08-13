/**
 * やり取りの本文を「あとから」整える（バックフィル・migration 187）
 *
 * ── 何を解いているか ────────────────────────────────────────
 *
 * `activity-ai.service` の整形器は**画面から書いたときだけ**通ります
 * （`activity-log.service` の `wantFormat = data.format === true`）。
 * メール取込（MCP `create_activity_log`）は `format` を渡さないので、
 * **毎日 sales@ から取り込まれる記録は素のテキストのまま**でした。
 *
 * ここは「まだ整えていない行」を拾って、**同じ整形器・同じプロンプト**で
 * あとから整えます。新しい AI 機能ではなく、既にある機能の**適用範囲を広げるもの**です。
 *
 * ── 上書きしないもの（重要）────────────────────────────────
 *
 * 埋めるのは **`body_html` と `key_points` だけ**です。
 *
 * - **`subject` は上書きしません。** 取込スキルが作る件名はすでに精度が高く
 *   （「★LED映像の納品仕様を照会 — 先方は素材制作に着手…」のように状況ごと書く）、
 *   整形器の30字の件名で置き換えると**改悪になります**
 * - **`next_action` / `next_action_date` は空のときだけ埋めます。**
 *   入っているものは人か取込スキルが決めた値で、そちらが正
 * - **`description`（原文）は1バイトも触りません。** 整形が的外れなときに
 *   画面の「打った文をみる」から戻せます（`ai_formatted` が立つので出ます）
 *
 * ── 一度整えた行は二度と触らない ────────────────────────────
 *
 * 待ち行列は**行の状態で表します**（ジョブの表は作らない）。
 *   まだ = `body_html IS NULL AND format_attempted_at IS NULL`
 * 整え終わると `body_html` が入るので、次の回では拾われません。
 * **失敗しても `format_attempted_at` を必ず立てます** — 立てないと、
 * 何度呼んでも失敗する行（長すぎる等）を毎回呼んで課金され続けます。
 *
 * ── AI に返る仕組み（会社方針「AI を使い捨てにしない」）────────
 *
 *   条件1 記録   原文と整形結果を `ai_outputs`(kind=`activity_format`) に全文で。
 *                **`tool_name` を `activity.backfill` に分ける** — 画面から書いた分と
 *                混ぜると、バックフィルの出来が対話経路の統計を汚す
 *   条件2 差分   人が直して保存したときに既存の `recordActivityCorrections` が
 *                自動比較する（`ai_outputs.created_at` から7日窓なので、
 *                **年単位で経ってからの通常の業務更新は誤りに数えられない**）
 *   条件3 成果   **無修正採用率**（整えたあと人が本文を直さなかったか）を条件2から導出。
 *                バックフィルは `next_action` を上書きしないので、対話経路の
 *                「期限内に済んだか」は成果として使えない（そちらは対話経路が持つ）
 *   条件4 還流   `getFeedbackDigest` の advice を整形プロンプトに載せる（対話経路と同じ）
 *   条件5 レビュー 月1回・営業のマネージャー（既存の運用の決めに乗る）
 */
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import {
  recordAiOutput,
} from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { usageSummary } from '../../../shared/services/ai-usage.service';
import {
  formatActivity, isActivityAiConfigured, MAX_ACTIVITY_CHARS,
  type StructuredActivity,
} from './activity-ai.service';
import { ACTIVITY_FORMAT_KIND } from './activity-log.service';

/** バックフィルの印。対話経路（`activity.format`）と統計を混ぜないために分ける */
export const BACKFILL_TOOL_NAME = 'activity.backfill';

/** 1回で整える上限の既定。**大きくしない** — 落ちたときに課金だけ進むのを避ける */
export const DEFAULT_BATCH = 20;

/** 1回で整える上限の上限。画面から大きい数を送られても超えない */
export const MAX_BATCH = 200;

export interface FormatQueueStats {
  /** まだ整えていない（これから対象になる）件数 */
  pending: number;
  /** 試したが整えられなかった件数（理由は行に残っている） */
  failed: number;
  /** 整え終わっている件数 */
  formatted: number;
  /** 素の本文を持つ行の総数（pending + failed + formatted と一致する） */
  total: number;
  /** 1件あたりの平均費用（USD）。**実績が無い / 単価未設定なら null**（推測しない） */
  usdPerRow: number | null;
  /** pending をすべて整えたときの推定費用（USD）。同上 */
  usdEstimate: number | null;
  /** AI につないでいるか。つないでいなければ走らせない */
  configured: boolean;
}

/**
 * 待ち行列の件数と推定費用。
 *
 * **費用は実績から出します。** 公開価格をコードに焼き込まないのと同じ理由で
 * 「1件あたり何円」も決め打ちしません（`ai-usage.service` の方針）。
 * 過去の `activity` の実績（合計費用 ÷ 件数）を使い、
 * **実績が無いか単価が未設定なら `null`** を返します — 画面は金額を出さずに件数だけ出します。
 */
export async function formatQueueStats(): Promise<FormatQueueStats> {
  const row = await queryOne(
    `SELECT
       COUNT(*) FILTER (WHERE body_html IS NULL AND format_attempted_at IS NULL) AS pending,
       COUNT(*) FILTER (WHERE body_html IS NULL AND format_attempted_at IS NOT NULL) AS failed,
       COUNT(*) FILTER (WHERE body_html IS NOT NULL) AS formatted,
       COUNT(*) AS total
     FROM activity_logs
     WHERE deleted_at IS NULL
       AND description IS NOT NULL AND btrim(description) <> ''`,
  ) as Record<string, unknown> | undefined;

  const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  const pending = num(row?.pending);

  // 実績（過去90日）から1件あたりを出す。**費用が出せない回は分母から外す**
  let usdPerRow: number | null = null;
  try {
    const u = await usageSummary(90);
    // **単価の分からないモデルは分母から外す**（0 として混ぜると総額が嘘になる）
    const act = u.rows.filter((r) => r.kind === 'activity' && r.cost_usd !== null && r.calls > 0);
    const calls = act.reduce((s, r) => s + r.calls, 0);
    const usd = act.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    if (calls > 0 && usd > 0) usdPerRow = usd / calls;
  } catch {
    /* 実績が読めなくても件数は出す（金額だけ出さない） */
  }

  return {
    pending,
    failed: num(row?.failed),
    formatted: num(row?.formatted),
    total: num(row?.total),
    usdPerRow,
    usdEstimate: usdPerRow === null ? null : usdPerRow * pending,
    configured: isActivityAiConfigured(),
  };
}

export interface FormatTargetRow {
  id: string;
  description: string;
  activity_date: string;
  activity_type: string;
  subject: string | null;
  next_action: string | null;
  next_action_date: string | null;
}

/**
 * 整形結果を行に書くとき、**どの値を採るか**を決める。
 *
 * ネットワークにも DB にも触らないので素で試せます
 * （`shared/tests/activityFormatMerge.test.ts`）。ここを間違えると
 * **取込スキルが作った精度の高い件名が AI の30字の件名で潰れます**。
 */
export function mergeFormatted(row: FormatTargetRow, ai: StructuredActivity): {
  bodyHtml: string | null;
  keyPoints: string[];
  nextAction: string | null;
  nextActionDate: string | null;
} {
  const has = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  return {
    // 埋める対象。整形器が本文を返せなかったら null のまま（＝失敗として扱う）
    bodyHtml: ai.bodyHtml,
    keyPoints: ai.keyPoints,
    // **入っているものは上書きしない。** 空のときだけ整形器の読み取りを使う
    nextAction: has(row.next_action) ? row.next_action : (ai.nextAction || null),
    nextActionDate: has(row.next_action)
      ? row.next_action_date
      : (ai.nextAction ? ai.nextActionDate : null),
  };
}

/** 種類の見せ方。対話経路（`activity-log.service` の `KIND_LABEL`）と同じ並び */
const KIND_LABEL: Record<string, string> = {
  call: '電話', email: 'メール', meeting: '打合せ', visit: '訪問',
  proposal: '提案', demo: 'デモ', followup: '追いかけ', follow_up: '追いかけ',
  memo: '社内メモ', other: 'その他',
};

export interface FormatPassResult {
  formatted: number;
  failed: number;
  /** 走らせたあとに残っている pending。0 なら整え終わり */
  remaining: number;
  /** 走らせなかった理由（AI 未設定など）。走ったときは null */
  skipped: string | null;
}

/**
 * 待ち行列を上限件数ぶん整える。
 *
 * **1件の失敗で止めません。** 材料が薄い行・長すぎる行・API が混んでいる回があり、
 * 止めると後ろの行がいつまでも整いません（`scheduler` の他の仕事と同じ決めごと）。
 *
 * @param limit 1回で整える件数
 * @param actorId 記録に残す実行者。定時実行では null
 */
export async function runFormatPass(
  { limit = DEFAULT_BATCH, actorId = null }: { limit?: number; actorId?: string | null } = {},
): Promise<FormatPassResult> {
  const take = Math.max(1, Math.min(MAX_BATCH, Math.round(limit)));
  if (!isActivityAiConfigured()) {
    return { formatted: 0, failed: 0, remaining: (await formatQueueStats()).pending, skipped: 'この環境は AI につないでいません' };
  }

  const rows = await queryAll(
    `SELECT id, description, activity_date, activity_type, subject, next_action, next_action_date
       FROM activity_logs
      WHERE deleted_at IS NULL
        AND body_html IS NULL
        AND format_attempted_at IS NULL
        AND description IS NOT NULL AND btrim(description) <> ''
      ORDER BY activity_date DESC, created_at DESC
      LIMIT ?`,
    [take],
  ) as unknown as FormatTargetRow[];

  // 過去に人がどう直したかを載せる（条件4）。**1回だけ引いて使い回す** —
  // 行ごとに引くと同じ問い合わせを 20 回することになる
  let advice: string[] = [];
  try {
    advice = (await getFeedbackDigest(ACTIVITY_FORMAT_KIND, 90)).advice ?? [];
  } catch { /* 助言が取れなくても整形はできる */ }

  let formatted = 0;
  let failed = 0;

  for (const row of rows) {
    const original = String(row.description ?? '').trim();
    try {
      // **長すぎる行は呼ばずに落とす。** 呼んでも整形器が断るので、課金せずに印だけ立てる
      if (original.length > MAX_ACTIVITY_CHARS) {
        throw new Error(`長すぎます（${original.length} 文字）。分けて記録してください`);
      }
      const ai = await formatActivity(original, {
        activityDate: row.activity_date,
        kindLabel: KIND_LABEL[String(row.activity_type)] ?? null,
        advice,
      });
      const merged = mergeFormatted(row, ai);
      if (!merged.bodyHtml) throw new Error('整えた本文が空でした');

      // **AI が出したものの全文を先に残す**（条件1）。ここが後で「人がどこを直したか」の before。
      // 件名は上書きしないが、**AI が何を出したかは残す** — 差分で「件名は使わなかった」が読める
      const aiOutputId = await recordAiOutput({
        kind: ACTIVITY_FORMAT_KIND,
        targetTable: 'activity_logs',
        targetId: row.id,
        payload: {
          original,
          subject: ai.subject, body_html: ai.bodyHtml, key_points: ai.keyPoints,
          next_action: ai.nextAction, next_action_date: ai.nextActionDate,
          // 実際に行へ書いた値。**出したものと書いたものが違う**ので両方残す
          applied: merged,
        },
        toolName: BACKFILL_TOOL_NAME,
        model: ai.model,
        promptVersion: ai.promptVersion,
        actorId,
      });

      await execute(
        `UPDATE activity_logs
            SET body_html = ?, key_points = ?::jsonb,
                next_action = ?, next_action_date = ?,
                ai_formatted = TRUE, ai_output_id = COALESCE(ai_output_id, ?),
                format_attempted_at = NOW(), format_error = NULL,
                updated_at = NOW()
          WHERE id = ? AND body_html IS NULL`,
        [merged.bodyHtml, JSON.stringify(merged.keyPoints),
         merged.nextAction, merged.nextActionDate, aiOutputId, row.id],
      );
      formatted += 1;
    } catch (e) {
      const message = (e as Error).message || '整えられませんでした';
      console.error('[activity-format] failed:', row.id, message);
      // **印を必ず立てる。** 立てないと次の回も同じ行を呼んで課金され、待ち行列も減らない
      await execute(
        `UPDATE activity_logs SET format_attempted_at = NOW(), format_error = ? WHERE id = ?`,
        [message.slice(0, 500), row.id],
      ).catch(() => { /* 印が書けなくても他の行を続ける */ });
      failed += 1;
    }
  }

  return { formatted, failed, remaining: (await formatQueueStats()).pending, skipped: null };
}

/**
 * 失敗した行をもう一度対象に戻す（画面の「もう一度試す」用）。
 *
 * プロンプトを直したあと・長さの上限を上げたあとに使います。
 * **本文が入っている行は戻しません**（整え終わったものを作り直さない）。
 */
export async function resetFailed(): Promise<number> {
  const rows = await queryAll(
    `UPDATE activity_logs
        SET format_attempted_at = NULL, format_error = NULL
      WHERE deleted_at IS NULL AND body_html IS NULL AND format_attempted_at IS NOT NULL
      RETURNING id`,
  ) as { id: string }[];
  return rows.length;
}
