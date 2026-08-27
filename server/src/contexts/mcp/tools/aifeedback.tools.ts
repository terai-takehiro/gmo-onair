import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getFeedbackDigest, OPS_NEWS_ITEM_KIND, type FeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { queryOne } from '../../../shared/db/connection';
import { PROJECT_DRAFT_KIND } from '../../sales/services/project-ai-feedback.service';
import { ACTIVITY_FORMAT_KIND } from '../../sales/services/activity-log.service';
import { NEXT_ACTION_SHORT_KIND } from '../../sales/services/next-action-short.service';
import { KPT_DRAFT_KIND } from '../../sales/services/kpt.service';
import { MINUTES_KIND } from '../../sales/services/minutes.service';
import { FINANCE_DOC_INTAKE_KIND, INQUIRY_INTAKE_KIND } from '../../dailyops/services/inbox-ai-feedback.service';
import { QSHEET_AI_KINDS, isQsheetAiKind } from '../../qsheet/ai/kinds';
import { ok, runTool, actorContext } from '../helpers';

// AI フィードバックの還流 (ai-feedback-loop Phase 4) — 読み取り専用。
//
// 方針「AIを使い捨てにしない」の閉じたループの最後の一辺。人間の修正差分を貯めるだけでは
// 賢くならないので、AI 自身が「自分の直近の誤り傾向」を読めるようにする。
// **プロンプトやスキルの更新を待たず、次の実行から効く**のがこの経路の価値。

/**
 * 既知の kind の一覧。**書き写さない** — 各サービスの定数を import しているので、
 * どこかの kind を変えても、ここが黙って古いままにはならない
 * （`ai-feedback.service.ts` の `MINUTES_KIND` import と同じ理由）。
 *
 * `estimate_draft` / `task_intake` には専用の定数が無い（複数箇所に散らばった素の文字列の
 * ままで、集約すると本題より大きくなる）ので、ここだけリテラルのまま持つ。
 *
 * ⚠️ **`z.enum` にはするが、`kind` は `.optional()` のまま**（04-ai.md §5-6・
 * 07-ai-proposals-impl.md §7-2・§13 #13）。**Git 管理外のメール取込スキルが
 * 最短1時間おきに叩いている**ため、必須にすると次の実行から全部落ちる。
 */
const KNOWN_KINDS = [
  'estimate_draft',
  PROJECT_DRAFT_KIND,
  'task_intake',
  INQUIRY_INTAKE_KIND,
  FINANCE_DOC_INTAKE_KIND,
  ACTIVITY_FORMAT_KIND,
  NEXT_ACTION_SHORT_KIND,
  KPT_DRAFT_KIND,
  MINUTES_KIND,
  // デイリーニュースの AI 投稿（Phase 2 ③）。ニュースを起票するスキルが「どんな投稿が
  // 削除されがちか」を生成前に読めるようにする（HTTP の /ai-activity だけだと AI 側から
  // ループが閉じない）。本文は社内周知でありセリフのような秘匿対象ではないので degrade しない
  OPS_NEWS_ITEM_KIND,
  ...QSHEET_AI_KINDS,
] as const;

/**
 * qsheet 系 kind の `recent_examples` を落とす degrade（07-ai-proposals-impl.md §7-2 案B）。
 *
 * **二重防御の片割れ。** 台詞の本文は `ai_corrections` に積む時点で既に
 * `{ len, head, hash }` に落としてある（案A・`redact.ts`）が、ここでも**読める相手を絞る**。
 * A だけだと `ops_reports` 等に個票を貼った瞬間に別モジュールの reader 権限から読めてしまい、
 * B だけだと redact を1か所でも忘れた日に全部そのまま出る。どちらか片方だけにしない。
 *
 * 読める条件: OAuth actor（静的 API キーではない）**かつ** `qsheet` の `manager` 以上。
 * 静的キーはリクエスト元のユーザーを区別できない共用鍵なので、常に degrade する。
 */
async function shouldDegradeQsheet(kind: string): Promise<boolean> {
  if (!isQsheetAiKind(kind)) return false;
  const actor = actorContext.getStore();
  if (!actor?.isOAuth) return true; // 静的 API キー = 誰でも呼べる共用鍵
  const user = (await queryOne('SELECT role FROM users WHERE id = ?', [actor.actorId])) as { role?: string } | null;
  if (!user) return true;
  if (user.role === 'system_admin') return false;
  const perm = (await queryOne(
    'SELECT access_level FROM user_permissions WHERE user_id = ? AND module = ?',
    [actor.actorId, 'qsheet'],
  )) as { access_level?: string } | null;
  return !(perm?.access_level === 'manager' || perm?.access_level === 'owner');
}

