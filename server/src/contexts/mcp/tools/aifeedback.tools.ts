import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getFeedbackDigest, OPS_NEWS_ITEM_KIND, type FeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { queryOne } from '../../../shared/db/connection';
import { PROJECT_DRAFT_KIND } from '../../sales/services/project-ai-feedback.service';
import { ACTIVITY_FORMAT_KIND, ACTIVITY_INTAKE_KIND } from '../../sales/services/activity-log.service';
import { NEXT_ACTION_SHORT_KIND } from '../../sales/services/next-action-short.service';
import { KPT_DRAFT_KIND } from '../../sales/services/kpt.service';
import { MINUTES_KIND } from '../../sales/services/minutes.service';
import { FINANCE_DOC_INTAKE_KIND, INQUIRY_INTAKE_KIND } from '../../dailyops/services/inbox-ai-feedback.service';
import { GPM_PROJECT_DRAFT_KIND, GPM_TASK_DRAFT_KIND } from '../../gpm/services/gpm-ai-feedback.service';
import { QSHEET_AI_KINDS, isQsheetAiKind } from '../../qsheet/ai/kinds';
import {
  WIKI_AI_KINDS, WIKI_ANSWER_KIND, WIKI_DRAFT_KIND, WIKI_REWRITE_KIND, type WikiAiKind,
} from '../../wiki/services/wiki-ai.constants';
import { getWikiAiDigest } from '../../wiki/services/wiki-ai-digest.service';
import { ok, runTool, actorContext } from '../helpers';
import { actorHasPermission, type ToolPermission } from '../gate';

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
  // メール取込が書いた活動記録の本文（2026-09）。**整形（activity_format）とは別**で、
  // ここが「取り込んだ本文が短い／落ちている」を映す。取込スキルが手順0で読む
  ACTIVITY_INTAKE_KIND,
  NEXT_ACTION_SHORT_KIND,
  KPT_DRAFT_KIND,
  MINUTES_KIND,
  // デイリーニュースの AI 投稿（Phase 2 ③）。ニュースを起票するスキルが「どんな投稿が
  // 削除されがちか」を生成前に読めるようにする（HTTP の /ai-activity だけだと AI 側から
  // ループが閉じない）。本文は社内周知でありセリフのような秘匿対象ではないので degrade しない
  OPS_NEWS_ITEM_KIND,
  // プロジェクト管理 (GPM)。create_gpm_project / create_gpm_task の起票を人がどう直したか
  GPM_PROJECT_DRAFT_KIND,
  GPM_TASK_DRAFT_KIND,
  ...QSHEET_AI_KINDS,
  // Wiki（2026-09 新設・設計 `docs/design/v4/wiki.md` §7-3 条件4）。
  // 「AI に聞く」の的外れの多さ・出典が開かれない傾向と、下書きの直され方をここから読む。
  // **足りないページ（答えられなかった質問）の件数も advice に載る** — Wiki では
  // プロンプトを直すより、そのページを書くほうが効く（§7-2）。
  ...WIKI_AI_KINDS,
] as const;

/**
 * **kind ごとに要る権限**（Codex のセキュリティレビュー指摘・P1・PR #717）。
 *
 * ── なぜツール名の表（`gate.ts`）では足りないか ──────────────────
 *
 * `get_ai_feedback_digest` は**意図して権限ゲートに載せていません** —
 * 取込スキルが実行前に必ず読む契約だからです（`docs/mcp-server.md`）。
 * ところが digest は `recent_examples` に**人の修正の before / after をそのまま**
 * 返します。`activity_intake` はその before / after が
 * **取引先から届いたメールの本文まるごと**（最大 20,000 字）です。
 *
 * つまりツール名だけで見ていると、**権限ゼロの OAuth アカウントでも
 * 顧客とのやり取り・連絡先・取引条件が読めます**。ゲートはツール名で効くので、
 * **`kind` を見る判定はツールの中に置くしかありません**。
 *
 * ── 割り当ての根拠 ────────────────────────────────────────────
 *
 * **その kind を書く側のツールと同じモジュール**に揃えます（読める人＝書ける人）。
 * 取込スキルは `create_activity_log`（`sales` の editor）を呼べる actor で動くので、
 * ここで `sales` の reader を求めても**取込の実行は壊れません**。
 *
 * ここに**載っていない kind は今までどおり素通り**です（`task_intake` のような
 * 個人スコープ、`ops_news_item` のような社内周知）。**黙って全部を塞がない** —
 * 本番のメール取込スキルが最短1時間おきに叩いており、
 * 塞ぎすぎると次の実行から落ちます。
 */
