// 投入テキストの解析 (LLM) — 「誰に / 何を / いつまでに」を読み取る。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (D4 / D9)
//
// **対応プロバイダは OpenAI と Anthropic の 2 つ。**
//   スキーマ・プロンプト・出力の後段検証はプロバイダ共通にしてある。
//   差し替えても「存在しない id を捨てる」「壊れた期限を不明に倒す」といった
//   安全側の処理は同じように効くので、乗り換えのコストと事故の余地を小さくしている。
//   選択は環境変数 (下の resolveProvider) で、キーを入れたほうが自動で使われる。
//
// なぜ LLM を主経路にするのか:
//   朝会メモや議事録の文は崩れている (体言止め・主語省略・複数依頼が 1 行に混在)。
//   規則ベース (intake-parser.service.ts) は定型文には強いが、崩れた文では
//   「拾えなかった」が増える。拾えなかった依頼は結局口頭のまま消えるので、
//   ここは解析精度がそのまま要件の達成度になる。
//   一方で **API キーが無い / API が落ちている環境でも投入口は動かないと困る**ため、
//   規則ベースをフォールバックとして残し、呼び出し側 (route) が縮退する。
//
// GMO イズムに従う点 (プロンプトに契約として書く):
//   - 目標達成10カ条 1-1「期限は何日何時何分まで」→ 分まで出させる。
//     「今週中」「なるべく早く」は **勝手に日付を決めさせない** (due_unclear=true)。
//     勝手に決めると曖昧なまま確定したことになり、イズムに反する。
//   - 同 1-1「期限はできるだけ短く」→ 遠い期限は呼び出し側が注意を添える。
//   - 同 2-3「会話だけでなく、形に残さないとメンバーは動かない」
//     → 期限が読めない文も **捨てない**。下書きにして人に聞く。
//   - 会議術10カ条 7「議事録には ToDo・期限・次回開催日を記載」
//     → 議事録は正当な投入源。ただし決定事項はタスクにしない (溢れるため)。
//
// 改善の測定 (開発の絶対原則):
//   model と prompt_version を ai_outputs に記録する。プロンプトを変えたときに
//   「無修正採用率が上がったか」を prompt_version 別に比較できるようにするため。

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import * as z from 'zod/v4';
import {
  normalizeDest, suggestUrgency,
  type ParsedDraft, type ParseResult, type ParserUser,
} from './intake-parser.service';

/**
 * プロンプトを変えたら必ず上げる。ai_outputs.prompt_version に入り、改善効果の比較単位になる。
 *
 * **v2 = 行き先 (`dest`) を判断させる版**（投入口の1本化）。v1 と分けているのは、
 * 「切替を廃止して AI に判断させたら、無修正採用率が下がっていないか」を
 * `get_ai_feedback_digest` の `by_model` で**版ごとに**比べられるようにするため。
 */
export const INTAKE_PROMPT_VERSION = 'task-intake-v2';

/**
 * 過去の修正傾向をプロンプトに載せたときの版名。
 *
 * 版を分けているのは、**フィードバックを載せた回と載せていない回を比較したい**から。
 * 同じ版に混ぜると「ループを回した効果があったのか」を後から数字で言えなくなる
 * (get_ai_feedback_digest の by_model が prompt_version ごとの無修正採用率を返す)。
 */
export const INTAKE_PROMPT_VERSION_WITH_FEEDBACK = 'task-intake-v2+fb';

export type IntakeAiProvider = 'openai' | 'anthropic';

/**
 * 既定モデル。
 * どちらも**上位モデルを既定にしている**。ここで読み落とすと依頼が口頭のまま消えるので、
 * この機能ではコストより解析精度を優先する。1 日に数件〜十数件の投入なので費用は小さい。
 * コストを詰めたい場合は INTAKE_AI_MODEL で mini 系に下げられる。
 */
const DEFAULT_MODELS: Record<IntakeAiProvider, string> = {
  openai: 'gpt-5.4',
  anthropic: 'claude-opus-5',
};

/** 解析は対話 UI の中で待たせるので、nginx の 60 秒より十分手前で諦める */
const TIMEOUT_MS = 30_000;

/** 投入テキストの上限。これを超える分は切らずに **エラーにして人に分けさせる** (黙って切ると依頼が消える) */
const MAX_INPUT_CHARS = 20_000;

