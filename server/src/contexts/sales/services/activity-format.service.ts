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
 * 埋めるのは **`body_struct`（本文の構造・migration 188）だけ**です。
 *
 * - **`subject` は上書きしません。** 取込スキルが作る件名はすでに精度が高く
 *   （「★LED映像の納品仕様を照会 — 先方は素材制作に着手…」のように状況ごと書く）、
 *   整形器の20字の件名で置き換えると**改悪になります**
 * - **`next_action` / `next_action_date` は空のときだけ埋めます。**
 *   入っているものは人か取込スキルが決めた値で、そちらが正
 * - **`description`（原文）は1バイトも触りません。** 整形が的外れなときに
 *   画面の「打った文をみる」から戻せます（`ai_formatted` が立つので出ます）
 * - **`body_html`（v1 の整形結果）も触りません。** 消すと、構造の書き込みに
 *   失敗した行が「整形前」より読みにくくなります（画面は構造を優先して描く）
 *
 * ── 一度整えた行は二度と触らない ────────────────────────────
 *
 * 待ち行列は**行の状態で表します**（ジョブの表は作らない）。
 *   整えた   = `body_struct IS NOT NULL`
 *   失敗した = `body_struct IS NULL AND format_error IS NOT NULL`
 *   まだ     = `body_struct IS NULL AND format_error IS NULL`
 *              （かつ人が入れた本文ではない = `body_html IS NULL OR ai_formatted`）
 *
 * **失敗の印は `format_error` に寄せています**（migration 188）。v1 は
 * `format_attempted_at` を印にしていましたが、**成功時にも立てている**ため
 * 成功と失敗を見分けられませんでした（v1 では `body_html` の有無が成功の印
 * だったので成り立っていた）。印が無いと、何度呼んでも失敗する行（長すぎる等）を
 * 毎回呼んで課金され続け、待ち行列も減りません。
 *
 * ⚠️ **v1 で整えた行（`body_html` があり `body_struct` が無い）はもう一度対象です。**
 * 1件につき1回 AI を呼ぶので課金されます。件数と推定費用は押す前に画面に出ます。
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
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  recordAiOutput, findLatestAiOutput, recordCorrections,
} from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { perRowCost, type CostReason } from '../../../shared/services/ai-usage.service';
import {
  formatActivity, isActivityAiConfigured, MAX_ACTIVITY_CHARS,
  type StructuredActivity,
} from './activity-ai.service';
import type { ActivityStruct } from '../../../shared/services/activity-struct';
import { ACTIVITY_FORMAT_KIND } from './activity-log.service';

/** バックフィルの印。対話経路（`activity.format`）と統計を混ぜないために分ける */
export const BACKFILL_TOOL_NAME = 'activity.backfill';

/** 1回で整える上限の既定。**大きくしない** — 落ちたときに課金だけ進むのを避ける */
export const DEFAULT_BATCH = 20;

/** 1回で整える上限の上限。画面から大きい数を送られても超えない */
export const MAX_BATCH = 200;

/**
 * 「窓を掛けない」ことを表す日数（`findLatestAiOutput` に渡す）。
 * **人が押した「違う」に時効は無い**（下記 `redoFormat`）。
 */
const NO_WINDOW_DAYS = 36_500;

/**
 * 「まだ整えていない」の条件。**件数を数えるのと拾ってくるのは必ず同じ式**にする
 * — 別々に書くと、画面が「残り 12 件」と言うのに押しても 0 件しか流れない、
 * という追いにくいずれ方をします。
 *
 * **人が入れた本文は対象にしません**（`body_html` があって `ai_formatted` が false）。
 * 人が書いたものを AI の構造で置き換えることになるためです。
 */
const PENDING_SQL = `body_struct IS NULL
        AND format_error IS NULL
        AND (body_html IS NULL OR ai_formatted)`;