const KIND_PERMISSION: Record<string, ToolPermission> = {
  // 中身が取引先とのやり取りそのもの（本文・件名・次にやること）
  [ACTIVITY_INTAKE_KIND]: { module: 'sales', level: 'reader' },
  [ACTIVITY_FORMAT_KIND]: { module: 'sales', level: 'reader' },
  [NEXT_ACTION_SHORT_KIND]: { module: 'sales', level: 'reader' },
  // 打合せの文字起こしと議事録（取引先との合意の記録）
  [MINUTES_KIND]: { module: 'sales', level: 'reader' },
  // 案件・見積・KPT（金額と取引条件）
  estimate_draft: { module: 'sales', level: 'reader' },
  [PROJECT_DRAFT_KIND]: { module: 'sales', level: 'reader' },
  [KPT_DRAFT_KIND]: { module: 'sales', level: 'reader' },
  [GPM_PROJECT_DRAFT_KIND]: { module: 'sales', level: 'reader' },
  [GPM_TASK_DRAFT_KIND]: { module: 'sales', level: 'reader' },
  // 取り込んだ情報・受領書類。**書く側の表（`gate.ts`）と同じモジュールにする**
  [INQUIRY_INTAKE_KIND]: { module: 'dailyops', level: 'reader' },
  [FINANCE_DOC_INTAKE_KIND]: { module: ['dailyops', 'sales'], level: 'reader' },
  /*
   * Wiki（設計 `docs/design/v4/wiki.md` §7-3 条件4・§8）。**書く側と同じ区画**に揃える
   * （`gate.ts` の `search_wiki` … が `wiki` の reader、`create_wiki_page` が editor）。
   *
   * ⚠️ 質問の文・下書きの本文・整える前のメモは、**読めないスペースの中身を含みうる**
   * （人が打った文なので何が書いてあるか分からない）。
   *
   * ⚠️ **manager にそろえる**（#733 の再レビュー・Codex 指摘・P1）。画面の口
   * （`GET /wiki/ai/digest`）は manager だけなのに、ここを reader にしていたため、
   * 画面では見られない人が MCP からは読めた。静的 API キーは素通りのままだが、
   * Wiki の digest は**質問の文を返さない形**にした（`wiki-ai-digest.service.ts`）ので、
   * 届くのは率と件数だけになる。
   */
  [WIKI_ANSWER_KIND]: { module: 'wiki', level: 'manager' },
  [WIKI_DRAFT_KIND]: { module: 'wiki', level: 'manager' },
  [WIKI_REWRITE_KIND]: { module: 'wiki', level: 'manager' },
};

/**
 * その kind を読んでよい actor か。足りなければ**理由を言って断る**
 * （黙って空を返すと、AI は「傾向が無い」と読んで学習をやめます）。
 *
 * 静的 API キーは運用鍵として素通り（`gate.ts` の `enforceToolPermissions` と同じ扱い）。
 */
async function assertKindReadable(kind: string): Promise<void> {
  const need = KIND_PERMISSION[kind];
  if (!need) return;
  const actor = actorContext.getStore();
  if (!actor?.isOAuth) return;
  if (await actorHasPermission(actor.actorId, need.module, need.level)) return;
  const label = Array.isArray(need.module) ? need.module.join(' か ') : need.module;
  throw new Error(
    `権限が不足しています: kind='${kind}' の傾向を読むには「${label}」モジュールの ${need.level} 以上の権限が必要です`,
  );
}

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

/**
 * Wiki の3 kind か（設計 `docs/design/v4/wiki.md` §7-3 条件4）。
 *
 * ⚠️ **文字列を書き写さない** — `WIKI_AI_KINDS` が正で、名前を変えた日に
 * ここだけが黙って古くならないようにする（`KNOWN_KINDS` と同じ理由）。
 */
const isWikiKind = (kind: string): kind is WikiAiKind =>
  (WIKI_AI_KINDS as readonly string[]).includes(kind);

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
        'wiki 系 kind (wiki_answer / wiki_draft / wiki_rewrite) は Wiki 専用の集計を返す。' +
        '`answer` は出典が開かれた率・「ページにする」に進んだ率・7日以内の再質問率・3値の評価、' +
        '`draft` は7日以内に公開された率と公開後30日の閲覧数・他の人が直した回数、' +
        '`rewrite` は整えた結果が置き換えられた率。' +
        '`gaps` は**まだ Wiki に書かれていないために答えられなかった質問**の件数と最多の質問で、' +
        '**Wiki では知識そのものがページなので、そのページを書くことが最大の改善**になる ' +
        '(プロンプトを直すより先に、足りないページを書き起こすこと)。' +
        'wiki 系は `recent_examples` を返さない (人が直した本文には閲覧範囲の限られたスペースの ' +
        '中身が混ざりうるため、誰に対しても出さない)。' +
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
            'gpm_project_draft・gpm_task_draft (create_gpm_project / create_gpm_task で起票した' +
            'プロジェクト管理の行。人が直した差分が入る) / ' +
            'inquiry_intake (record_inquiry で取り込んだ情報。仕分けの行き先と見送り率が入る) / ' +
            'finance_doc_intake (record_finance_doc で取り込んだ書類) / ' +
            'event_plan_draft・script_outline_draft・script_line_draft (制作資料の AI 提案。' +
            'script_outline_draft は outline、script_line_draft は line、production_chat は chat の' +
            '追加項目が付く) / ' +
            'wiki_answer・wiki_draft・wiki_rewrite (Wiki の AI。順に「AI に聞く」「AI で下書きを作る」' +
            '「AI で整える」。**Wiki のページを書く・直す前にこれを読む**。wiki_answer には' +
            '「答えられなかった質問」の件数 (gaps) が付き、そこが Wiki の穴そのもの)'
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
        // **kind を見てから断る**（ツール名だけのゲートでは足りない。上の注意書き）
        await assertKindReadable(kind);
        /*
         * Wiki は**専用の集計**（`getWikiAiDigest`）を返す。共通の集計に
         * 出典が開かれた率・再質問率・公開まで進んだ率・足りないページの件数を
         * 足したもので、**新しい集計はここに書かない**（同じ数字を2か所で作ると、
         * 片方を直した日に食い違う）。
         *
         * ⚠️ **`recent_examples` は最初から入っていない。** 人が直した before / after には
         * 読めないスペースの本文が混ざりえるため、Wiki の集計は実例を返さない作りに
         * してある（`wiki-ai-digest.service.ts` の注記・§8）。qsheet のように
         * manager で degrade するのではなく、**誰に対しても出さない**。
         */
        if (isWikiKind(kind)) return ok(await getWikiAiDigest(kind, args.window_days ?? 90));
        const digest = await getFeedbackDigest(kind, args.window_days ?? 90, {
          segmentKey: args.segment_key, source: args.source,
        });
        return ok((await shouldDegradeQsheet(kind)) ? degrade(digest) : digest);
      }),
  );
}
