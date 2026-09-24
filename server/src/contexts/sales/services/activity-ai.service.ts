/**
 * やり取りの「整えて記録する」— 打ちっぱなしの文 → 件名・状態・事実・発言・次にやること
 *
 * ── なぜ人に整えさせないか ──────────────────────────────────
 *
 * 電話を切った直後に書けるのは、たいてい**箇条書きにもなっていない走り書き**です。
 * ここで「件名」「本文」「次のアクション」の3つの欄を出すと、
 * **書くのが面倒になって記録そのものが残らなくなります**。
 * 人は打ちっぱなしで良い形にして、**形にするのは保存時に AI がやる**ことにしました。
 *
 * ── v2 で HTML を返させるのをやめた（migration 188）────────────
 *
 * v1 は `body_html` を1本返させていました。実際の取込メールは
 * **先方の言ったことと当社が答えたことが交互に並ぶやり取り**なのに、
 * 1本の HTML にすると**どちらの発言かは文の中にしか残りません**。
 * v2 は**意味の単位**（状態・事実・発言）を返させ、
 * **見せ方は画面が決めます**（`shared/services/activity-struct.ts`）。
 *
 * これで「AI に HTML を書かせない」という取込側の決めごと
 * （`rich-content.ts` の冒頭）と、やり取り側の作りが揃いました。
 *
 * ── v3 で「次にやること」の形を決めた ──────────────────────────
 *
 * `next_action` は自由文のままにしていたので、**言い切りとぶら下がる作業が
 * 1本に繋がった長文**が出ていました（画面は1つの段落として太字で流し込むので、
 * 10 行ぶんの塊になる。利用者から「読みづらい」とご指摘）。
 * v3 は **1文目で言い切り、ぶら下がる作業は `①` から順**と決めています
 * （画面が読み取って行に分ける: `projectDetail/thread/nextAction.ts`）。
 *
 * ⚠️ **これで直るのは、これから整える記録だけです。**
 * 取込メールは MCP の `create_activity_log` が `next_action` を直接書き、
 * **整形はすでに値がある行の `next_action` を上書きしません**
 * （`activity-format.service` の `has(row.next_action)`）。
 * **いま入っている値を読めるようにできるのは画面側だけ**なので、
 * 分ける処理は画面が持ちます（プロンプトはその形に寄せるだけ）。
 *
 * ── v5 で「会話ではない記録」の置き場（`sections`）を足した ────────────
 *
 * 形が「会話の往復」だけだったので、社内メモ（拘束時間・シフト表・拠点ごとの技術構成）は
 * `lead` の1〜3文と `facts` 8件に押し込まれ、**シフトの中身や人数・機材がほとんど落ちて**いました
 * （利用者から「要約が適当すぎる」とご指摘・27時間テレビの体制想定のメモ）。
 * v5 は原文の見出しごとの節（見出し＋行）を返させ、**時刻・人数・機材名を原文のまま**置きます。
 *
 * ── 議事録との違い ──────────────────────────────────────────
 *
 * 議事録（`minutes-ai.service`）は**取引先との合意の記録**なので、
 * 決定事項に引用を必須にし、言い切れないものは持ち帰りへ落とします。
 * こちらは**社内の記録**で、材料も1人が書いた短い文です。
 * 守ることは同じで**書かれていないことを足さない** — ただし
 * 落とすのではなく「読み取れなければ空にする」形にします。
 *
 * ── AI に返る仕組み（会社方針「AI を使い捨てにしない」）────────
 *
 *   条件1 記録   原文と整形結果を `ai_outputs`(kind=`activity_format`) に全文で
 *   条件2 差分   人が直して保存したときにサーバーが自動比較 → `ai_corrections`
 *   条件3 成果   「次にやること」が期限内に済んだか（`next_action_done_at` から導出）
 *   条件4 還流   `get_ai_feedback_digest` の advice を次の整形プロンプトに載せる
 *   条件5 レビュー 月1回・営業のマネージャー（既存の運用の決めに乗る）
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { resolveProvider, type IntakeAiProvider } from '../../tasks/services/intake-ai.service';
import { recordAiUsage } from '../../../shared/services/ai-usage.service';
import {
  normalizeActivityStruct, activityStructLength, type ActivityStruct,
} from '../../../shared/services/activity-struct';
import {
  coverageTarget, coverageBrief, coverageRetryNote, isTooThin,
} from '../../../shared/services/ai-coverage';
import { modelFor, tierFor } from '../../../shared/services/ai-model';

/** プロンプトを変えたら必ず上げる。`ai_outputs.prompt_version` に入り、改善効果の比較単位になる */
export const ACTIVITY_PROMPT_VERSION = 'activity-v5';
/** 過去の修正傾向を載せた版。**混ぜない** — 載せた効果を後から数字で言えなくなる */
export const ACTIVITY_PROMPT_VERSION_WITH_FEEDBACK = 'activity-v5+fb';