/**
 * 使うプロバイダを決める。
 * INTAKE_AI_PROVIDER で明示指定でき、無指定ならキーが入っているほうを使う。
 * 両方あるときは OpenAI を優先する (運用でこちらを主に使う想定)。
 * どちらも無ければ null = 規則ベースに縮退する。
 */
let warnedUnknownProvider = false;

export function resolveProvider(): IntakeAiProvider | null {
  const forced = (process.env.INTAKE_AI_PROVIDER ?? '').trim().toLowerCase();
  if (forced === 'openai') return process.env.OPENAI_API_KEY ? 'openai' : null;
  if (forced === 'anthropic') return process.env.ANTHROPIC_API_KEY ? 'anthropic' : null;
  if (forced && !warnedUnknownProvider) {
    // 綴り間違いで黙って別のプロバイダが使われると原因が分からなくなるので必ず言う
    warnedUnknownProvider = true;
    console.warn(
      `[intake-ai] INTAKE_AI_PROVIDER="${forced}" は未対応です (openai | anthropic)。` +
      'キーが入っているプロバイダを自動選択します。'
    );
  }
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

export function isIntakeAiConfigured(): boolean {
  return resolveProvider() !== null;
}

export function intakeAiModel(provider?: IntakeAiProvider | null): string {
  const p = provider ?? resolveProvider();
  if (!p) return 'rules';
  return process.env.INTAKE_AI_MODEL || DEFAULT_MODELS[p];
}

// ── 出力スキーマ ────────────────────────────────────────────
// 不明を null ではなく空文字で表す。null 許容は JSON Schema 変換で
// type: ["string","null"] になり strict モードの扱いがモデル・SDK 版で揺れるため、
// 「空文字 = 不明」の 1 系統に寄せて崩れる余地を消す。

const DecisionSchema = z.object({
  text: z.string().describe('決まったこと。1 文で書く'),
  quote: z.string().describe('その決定の根拠になった発言をそのまま引用する。引用できないものは決定にしない'),
});

const OpenItemSchema = z.object({
  text: z.string().describe('持ち帰りになったこと'),
  owner: z.string().describe('だれが持ち帰ったか。文中に出てこなければ空文字'),
  due: z.string().describe('いつまでか。"YYYY-MM-DD"。書かれていなければ空文字'),
});

const DraftSchema = z.object({
  // ── 行き先 (この版の主題) ─────────────────────────────────
  dest: z.string().describe(
    '行き先。"task"(やること) / "neta"(まだ GLS 番号の無いネタ案件) / ' +
    '"log"(お客様とのやり取りの記録) / "minutes"(打合せの議事録) のいずれか。迷ったら "task"'
  ),

  title: z.string().describe(
    'dest=task: やること（宛先・期限・敬称を含めず、動詞で終わる短い文。例「見積書の作成」）。' +
    'dest=neta: 案件名。dest=log: 件名。dest=minutes: 打合せの名前'
  ),

  // ── dest=task ───────────────────────────────────────────
  assignee_id: z.string().describe('担当者の users.id。一覧に無い / 特定できないときは空文字'),
  assignee_name_raw: z.string().describe('文中に書かれていた宛先の表記。読めなければ空文字。例「佐藤さん」「隣の席の人」'),
  assignee_unclear: z.boolean().describe('宛先が特定できなかったら true'),
  due_at: z.string().describe('期限。"YYYY-MM-DD HH:mm" 形式。読めない / 曖昧なら空文字。勝手に日付を作らない'),
  due_time_assumed: z.boolean().describe('日付だけ書かれていて時刻を 18:00 で補ったら true'),
  due_unclear: z.boolean().describe('期限が書かれていない、または「今週中」「なるべく早く」のように曖昧なら true'),
  importance: z.number().describe('重要度 1(低) 2(中) 3(高)。判断できなければ 2'),
  urgency: z.number().describe('緊急度 1(低) 2(中) 3(高)。判断できなければ 2'),

  // ── 相手 (neta / log / minutes で使う) ────────────────────
  project_id: z.string().describe('関係する案件の id。渡した候補一覧に無い / 特定できないときは空文字。id を作ってはいけない'),
  customer_name: z.string().describe('お客様（会社）の名前。文中に出てこなければ空文字。**推測で会社名を作らない**'),
  detail: z.string().describe('本文。dest=neta なら要望・背景、dest=log ならやり取りの中身。無ければ空文字'),

  // ── dest=neta ───────────────────────────────────────────
  gls_category: z.string().describe('"A"=スタジオを使う案件 / "B"=それ以外（配信支援・制作・機材のみ等）。判断が付かなければ空文字'),

  // ── dest=log ────────────────────────────────────────────
  activity_type: z.string().describe('やり取りの種類。"meeting" / "call" / "email" / "other" のいずれか。判断が付かなければ "other"'),
  next_action: z.string().describe('次にやること。書かれていなければ空文字'),
  next_action_date: z.string().describe('次にやることの期日。"YYYY-MM-DD"。書かれていなければ空文字'),

  // ── dest=minutes ────────────────────────────────────────
  summary: z.string().describe('打合せの要約。3〜5 行。dest=minutes 以外では空文字'),
  decisions: z.array(DecisionSchema).describe('決まったこと。**引用を出せないものは入れない**。dest=minutes 以外では空配列'),
  open_items: z.array(OpenItemSchema).describe('持ち帰り・宿題。dest=minutes 以外では空配列'),

  quote: z.string().describe('根拠になった投入テキストの該当部分をそのまま引用する'),
});

const SkippedSchema = z.object({
  line: z.string().describe('タスクにしなかった行の原文'),
  reason: z.string().describe('なぜタスクにしなかったかを日本語 1 文で。例「決定事項なのでタスクにしませんでした」'),
});

/** export しているのは検証スクリプトから JSON Schema 変換を確認できるようにするため */
export const IntakeResultSchema = z.object({
  drafts: z.array(DraftSchema),
  skipped: z.array(SkippedSchema),
});

// ── プロンプト ───────────────────────────────────────────────

const SYSTEM_PROMPT = `あなたは制作会社（放送・配信スタジオ）の業務アシスタントです。
書かれたメモ・貼られたメール・議事録・写真や PDF の中身・録音の文字起こしを読み、
**1 件ずつ「どこに入れるか」を決めて**下書きを作ります。

## まず行き先を決める (dest)

| dest | 何を入れるか | 迷ったときの見分け方 |
| --- | --- | --- |
| task | 誰かがやること | 動詞で終わる依頼・自分の TODO |
| neta | まだ受注していない引き合い（ネタ案件） | 新しいお客様・新しい相談で、**まだ案件になっていない**もの |
| log | お客様とのやり取りの記録（活動記録） | 「電話した」「訪問した」「メールが来た」など**済んだこと**の報告 |
| minutes | 打合せの議事録 | 発言のやり取りが続く長い文・複数の決定事項がある文 |

- **判断が付かないものは task にする。** 一番取り消しやすく、必ず人の目に触れます。
  ネタ案件や活動記録に入れると、間違っていても気づかれないまま残ります。
- **1 つの文を 2 か所に入れない。** 議事録として入れたなら、その中の決定事項を
  task に重ねて出さないこと（同じことが 2 回登録されます）。
  ただし**議事録の中の「持ち帰り」は open_items に入れる**（task にはしない）。
- **投入されたテキスト全体が 1 件の議事録**であることもあります。その場合は
  minutes を 1 件だけ出し、drafts を細かく割らないでください。

## 必ず守ること

1. **期限は「何月何日何時何分まで」で書く。**
   「金曜まで」のように日付だけのときは 18:00 を補い due_time_assumed=true にする。
   「今週中」「来週中」「なるべく早く」「至急」「そのうち」のような曖昧な表現は、
   **絶対に日付を推測しない**。due_at は空文字にして due_unclear=true にする。
   曖昧な期限を勝手に確定させることは、この会社では明確に誤りです。

2. **期限が読めない依頼も捨てない。** 下書きに入れて due_unclear=true にする。
   捨てると口頭のまま忘れられるので、それがこの仕組みで一番避けたいことです。

3. **決定事項・報告・共有はタスクにしない。** skipped に理由付きで入れる。
   例「方針は A 案で進めることに決定」→ タスクではない。
   ただし「決まったので○○を作る」のように**やることが含まれていればタスクにする**。

4. **1 行に複数の依頼があれば分けて出す。** 逆に、複数行が 1 つの依頼を説明しているならまとめる。

5. **担当者は渡されたユーザー一覧の id だけを使う。** 一覧に無い名前は
   assignee_id を空文字、assignee_name_raw に文中の表記、assignee_unclear=true にする。
   「隣の席の人」「営業チーム」「各自」のような表現も特定できないものとして扱う。
   **一覧に無い id を作ってはいけません。**

6. **title に宛先・期限・敬称・「お願いします」を含めない。** やることだけを短く書く。

7. **重要度**は内容から判断する (経営判断・顧客提出・請求は高め、社内の整理は低め)。
   判断できなければ 2。**緊急度**は期限の近さで決める。判断できなければ 2。

8. 見出しだけの行 (「朝会メモ」「■ 共有事項」など) は skipped に入れる。

9. **お客様の名前・案件名を推測で作らない。** 文中に無ければ customer_name は空文字、
   project_id は候補一覧に一致するものが無ければ空文字にする。
   **一覧に無い id を作ってはいけません。**
   ネタ案件（dest=neta）でお客様の名前が読めないときも空文字のままにしてください。
   人が確認画面で埋めます。**それらしい会社名を書くのが最悪です。**

10. **議事録（dest=minutes）の決定事項には引用を必ず付ける。**
    引用が出せないことは決定事項にせず、持ち帰り (open_items) に落とすか、書かない。
    議事録は取引先との合意の記録なので、**話を補うのが最悪の失敗**です。

11. **添付（画像・PDF）が渡されたときは、そこに書かれている文字を読んで同じように扱う。**
    名刺なら dest=neta か log（お客様の名前を customer_name に）、
    見積書・請求書なら dest=log（件名と金額を detail に）が目安です。
    読めない箇所を**それらしく埋めないこと**。

読み取れるものが 1 つも無い場合は drafts を空配列にしてください。無理に作らないこと。`;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function describeNow(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}(${WEEKDAY_JA[now.getDay()]}) ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** 助言としてプロンプトに載せる行数の上限。長くしても効かず、入力を膨らませるだけ */
const MAX_ADVICE_LINES = 8;

/**
 * 案件の候補としてプロンプトに載せる上限。
 * **全件載せない** — 動いている案件だけで足り、増えるほど誤って別の案件に紐づく。
 */
const MAX_PROJECT_CANDIDATES = 80;

/** 議事録・活動記録の紐づけ先の候補（動いている案件だけを呼び出し側が渡す） */
export interface ParserProject {
  id: string;
  name: string;
  /** GLS 番号または OPP コード。人が口にする呼び名 */
  code?: string | null;
  customer_name?: string | null;
}

function buildUserPrompt(
  text: string,
  users: ParserUser[],
  now: Date,
  submitterId?: string | null,
  advice?: string[],
  projects?: ParserProject[]
): string {
  const roster = users.length
    ? users.map((u) => `- ${u.id} : ${u.name}${u.id === submitterId ? '（この文を投入した人）' : ''}`).join('\n')
    : '(登録ユーザーなし)';

  const projectList = (projects ?? []).slice(0, MAX_PROJECT_CANDIDATES);
  const projectBlock = `\n## 案件の候補（この id 以外は使わない。一致しなければ空文字）
${projectList.length
    ? projectList.map((p) => `- ${p.id} : ${[p.code, p.name, p.customer_name].filter(Boolean).join(' / ')}`).join('\n')
    : '(動いている案件なし)'}\n`;

  // 過去に人がどう直したかを渡す。これが**ループを閉じている部分**で、
  // プロンプトを書き換えなくても次の解析から傾向が効く (開発の絶対原則の条件4)。
  const lessons = (advice ?? []).slice(0, MAX_ADVICE_LINES);
  const lessonBlock = lessons.length
    ? `\n## 前回までの傾向（人があなたの出力をどう直したか）
以下は実測値です。同じ間違いを繰り返さないように踏まえてください。
ただし**原文に書かれていないことを補ってはいけません**。傾向は判断の重み付けにだけ使うこと。
${lessons.map((l) => `- ${l}`).join('\n')}\n`
    : '';

  return `現在の日時: ${describeNow(now)}
相対的な日付（「明日」「金曜」「来週月曜」など）はこの日時を基準に解決してください。

## 担当者として使えるユーザー一覧（この id 以外は使わない）
${roster}
${projectBlock}${lessonBlock}
## 投入されたテキスト
"""
${text}
"""`;
}

/** テスト・検証から中身を確認できるように export する */
export { buildUserPrompt };

// ── 実行 ────────────────────────────────────────────────────

const DUE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

function clamp3(v: unknown, fallback = 2): number {
  // null / undefined / '' を Number() に通すと 0 や NaN になり、
  // 0 は clamp で 1 (最低) に落ちてタスクが最下位に埋もれる。値が無いなら中央に寄せる。
  if (v === null || v === undefined || v === '') return fallback;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(3, Math.max(1, n));
}

/** これより先の期限は「長い」とみなす (イズム: 期限は短く)。規則ベースと同じ閾値 */
const LONG_DUE_DAYS = 14;

export interface IntakeAiResult extends ParseResult {
  provider: IntakeAiProvider;
  model: string;
  promptVersion: string;
}

/** LLM が返した生の形 (検証前) */
export interface RawAiResult {
  drafts?: {
    dest?: unknown;
    title?: unknown; assignee_id?: unknown; assignee_name_raw?: unknown;
    assignee_unclear?: unknown; due_at?: unknown; due_time_assumed?: unknown;
    due_unclear?: unknown; importance?: unknown; urgency?: unknown; quote?: unknown;
    project_id?: unknown; customer_name?: unknown; detail?: unknown;
    gls_category?: unknown; activity_type?: unknown;
    next_action?: unknown; next_action_date?: unknown;
    summary?: unknown; decisions?: unknown; open_items?: unknown;
  }[];
  skipped?: { line?: unknown; reason?: unknown }[];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" として読めるものだけ通す。**壊れた日付を作らない** */
function dateOrNull(v: unknown): string | null {
  const s = str(v);
  if (!DATE_RE.test(s)) return null;
  return Number.isNaN(new Date(`${s}T00:00:00`).getTime()) ? null : s;
}

/** 活動記録の種別。DB は自由文字列だが、揺れると後から種別で絞れない */
const ACTIVITY_TYPES = ['meeting', 'call', 'email', 'other'];

/**
 * LLM の出力を検証・正規化する。**そのまま信じない**。
 *
 * 特に assignee_id は、存在しない id を作られると FK 違反や誤配になるため必ず突合する。
 * 期限も形式が壊れていたら「期限不明」に寄せる (壊れた値で確定させない)。
 * この関数はネットワークに触らないので単体で検証できる。
 */
export function normalizeAiResult(
  parsed: RawAiResult,
  users: ParserUser[],
  now: Date,
  projects: ParserProject[] = []
): ParseResult {
  const userIds = new Set(users.map((u) => u.id));
  const projectIds = new Set(projects.map((p) => p.id));

  const drafts: ParsedDraft[] = (parsed.drafts ?? [])
    .filter((d) => str(d?.title).length > 0)
    .map((d) => {
      const dest = normalizeDest(str(d.dest));
      const rawId = str(d.assignee_id);
      const idOk = rawId.length > 0 && userIds.has(rawId);
      const rawDue = str(d.due_at);
      const dueOk =
        DUE_RE.test(rawDue) && !Number.isNaN(new Date(rawDue.replace(' ', 'T')).getTime());
      const dueAt = dueOk ? rawDue : null;
      const dueFar = dueAt
        ? (new Date(dueAt.replace(' ', 'T')).getTime() - now.getTime()) / 86400000 > LONG_DUE_DAYS
        : false;
      // **候補一覧に無い案件 id は捨てる。** 作られた id をそのまま入れると
      // 外部キー違反で登録ごと落ちるか、別の案件にぶら下がる
      const rawProject = str(d.project_id);
      const projectId = rawProject.length > 0 && projectIds.has(rawProject) ? rawProject : null;
      const cat = str(d.gls_category).toUpperCase();
      const decisions = Array.isArray(d.decisions)
        ? (d.decisions as Record<string, unknown>[])
          // **引用の無い決定事項は落とす**（議事録は合意の記録なので話を補わせない）
          .filter((x) => str(x?.text) && str(x?.quote))
          .map((x) => ({ text: str(x.text), quote: str(x.quote) }))
        : [];
      const openItems = Array.isArray(d.open_items)
        ? (d.open_items as Record<string, unknown>[])
          .filter((x) => str(x?.text))
          .map((x) => ({ text: str(x.text), owner: str(x.owner), due: dateOrNull(x.due) ?? '' }))
        : [];
      return {
        dest,
        title: str(d.title),
        // **タスク以外に担当者は入れない。** 活動記録・議事録・ネタ案件は
        // 「誰がやるか」を持たない（v4 は案件担当者という概念を持たない）
        assigned_to: dest === 'task' && idOk ? rawId : null,
        assignee_name_raw: str(d.assignee_name_raw) || null,
        assignee_unclear: dest === 'task' ? !idOk : false,
        due_at: dest === 'task' ? dueAt : null,
        due_time_assumed: dest === 'task' && dueAt ? Boolean(d.due_time_assumed) : false,
        due_unclear: dest === 'task' ? (!dueAt || Boolean(d.due_unclear)) : false,
        due_far: dest === 'task' ? dueFar : false,
        importance: clamp3(d.importance),
        // 緊急度は期限が読めているなら期限からの決まった写像で出す (要件 D2)。
        // 規則ベースと同じ関数を使うことで AI 経路と規則経路で値がぶれず、
        // ai_corrections の集計が経路をまたいで比較できる。
        urgency: dueAt ? suggestUrgency(dueAt, now) : clamp3(d.urgency),
        quote: str(d.quote) || str(d.title),

        project_id: projectId,
        customer_name: str(d.customer_name) || null,
        detail: str(d.detail) || null,
        // 知らない値は入れない（DB を汚す前に落とす）。空 = 人に選ばせる
        gls_category: cat === 'A' || cat === 'B' ? (cat as 'A' | 'B') : null,
        activity_type: ACTIVITY_TYPES.includes(str(d.activity_type)) ? str(d.activity_type) : 'other',
        next_action: str(d.next_action) || null,
        next_action_date: dateOrNull(d.next_action_date),
        summary: str(d.summary) || null,
        decisions,
        open_items: openItems,
      };
    });

  const skipped = (parsed.skipped ?? [])
    .filter((s) => str(s?.line).length > 0)
    .map((s) => ({ line: str(s.line), reason: str(s.reason) || 'タスクではないと判断しました' }));

  return { drafts, skipped };
}

/**
 * 添付 1 件。**ディスクには置かない**（呼び出し側が memoryStorage で受ける）。
 * 画像と PDF はそのままモデルに渡し、文字ものは本文に混ぜる（下の `attachmentsToText`）。
 */
export interface IntakeAttachment {
  name: string;
  mime: string;
  data: Buffer;
}

/** そのまま「見せられる」種類か（画像 / PDF）。それ以外は文字にしてから混ぜる */
export function isViewableAttachment(mime: string): boolean {
  return mime.startsWith('image/') || mime === 'application/pdf';
}

/**
 * ChatGPT (Responses API) に渡す入力を組み立てる。
 *
 * **同じ確認画面に出す**のが要件なので、添付も「別の解析」ではなく
 * 本文と一緒に 1 回で読ませる（別々に読ませると、写真に写っている社名と
 * 本文に書かれた依頼が別々の下書きになり、人がつなぎ直すことになる）。
 */
function openAiInput(
  userPrompt: string, attachments: IntakeAttachment[]
): OpenAI.Responses.ResponseInput {
  const content: OpenAI.Responses.ResponseInputContent[] = [
    { type: 'input_text', text: userPrompt },
  ];
  for (const a of attachments) {
    if (a.mime.startsWith('image/')) {
      content.push({
        type: 'input_image',
        image_url: `data:${a.mime};base64,${a.data.toString('base64')}`,
        detail: 'auto',
      });
    } else if (a.mime === 'application/pdf') {
      content.push({
        type: 'input_file',
        filename: a.name,
        file_data: `data:application/pdf;base64,${a.data.toString('base64')}`,
      });
    }
  }
  return [{ role: 'user', content }];
}

/** Anthropic に渡す content ブロック（プロバイダを差し替えても添付が消えないように） */
/** Anthropic の画像は種類が 4 つに限られる。それ以外は落とす（400 で解析ごと失敗させない） */
const ANTHROPIC_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

function anthropicContent(
  userPrompt: string, attachments: IntakeAttachment[]
): Anthropic.ContentBlockParam[] {
  const content: Anthropic.ContentBlockParam[] = [{ type: 'text', text: userPrompt }];
  for (const a of attachments) {
    const imageType = ANTHROPIC_IMAGE_TYPES.find((t) => t === a.mime);
    if (imageType) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: imageType, data: a.data.toString('base64') },
      });
    } else if (a.mime === 'application/pdf') {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: a.data.toString('base64') },
      });
    }
  }
  return content;
}