export interface FormatQueueStats {
  /** まだ整えていない（これから対象になる）件数 */
  pending: number;
  /** 試したが整えられなかった件数（理由は行に残っている） */
  failed: number;
  /** 整え終わっている件数 */
  formatted: number;
  /**
   * **人が入れた本文があるので触らない件数**（`body_html` があり `ai_formatted` が false）。
   * この3つのどれにも入らないので、**持っていないと合計が合わなくなります**
   * （「残り 12・済み 30・失敗 1 なのに全部で 44 件」の理由が誰にも説明できない）。
   */
  skipped: number;
  /** 素の本文を持つ行の総数（pending + failed + formatted + skipped と一致する） */
  total: number;
  /** 1件あたりの平均費用（USD）。**実績が無い / 単価未設定なら null**（推測しない） */
  /**
   * 金額が出せないときの**理由**。`usdPerRow` が `null` になる状況は**3つ**あり、
   * **打ち手がそれぞれ違います**（`perRowCost` の説明）。画面はこれで文言を変えます。
   */
  costReason: CostReason;
  /** 単価が無くて数えられなかったモデル。**どの鍵を足せばよいか**を画面に出す */
  unpricedModels: string[];
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
       COUNT(*) FILTER (WHERE ${PENDING_SQL}) AS pending,
       COUNT(*) FILTER (WHERE body_struct IS NULL AND format_error IS NOT NULL) AS failed,
       COUNT(*) FILTER (WHERE body_struct IS NOT NULL) AS formatted,
       COUNT(*) FILTER (WHERE body_struct IS NULL AND format_error IS NULL
                          AND body_html IS NOT NULL AND NOT ai_formatted) AS skipped,
       COUNT(*) AS total
     FROM activity_logs
     WHERE deleted_at IS NULL
       AND description IS NOT NULL AND btrim(description) <> ''`,
  ) as Record<string, unknown> | undefined;

  const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  const pending = num(row?.pending);

  // 実績（過去90日）から1件あたりを出す。**費用が出せない回は分母から外す**
  const cost = await perRowCost('activity');
  const usdPerRow = cost.usdPerRow;

  return {
    pending,
    failed: num(row?.failed),
    formatted: num(row?.formatted),
    skipped: num(row?.skipped),
    total: num(row?.total),
    costReason: cost.reason,
    unpricedModels: cost.unpricedModels,
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
  struct: ActivityStruct | null;
  nextAction: string | null;
  nextActionDate: string | null;
} {
  const has = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  return {
    // 埋める対象。整形器が構造を組み立てられなかったら null のまま（＝失敗として扱う）
    struct: ai.struct,
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
        AND ${PENDING_SQL}
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
      if (!merged.struct) throw new Error('整えた本文が空でした');

      // **AI が出したものの全文を先に残す**（条件1）。ここが後で「人がどこを直したか」の before。
      // 件名は上書きしないが、**AI が何を出したかは残す** — 差分で「件名は使わなかった」が読める
      const aiOutputId = await recordAiOutput({
        kind: ACTIVITY_FORMAT_KIND,
        targetTable: 'activity_logs',
        targetId: row.id,
        payload: {
          original,
          subject: ai.subject, body_struct: ai.struct,
          next_action: ai.nextAction, next_action_date: ai.nextActionDate,
          // **網羅量を残す**（条件1）。「短い」という指摘を後から数字で確かめられる
          coverage: ai.coverage,
          // 実際に行へ書いた値。**出したものと書いたものが違う**ので両方残す
          applied: merged,
        },
        toolName: BACKFILL_TOOL_NAME,
        model: ai.model,
        promptVersion: ai.promptVersion,
        actorId,
      });

      // **`body_struct IS NULL` を条件に残す。** 同じ行を2つの回が拾ったとき
      // （画面から流しながら定時実行が起きた等）、後から来たほうを書かせない
      await execute(
        `UPDATE activity_logs
            SET body_struct = ?::jsonb,
                next_action = ?, next_action_date = ?,
                ai_formatted = TRUE, ai_output_id = COALESCE(ai_output_id, ?),
                format_attempted_at = NOW(), format_error = NULL,
                updated_at = NOW()
          WHERE id = ? AND body_struct IS NULL`,
        [JSON.stringify(merged.struct),
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
 * 「この整形は違う」— 1件を待ち行列に戻す（やり取りタブの「整え直す」）。
 *
 * ── なぜ必要になったか（v2 で重くなった）──────────────────────
 *
 * v1 の整形は本文を1本の文章にするだけでした。v2 は **AI が「誰の発言か」を
 * 決めます**（migration 188）。取り違えると、**当社が答えたことが取引先の
 * 発言として残ります** — 社内の記録とはいえ、あとで取引先との話の根拠に
 * 使われるものなので、直せないままにはできません。
 *
 * ── 会社方針「AI を使い捨てにしない」の条件2 ────────────────
 *
 * 本文を人が直せる画面はまだありません（`ActivityLogPage` の編集は
 * 件名・原文・次にやることだけ）。**「この整形は違う」は、いま集められる
 * いちばん強い人の信号**なので、`ai_corrections` に `reject` として残します。
 *
 * ⚠️ **ここでは7日窓を掛けません**（`findLatestAiOutput` の既定を上書き）。
 * 窓は「ふつうの業務更新を AI の誤りと数えない」ためのもので、
 * **人がボタンを押して「違う」と言ったものは、いつ押されても誤りです**。
 *
 * ⚠️ **`ai_formatted` と `body_html` は落としません。**
 *   ・`ai_formatted` を false にすると `(body_html IS NULL OR ai_formatted)` に
 *     引っかかって「人が入れた本文」と見なされ、**二度と拾われません**
 *   ・v1 の `body_html` は、整え直しが済むまでの読み物として残す
 */
export async function redoFormat(id: string, actorId: string | null): Promise<void> {
  const row = await queryOne(
    `SELECT id, description, body_struct, body_html, ai_formatted
       FROM activity_logs WHERE id = ? AND deleted_at IS NULL`, [id],
  ) as { id: string; description: string | null; body_struct: unknown;
         body_html: string | null; ai_formatted: boolean } | undefined;
  if (!row) throw new AppError(404, 'NOT_FOUND', '活動記録が見つかりません');
  // **原文が無ければ整え直せない。** 戻したうえで整えられないと、いま出ているものまで消える
  if (!String(row.description ?? '').trim()) {
    throw new AppError(400, 'NO_ORIGINAL', '打った文が残っていないので整え直せません');
  }

  /**
   * ⚠️ **人が書いた本文の行は整え直せない**（レビューでの指摘 #93）。
   *
   * 待ち行列は `body_html IS NULL OR ai_formatted` を要求します（`PENDING_SQL`）。
   * つまり **`body_html` があって AI の印が無い行は、戻しても永久に対象になりません**。
   * 前の版はここを通していたので、押しても**何も起きず、理由も出ませんでした**
   * （画面は変わらないので、押した人は何度でも押します）。
   *
   * **画面で隠すだけにしない** — 古いタブ・直接叩きから通ります。
   */
  if (row.body_html && !row.ai_formatted) {
    throw new AppError(400, 'NOT_AI_FORMATTED',
      'この記録の本文は AI が整えたものではないので、整え直せません');
  }

  /**
   * ⚠️ **中身が無いときは差分を残さない**（同じ指摘）。
   * `before` も `after` も `null` の「不採用」は**何も否定していない記録**で、
   * 無修正採用率の分母だけを増やします（会社方針の条件2が測れなくなる）。
   * 続けて2回押されると、2回目がちょうどこの形になります。
   */
  const out = row.body_struct == null
    ? null
    : await findLatestAiOutput('activity_logs', id, ACTIVITY_FORMAT_KIND, NO_WINDOW_DAYS);
  if (out) {
    await recordCorrections(out.id, [{
      fieldPath: 'body_struct',
      before: row.body_struct ?? null,
      after: null,
      type: 'reject',
    }], actorId);
  }

  await execute(
    `UPDATE activity_logs
        SET body_struct = NULL, format_attempted_at = NULL, format_error = NULL, updated_at = NOW()
      WHERE id = ?`,
    [id],
  );
}

/**
 * 失敗した行をもう一度対象に戻す（画面の「もう一度試す」用）。
 *
 * プロンプトを直したあと・長さの上限を上げたあとに使います。
 * **構造が入っている行は戻しません**（整え終わったものを作り直さない）。
 */
export async function resetFailed(): Promise<number> {
  const rows = await queryAll(
    `UPDATE activity_logs
        SET format_attempted_at = NULL, format_error = NULL
      WHERE deleted_at IS NULL AND body_struct IS NULL AND format_error IS NOT NULL
      RETURNING id`,
  ) as { id: string }[];
  return rows.length;
}