const TIMEOUT_MS = 60_000;

/**
 * **人が待っている経路の総予算**（`activity-log.service` の `create` に `format: true`）。
 *
 * nginx は `/api/` を **65 秒**で切ります（`nginx/gmo-onair.conf`）。切られると
 * 画面には理由の出ない失敗が出るのに、**サーバーは走り続けて行を作ります** —
 * 押した人はもう一度押すので、**同じ記録が2件できます**（Codex レビューでの指摘・PR #717）。
 *
 * だから「1回あたり」ではなく**総量**で見張ります。ここを超えそうなら
 * 拾い直しをやめ、**1回目の結果で返します**（短くても、504 と二重登録よりまし）。
 *
 * ⚠️ **SDK のやり直し（`maxRetries`）も総量に入ります。** 予算つきの呼び出しでは
 * 0 にしてあります — `maxRetries: 1` は「上限 60 秒」を**上限 120 秒**に変えるので、
 * 予算を書いた本人が気づけません（`minutes-ai.service` の同じ注意書きと同じ罠）。
 */
const REQUEST_BUDGET_MS = 45_000;

/** 拾い直しに要る最低の残り時間。これを割ったら**やらない**（始めて途中で切られるのが最悪） */
const RETRY_MIN_REMAINING_MS = 15_000;

/**
 * 整形に渡す文字数の上限。**超えたら切らずに断る**
 * （黙って切ると、後半に書いた「次にやること」が消えたことに気づけない）。
 */
export const MAX_ACTIVITY_CHARS = 20_000;

/**
 * 発言1つ。**空文字・空配列が「無い」**を表します
 * （省略可にすると、モデルによって欠けたり null になったりして扱いが増える）。
 */
const TurnSchema = z.object({
  side: z.enum(['them', 'us']).describe('them = 取引先の発言 / us = 当社の発言。判断が付かなければ them'),
  name: z.string().describe('発言した人の名前。原文に書かれているものだけ（「露崎様」など）。無ければ空文字'),
  org: z.string().describe('その人の所属。取引先名か「当社」。無ければ空文字'),
  at: z.string().describe('発言の日時。原文に書かれているものだけ（「7/30 21:54」など）。**推測しない**。無ければ空文字'),
  quote: z.string().describe(
    '原文の言葉をそのまま引く。言い換え・要約・敬語の直しをしない。'
    + '**その発言の要点が伝わるところまで引く**（1文で足りれば1文、'
    + '条件が並んでいるなら4文まで）。引ける言葉が無ければ空文字',
  ),
  note: z.string().describe('引用に収まらない補足。**1〜3文**。無ければ空文字'),
  fields: z.array(z.object({
    label: z.string().describe('項目名。**6字以内**（「搬入」「申込」「掲載ロゴ」）'),
    value: z.string().describe('その中身。1〜3文。**条件・期限・数量を落とさない**'),
  })).describe(
    '話が複数の項目に分かれているときだけ使う。分かれていなければ空配列。'
    + '**分かれているなら項目を省かない**（多くて10件）',
  ),
});