/**
 * ChatGPT API (OpenAI) で投入テキストを解析する。
 * 失敗時は throw する (呼び出し側が規則ベースにフォールバックする)。
 */
export async function parseIntakeWithAi(
  text: string,
  users: ParserUser[],
  opts: {
    now?: Date;
    submitterId?: string | null;
    /** 過去の修正傾向 (ai-feedback の advice)。渡すとプロンプトに載る = ループが閉じる */
    advice?: string[];
    /** 議事録・活動記録の紐づけ先の候補（動いている案件） */
    projects?: ParserProject[];
    /** 添付（画像・PDF）。**同じ解析に載せる** — 別画面を作らない */
    attachments?: IntakeAttachment[];
  } = {}
): Promise<IntakeAiResult> {
  const provider = resolveProvider();
  if (!provider) {
    throw new Error('OPENAI_API_KEY / ANTHROPIC_API_KEY のどちらも未設定です');
  }
  if (text.length > MAX_INPUT_CHARS) {
    throw new Error(`投入テキストが長すぎます (${text.length} 文字)。分けて投入してください`);
  }

  const now = opts.now ?? new Date();
  const model = intakeAiModel(provider);
  const projects = opts.projects ?? [];
  const attachments = (opts.attachments ?? []).filter((a) => isViewableAttachment(a.mime));
  const userPrompt = buildUserPrompt(text, users, now, opts.submitterId, opts.advice, projects);

  const raw = provider === 'openai'
    ? await callOpenAi(model, userPrompt, attachments)
    : await callAnthropic(model, userPrompt, attachments);

  const normalized = normalizeAiResult(raw, users, now, projects);
  const promptVersion = (opts.advice?.length ?? 0) > 0
    ? INTAKE_PROMPT_VERSION_WITH_FEEDBACK
    : INTAKE_PROMPT_VERSION;
  return { ...normalized, provider, model, promptVersion };
}