function degrade(digest: FeedbackDigest): FeedbackDigest {
  return {
    ...digest,
    recent_examples: [],
    advice: [
      ...digest.advice,
      '（台本の修正例は qsheet の manager 以上のみ閲覧できます。集計値のみ表示しています）',
    ],
  };
}

export function registerAiFeedbackTools(server: McpServer): void {
  server.registerTool(
    'get_ai_feedback_digest',
    {
      title: 'AI出力の修正傾向ダイジェスト (生成前に読む)',
      description:
        'AI が過去に出した内容を人間がどう直したかの集計を返す。' +
        '無修正採用率・よく直されるフィールド・直近の修正例 (before→after)・成果と、' +
        'それを踏まえた助言文 (advice) を含む。' +
        '**見積の下書き・案件起票・タスクの下書きなどを生成する前に必ず一度読み、' +
        'advice と top_corrected_field_types を踏まえて出力すること。** ' +
        '例: 単価がよく下方修正されているなら、料金表の定価をそのまま置くのではなく過去の修正幅を考慮する。' +
        'データがまだ無い場合は advice が「傾向は不明」を返すので通常どおり作成してよい。' +
        '\n\n返り値の読み方: ' +
        '`top_corrected_field_types` は配列の鍵を潰した集計 (`tasks[].due_at` 等) で、' +
        '**どのフィールドが弱いかを読むのはこちら**。' +
        '`top_corrected_fields` は鍵ごとの集計で、見積の `items[camera].unit_price` のように' +
        '鍵自体に意味がある場合だけ見る (通し番号の鍵では意味を持たない)。' +
        '`by_model` はモデル / プロンプト版ごとの無修正採用率で、改善したかを比較する単位。' +
        '`intake` (kind=task_intake のとき) は誤検知率 (人がチェックを外した割合) と、' +
        '投入から生まれたタスクの期限内完了率を含む。' +
        '誤検知率が高いなら拾いすぎ、期限内完了率が低いなら置いた期限が短すぎる疑いがある。' +
        '`inquiry` (kind=inquiry_intake のとき) は取り込んだ情報の行き先 ' +
        '(チケット / 案件 / ストック / 見送り) と見送り率。**見送り率が高いなら拾いすぎ。** ' +
        'qsheet 系 kind (event_plan_draft / script_outline_draft / script_line_draft) は ' +
        '`recent_examples` の閲覧に qsheet の manager 以上を要求する (無ければ集計値のみ)。' +
        'segment_key (制作資料のみ) で案件種別×拠点を絞れる (例 type:ceremony|loc:yoga)。' +
        '式典と配信では尺の傾向が逆になるため、絞れるときは絞ったほうがよい ' +
        '(母数が10件未満なら自動で全社集計に落ちる)。source (制作資料のみ) は ' +
        'server=画面からの生成 / mcp=このツール経由の提案 (propose_sheet_draft。旧 propose_qsheet_draft) を分けて見る。',
      inputSchema: {
        kind: z
          .enum(KNOWN_KINDS)
          .optional()
          .describe(
            'AI出力の種別 (既定 estimate_draft)。記録があるのは ' +
            'estimate_draft (見積の下書き) / task_intake (投入欄からのタスク下書き) / ' +
            'project_draft (create_project で起票したネタ案件。受付で人が直した差分が入る) / ' +
            'inquiry_intake (record_inquiry で取り込んだ情報。仕分けの行き先と見送り率が入る) / ' +
            'finance_doc_intake (record_finance_doc で取り込んだ書類) / ' +
            'event_plan_draft・script_outline_draft・script_line_draft (制作資料の AI 提案。' +
            'script_outline_draft は outline、script_line_draft は line、production_chat は chat の' +
            '追加項目が付く)'
          ),
        window_days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe('集計期間 (日・既定 90)'),
        segment_key: z
          .string()
          .max(100)
          .optional()
          .describe('制作資料のみ。type:<project_category>|loc:<location_id> の形'),
        source: z
          .enum(['server', 'mcp'])
          .optional()
          .describe('制作資料のみ。server=画面からの生成 / mcp=MCP経由の提案'),
      },
    },
    async (args) =>
      runTool(async () => {
        const kind = args.kind ?? 'estimate_draft';
        const digest = await getFeedbackDigest(kind, args.window_days ?? 90, {
          segmentKey: args.segment_key, source: args.source,
        });
        return ok((await shouldDegradeQsheet(kind)) ? degrade(digest) : digest);
      }),
  );
}