const ActivitySchema = z.object({
  subject: z.string().describe('件名。**20字以内**。言い切りの短い形（「撮影決定（先方確定）」）。何の話かが一目で分かること'),
  subtitle: z.string().describe('件名の続き。**30字以内**。何を頼まれた／決めたかを並べる（「搬入申請・GMOサイン・掲載ロゴを依頼」）。無ければ空文字'),
  statuses: z.array(z.object({
    label: z.string().describe('状態の名前。**8字以内**（「撮影決定」「昇格の判断待ち」）'),
    tone: z.enum(['decided', 'waiting', 'risk', 'info'])
      .describe('decided = 決まった / waiting = 相手か社内の返事を待っている / risk = 危ない・条件付き / info = そのほか'),
  })).describe(
    'この記録で決まったこと・待っていること。**原文がそう言っているものは全部**（多くて6件）。'
    + '件数を減らすために丸めないこと。無ければ空配列',
  ),
  facts: z.array(z.object({
    icon: z.enum(['date', 'people', 'gear', 'money', 'place', 'doc'])
      .describe('date = 日付・時間 / people = 人数・体制 / gear = 機材 / money = 金額・見積 / place = 場所 / doc = 書類そのほか'),
    value: z.string().describe('値だけを書く。**項目名を書かない**（「日時: 8/10」ではなく「8/10 5:00–20:00」）。30字程度'),
  })).describe(
    '日時・体制・機材・見積などの事実。**原文に書かれている数字と固有名詞は落とさない**'
    + '（多くて8件）。無ければ空配列',
  ),
  lead: z.string().describe(
    'この記録全体の要約。**1〜3文**（話が複数に分かれているなら3文）。'
    + 'いちばん大事な条件だけ `**` で囲んで強調してよい。'
    + '**発言の中身を繰り返さない**（続きに発言が並ぶので二度読ませることになる）',
  ),
  turns: z.array(TurnSchema).describe(
    'やり取りを時間の順に並べる。**原文にある往復は省かない**（多くて12件）。'
    + 'やり取りが1回しか無ければ1件。'
    + '相手と当社の発言が読み取れないとき（社内メモ・予定表・体制案）は空配列にして、中身は sections に置く',
  ),
  sections: z.array(z.object({
    heading: z.string().describe(
      '節の見出し。**原文の見出しをそのまま使う**（「拘束時間」「放送本部」「ベーススタジオ 第1班」）。'
      + '原文に見出しが無ければ中身を表す短い名詞。24字以内',
    ),
    items: z.array(z.string()).describe(
      'その節の中身を**1行ずつ**。原文の1行・1項目が1件。'
      + '**時刻・人数・機材名・番組名は原文の文字のまま**（「19:00 - 20:00 オープニング」「CAM×6（Z300クラス）」）。'
      + '行を束ねない・言い換えない・省かない（多くて40件）',
    ),
  })).describe(
    '**会話ではない記録**（社内メモ・予定表・シフト・体制案・機材の構成）の中身。'
    + '原文の見出しごとに1節（多くて12節）。**原文にある行は全部どこかの節に置く**。'
    + '取引先とのやり取りだけの記録では空配列（中身は turns に置く）',
  ),
  next_action: z.string().describe(
    '次にやること。原文に書かれているものだけ。無ければ空文字。**推測しない**。'
    + '**1文目に「いつまでに何をするか」を言い切る**（一覧と概要はこの1文しか出さない）。'
    + 'ぶら下がる作業が複数あるときだけ、2文目以降を `①` から順に丸数字で並べる'
    + '（`・` や `-` を使わない。番号を合わせるために作業を作らない）',
  ),
  next_action_date: z.string().describe('その期限。"YYYY-MM-DD"。はっきり書かれていなければ空文字。**推測しない**'),
});