/** OpenAI (Responses API + structured output) */
async function callOpenAi(
  model: string, userPrompt: string, attachments: IntakeAttachment[] = []
): Promise<RawAiResult> {
  const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.responses.parse({
    model,
    instructions: SYSTEM_PROMPT,
    // 添付が無いときは今までどおり文字列で渡す（形を変えない）
    input: attachments.length ? openAiInput(userPrompt, attachments) : userPrompt,
    text: { format: zodTextFormat(IntakeResultSchema, 'task_intake') },
  });

  // 途中で打ち切られた / 拒否された場合は output_parsed が null になる。
  // 中途半端な結果で確定させたくないので投げて規則ベースに縮退させる。
  if (response.status === 'incomplete') {
    throw new Error(`解析が途中で終わりました: ${response.incomplete_details?.reason ?? '理由不明'}`);
  }
  const parsed = response.output_parsed;
  if (!parsed) throw new Error(`解析結果を読み取れませんでした (status=${response.status ?? '不明'})`);
  return parsed as RawAiResult;
}

/** Anthropic (Messages API + structured output) */
async function callAnthropic(
  model: string, userPrompt: string, attachments: IntakeAttachment[] = []
): Promise<RawAiResult> {
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    // 抽出タスクなので低めで十分。対話 UI の待ち時間を優先する
    output_config: { effort: 'low', format: zodOutputFormat(IntakeResultSchema) },
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: attachments.length ? anthropicContent(userPrompt, attachments) : userPrompt,
    }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`解析が拒否されました: ${response.stop_details?.explanation ?? '理由不明'}`);
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('解析結果を読み取れませんでした');
  return parsed as RawAiResult;
}