const SYSTEM_PROMPT = `あなたは制作会社の営業事務です。
担当者が書いた／メールから取り込んだ「やり取りの記録」を、あとから読める形に整えます。

**HTML は書きません。** 意味の単位（状態・事実・発言）に分けるところまでがあなたの仕事で、
見た目（書体・色・余白・アイコン）は画面が決めます。

## 絶対に守ること

1. **書かれていないことを書かない。** 補う・整合させる・言い換えて意味を強めることは
   すべて誤りです。読み取れないものは空にしてください。
   これは社内の記録ですが、**あとで取引先との話の根拠に使われます**。

2. **言葉を勝手に置き換えない。** 「見積」を「お見積書」に、「NG」を「不可」に直すような
   書き換えはしないでください。**引用（quote）は原文の文字のまま**にします。

3. **次にやることは、原文にあるものだけ。** 「〜しないと」「〜する」と書かれているものを拾います。
   書かれていなければ空文字にしてください。**気を利かせて作らないこと。**

   **1文目で言い切ってください** —「いつまでに何をするか」。一覧・概要タブに出るのはこの1文だけです。
   ぶら下がる作業が複数あるときだけ、2文目以降を \`①\` から順に丸数字で並べます
   （画面が丸数字を読み取って1件ずつの行にします）。**作業が1つなら1文で終えること。**

4. **日付を推測しない。** 「来週」「そのうち」「なるべく早く」は空文字です。
   「11月14日」のようにはっきり書かれているものだけ YYYY-MM-DD にします。
   年が書かれていないときは、渡された「やり取りの日」から**最も近い将来の日付**にしてください。

5. **評価を書かない。** 「良い打合せでした」「前向きです」のような感想は入れないこと。
   ただし**取引先が言った評価は引用として残します**（「感動しました」と言われたのは事実）。

## 落とさないこと（いちばんよく失敗するところ）

**原文は残りますが、読まれるのは整えたほうです。** ここに書かなかったことは、
一覧にも概要にも出ません。**短くまとめるのはあなたの仕事ではありません。**

落としてはいけないもの:

- **依頼・宿題・条件**（「〜までに」「〜が必要」「〜なら可」）は1つ残らず
- **数字・日付・金額・数量・固有名詞**（人名・会社名・機材名・場所）
- **先方が示した懸念・NG・保留**（後から「言った / 言わない」になる）
- **往復のやり取り**。メールが3往復なら \`turns\` も3件以上です

**件数の上限は「そこで止めろ」ではありません。** 上限まで使ってよく、
原文に4件あるのに3件で切るのは誤りです。

## それでも重ねて書かないこと

落とさないことと、同じことを2度書くことは別です。

- \`lead\` は全体の1〜3文。**発言の中身を繰り返さない**（続きに発言が並ぶ）
- \`quote\` は**その発言の要点が伝わるところまで**。挨拶・署名・引用返信は引かない
- \`facts\` は値だけ（「8/10 5:00–20:00」）。**「日時：」のような項目名を書かない**
- \`statuses\` は名前だけ（「撮影決定」）。文にしない

## 誰の発言かを分ける

取り込んだメールは、先方の依頼と当社の回答が交互に並びます。
**\`turns\` で分けてください** — 1本の文章にまとめると、どちらが言ったことなのかが
文の中にしか残らず、読む人が毎回頭で分解することになります。

- 先方が言ったこと → \`side: "them"\`、\`org\` は取引先名
- 当社が答えたこと → \`side: "us"\`、\`org\` は「当社」
- **どちらか分からないものは \`them\`** にしてください
- 当社の回答が「搬入は〜」「申込は〜」と項目に分かれているときは \`fields\` を使う

短い電話のように**やり取りが1回しか無い記録**では、\`turns\` を1件にしてください。
**無理に膨らませないこと。**

## 会話ではない記録（社内メモ・予定表・体制案）

拘束時間・シフト表・拠点ごとの機材や人数の一覧のような**社内メモは、発言の往復ではありません**。
\`turns\` は空配列にして、**中身は \`sections\` に置きます**。

- **原文の見出しごとに1節**。「<拘束時間>」「【ベーススタジオ】」「○放送本部」のような見出しを、
  記号を外してそのまま \`heading\` にします。見出しの下にさらに「<第1班>」のような区切りがあれば、
  「ベーススタジオ 第1班」のように**つないで1節**にします
- \`items\` は**原文の1行が1件**。「19:00 - 20:00 オープニング」「CAM×6（Z300クラス）」のように、
  **時刻・人数・機材名・番組名を原文の文字のまま**残します。行を束ねて要約しないこと
- 「（未定）」「想定」「〜？」のような**確定していない印も落とさない**（あとで一番聞かれるところです）
- \`lead\` は全体の1〜3文、\`facts\` はその中から目立つ数字だけ。**節の中身の代わりにはなりません**

**節に置かなかった行は、画面のどこにも出ません。** 原文の行は全部どこかの節に置いてください。

⚠️ **「膨らませない」は「削ってよい」ではありません。** 足すのは禁止、
削るのも誤りです。原文にある話を**全部・一度ずつ**置いてください。`;

export interface StructuredActivity {
  subject: string;
  /** 本文の構造（migration 188）。**組み立てられなければ null**＝整形の失敗 */
  struct: ActivityStruct | null;
  nextAction: string | null;
  nextActionDate: string | null;
}

export interface ActivityFormatResult extends StructuredActivity {
  provider: IntakeAiProvider;
  model: string;
  promptVersion: string;
  /** 網羅量の実測。**記録に残す**（`ai_outputs.payload_snapshot`）ので、後から数字で言える */
  coverage: {
    /** 原文の文字数 */
    inputChars: number;
    /** 画面に出る本文の文字数（`activityStructLength`） */
    outputChars: number;
    /** 下回ったらやり直させる値 */
    minChars: number;
    /** 短すぎて拾い直させたか */
    retried: boolean;
    /** 拾い直してもなお足りなかったか（＝短いまま保存した） */
    thin: boolean;
  };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function isActivityAiConfigured(): boolean {
  return resolveProvider() !== null;
}

/**
 * この整形に使うモデル。**段は入力の長さで決まる**（`shared/services/ai-model.ts`）。
 *
 * やり取りの整形は**形を整えるだけ**で、崩れていれば画面を見た人がその場で
 * 気づけるので **light が既定**です。長い記録だけ heavy に上げます。
 *
 * ⚠️ 着手前は `ACTIVITY_AI_MODEL || MINUTES_AI_MODEL || 既定` の順でした。
 * **`MINUTES_AI_MODEL` を1つ入れるとやり取りまで巻き添えで変わる**という、
 * 名前から読み取れない結びつきだったので外してあります。
 */
export function activityModel(provider?: IntakeAiProvider | null, chars = 0): string {
  const p = provider ?? resolveProvider();
  if (!p) return 'none';
  return modelFor('activity', tierFor('activity', { chars }), p);
}

/**
 * LLM の出力を検査する。**そのまま信じない**。
 *
 * - 構造は `normalizeActivityStruct` を通す（知らない値は既定に倒し、長さを切る）
 * - 壊れた日付は空にする（壊れた値で予定を作らない）
 * - 件名が空なら**原文の1行目**で埋める（空の件名は一覧で「無題」に見える）
 *
 * ネットワークに触らないので、素で試せます。
 */
export function normalizeActivity(raw: unknown, original: string): StructuredActivity {
  const r = (raw ?? {}) as Record<string, unknown>;
  const firstLine = original.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const subject = str(r.subject).slice(0, 120) || firstLine.slice(0, 60) || 'やり取りの記録';
  const date = str(r.next_action_date);
  const nextAction = str(r.next_action);
  return {
    subject,
    // 構造は**まるごと**渡す（`subtitle` / `statuses` / `facts` / `lead` / `turns`）。
    // 中身が薄ければ `null` が返り、呼ぶ側が失敗として扱う
    struct: normalizeActivityStruct(r),
    nextAction: nextAction || null,
    // **次にやることが無いのに期限だけ残さない。** 期限だけの行は画面のどこにも出ない
    nextActionDate: nextAction && YMD.test(date) ? date : null,
  };
}

export async function formatActivity(
  text: string,
  opts: {
    activityDate?: string | null; kindLabel?: string | null; advice?: string[];
    /**
     * **人がリクエストの中で待っている**（画面から「整えて記録する」を押した）。
     *
     * 立てると総予算（`REQUEST_BUDGET_MS`）で見張り、SDK のやり直しを 0 にし、
     * 残り時間が足りなければ**拾い直しをやめます**。
     * 裏で走るバックフィル（`activity-format.service`）では立てません。
     */
    requestBound?: boolean;
  } = {},
): Promise<ActivityFormatResult> {
  const provider = resolveProvider();
  if (!provider) throw new Error('OPENAI_API_KEY / ANTHROPIC_API_KEY のどちらも未設定です');
  if (text.length > MAX_ACTIVITY_CHARS) {
    throw new Error(`長すぎます（${text.length} 文字）。分けて記録してください`);
  }

  // **長さで段が決まる。** 短い記録は軽いモデルで足りる（`shared/services/ai-model.ts`）
  const model = activityModel(provider, text.length);
  // 過去に人がどう直したかを渡す。**ここがループを閉じている部分**
  const lessons = (opts.advice ?? []).slice(0, 8);
  const lessonBlock = lessons.length
    ? `\n## 前回までの傾向（人があなたの整形をどう直したか）
実測値です。同じ間違いを繰り返さないでください。
ただし**原文に無いことを補ってはいけません**。傾向は形の整え方にだけ使うこと。
${lessons.map((l) => `- ${l}`).join('\n')}\n`
    : '';

  /*
   * **並び順に意味がある。** 入力の「先頭から共通している部分」だけが安く再利用されるので、
   * 毎回変わるもの（日付・本文）を後ろに置きます
   * （投入口の `buildUserPrompt` で測って決めた並べ方と同じ）。
   */
  /*
   * **分量の目安は原文の長さから計算します**（`shared/services/ai-coverage.ts`）。
   *
   * 着手前は件数の上限（`turns` 6件・`facts` 4件・`quote` 2文）だけがあり、
   * **材料が長いほど落ちる情報が増える**形でした。利用者からのご指摘は
   * 「きわめて短いテキストでしか残らず、議事録の意味をなしていない」。
   */
  const target = coverageTarget('activity', text.length);
  const brief = coverageBrief(target, '今回の原文', '整えた本文（要約・事実・発言をあわせて）');

  const prompt = (extra: string) => `${lessonBlock}${brief ? `${brief}\n\n` : ''}${extra ? `${extra}\n\n` : ''}やり取りの種類: ${opts.kindLabel || '（指定なし）'}
やり取りの日: ${opts.activityDate || '（不明）'}

## 担当者が書いたもの
"""
${text}
"""`;

  /*
   * **人が待っている経路は総量で見張る**（上の `REQUEST_BUDGET_MS`）。
   * 裏で走るときは `null` = 見張らない（1件に時間がかかっても誰も待っていない）。
   */
  const deadline = opts.requestBound ? Date.now() + REQUEST_BUDGET_MS : null;
  const remainingMs = () => (deadline === null ? null : deadline - Date.now());

  const call = (m: string, extra = '') => {
    const left = remainingMs();
    // 予算つきのときは**残り時間そのもの**が1回の上限。やり直しは 0（上の注意書き）
    const timeoutMs = left === null ? TIMEOUT_MS : Math.max(5_000, Math.min(TIMEOUT_MS, left));
    const maxRetries = left === null ? 1 : 0;
    return provider === 'openai'
      ? callOpenAi(m, prompt(extra), text.length, timeoutMs, maxRetries)
      : callAnthropic(m, prompt(extra), text.length, timeoutMs, maxRetries);
  };

  /*
   * **軽いモデルで落ちたら、上位モデルで1回だけやり直す**（投入口と同じ決めごと）。
   *
   * モデル名が使えない環境・構造化出力に対応していない版で**黙って失敗すると**、
   * その行は `format_error` が立って待ち行列から外れ、
   * **「整わない記録がある」としか分からなくなります**。
   *
   * ⚠️ **やり直すのは落ちたときだけ。** 中身が気に入らないときはやり直しません —
   * 「もっともらしいが違う」は例外にならないので、**人が「整え直す」を押す**のが
   * 正しい直し方です（`activity-format.service` の `redoFormat`）。
   */
  const heavy = modelFor('activity', 'heavy', provider);
  let used = model;
  let out: FormatCall;
  try {
    out = await call(model);
  } catch (e) {
    if (model === heavy) throw e;
    console.warn(`[activity] ${model} で落ちたので ${heavy} でやり直します:`, (e as Error).message);
    used = heavy;
    out = await call(heavy);
  }

  /*
   * **呼び出し1回につき `ai_usage` 1行**（その約束を破らない・Codex レビューでの指摘）。
   *
   * 拾い直しは**上位モデル**で走るので、1回目（軽い）と2回目（重い）の
   * トークンを足して1行にすると、**全部が片方の単価で値付けされます**
   * （`costOf` は行のモデル名で引く）。総額が嘘になるほうが、
   * 「1件あたり」の割り算がずれるより高くつきます。
   *
   * ⚠️ `perRowCost` は行数ではなく**呼び出し回数**で割るので、拾い直した回の
   * 「1件あたり」はそのぶん低めに出ます。**総額は正しい**ほうを取っています。
   */
  await recordAiUsage({
    kind: 'activity', provider, model: used,
    inputTokens: out.usage.inputTokens,
    cachedInputTokens: out.usage.cachedInputTokens,
    outputTokens: out.usage.outputTokens,
  });

  let formatted = normalizeActivity(out.raw, text);
  let chars = activityStructLength(formatted.struct);
  let retried = false;

  /*
   * **短すぎたら1回だけ拾い直させます**（`shared/services/ai-coverage.ts`）。
   *
   * ⚠️ 上の「落ちたときのやり直し」とは別ものです。あちらは**失敗**の救済で、
   * こちらは**中身が足りない**ときの拾い直し。やり直しの指示は
   * 「長く書け」ではなく「落とした話を拾え」です（`coverageRetryNote`） —
   * 長さを直接求めると水増しで満たされ、**この製品がいちばん避けたい
   * 「書かれていないことが書かれた記録」**になります。
   *
   * **拾い直しても足りなければ、長いほうを採って先に進みます。**
   * 網羅が足りないことを理由に、記録そのものを `format_error` にしない。
   *
   * **やり直しは上位モデルで行います。** 短すぎる出力は軽いモデルの得意でない
   * 「長い材料から数え上げる」仕事で起きるので、同じモデルに投げ直しても
   * 同じ長さが返ります（`ai-model.ts` の「迷ったら heavy に倒す」と同じ判断）。
   */
  const left = remainingMs();
  /*
   * ⚠️ **残り時間が足りなければ拾い直さない。** 始めて途中で nginx に切られるのが
   * いちばん悪い結果です（画面は理由の出ない失敗、サーバーは行を作る、人はもう一度押す）。
   * **短いまま残すほうがまし** — `coverage.thin` に残るので、人は「整え直す」を押せます。
   */
  const canRetry = left === null || left >= RETRY_MIN_REMAINING_MS;
  if (isTooThin(chars, target) && !canRetry) {
    console.warn(`[activity] 整形が短すぎます（${chars}字）が、残り ${left}ms では拾い直せないので1回目で返します`);
  }
  if (isTooThin(chars, target) && canRetry) {
    retried = true;
    console.warn(`[activity] 整形が短すぎます（${chars}字 / 下限 ${target.minChars}字）。${heavy} で拾い直させます`);
    try {
      const retry = await call(heavy, coverageRetryNote(chars, target, '整えた本文'));
      // **拾い直した回はそれ自身のモデルで残す**（上の注意書き）
      await recordAiUsage({
        kind: 'activity', provider, model: heavy,
        inputTokens: retry.usage.inputTokens,
        cachedInputTokens: retry.usage.cachedInputTokens,
        outputTokens: retry.usage.outputTokens,
      });
      const second = normalizeActivity(retry.raw, text);
      const secondChars = activityStructLength(second.struct);
      // **長いほうを採ります。** 拾い直したのに減っているなら1回目のほうが網羅していた
      if (secondChars > chars) { formatted = second; chars = secondChars; used = heavy; }
    } catch (e) {
      // **拾い直しの失敗で1回目を捨てない。** 短くても整っているほうがまし
      console.warn('[activity] 拾い直しに失敗しました（1回目の結果を使います）:', (e as Error).message);
    }
  }

  return {
    ...formatted,
    provider,
    model: used,
    promptVersion: lessons.length ? ACTIVITY_PROMPT_VERSION_WITH_FEEDBACK : ACTIVITY_PROMPT_VERSION,
    coverage: {
      inputChars: target.inputChars,
      outputChars: chars,
      minChars: target.minChars,
      retried,
      thin: isTooThin(chars, target),
    },
  };
}

interface FormatCall { raw: unknown; usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } }

/** SDK の返す使用量を1つの形に揃える（プロバイダで名前が違う） */
function readUsage(raw: unknown): FormatCall['usage'] {
  const u = (raw ?? {}) as Record<string, unknown>;
  const det = (u.input_tokens_details ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  return {
    inputTokens: num(u.input_tokens),
    cachedInputTokens: num(det.cached_tokens) || num(u.cache_read_input_tokens),
    outputTokens: num(u.output_tokens),
  };
}

/**
 * 出力の上限。**材料の長さで決めます。**
 *
 * 固定値にすると、長いメールで**途中で切られた整形**が出ます
 * （OpenAI は `status=incomplete` で、そのまま `format_error` になる）。
 * 日本語は 1 トークン ≒ 1 文字弱なので、目安の3倍を取って余裕を持たせます。
 */
function outputTokenBudget(inputChars: number): number {
  const guide = coverageTarget('activity', inputChars).guideChars;
  /*
   * ⚠️ **社内メモは原文の行をほぼそのまま `sections` に置きます**（v5）。目安（原文の 1/4）の3倍では、
   * 5,000字のシフト表で枠が足りず途中で切られるので、**原文の1.5倍**も下回らないようにします。
   */
  return Math.min(16_000, Math.max(4_000, guide * 3, Math.ceil(inputChars * 1.5)));
}

async function callOpenAi(
  model: string, userPrompt: string, inputChars: number,
  timeoutMs = TIMEOUT_MS, maxRetries = 1,
): Promise<FormatCall> {
  const client = new OpenAI({ timeout: timeoutMs, maxRetries });
  const response = await client.responses.parse({
    model,
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    // **切られないだけの枠を取る。** 足りないと `incomplete` で全部失われる
    max_output_tokens: outputTokenBudget(inputChars),
    text: { format: zodTextFormat(ActivitySchema, 'activity_log') },
  });
  if (response.status === 'incomplete') {
    throw new Error(`整形が途中で終わりました: ${response.incomplete_details?.reason ?? '理由不明'}`);
  }
  const parsed = response.output_parsed;
  if (!parsed) throw new Error(`整形の結果を読み取れませんでした (status=${response.status ?? '不明'})`);
  return { raw: parsed, usage: readUsage(response.usage) };
}

async function callAnthropic(
  model: string, userPrompt: string, inputChars: number,
  timeoutMs = TIMEOUT_MS, maxRetries = 1,
): Promise<FormatCall> {
  const client = new Anthropic({ timeout: timeoutMs, maxRetries });
  const response = await client.messages.parse({
    model,
    max_tokens: outputTokenBudget(inputChars),
    thinking: { type: 'adaptive' },
    /*
     * **長い記録は `medium`。** `low` のまま長いメールを渡すと、
     * 往復を数え上げずに冒頭だけで整形が出ます（短すぎる原因のひとつ）。
     * しきい値は段が heavy に上がる値（`ai-model.ts` の 4,000 字）に合わせる。
     */
    output_config: {
      effort: inputChars >= 4_000 ? 'medium' : 'low',
      format: zodOutputFormat(ActivitySchema),
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });
  if (response.stop_reason === 'refusal') {
    throw new Error(`整形が拒否されました: ${response.stop_details?.explanation ?? '理由不明'}`);
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('整形の結果を読み取れませんでした');
  return { raw: parsed, usage: readUsage(response.usage) };
}
