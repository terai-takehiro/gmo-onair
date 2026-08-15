/**
 * AI が起票した案件（ネタ）についての「人がどこを直したか」を残す。
 *
 * ── なぜ要るか（会社方針「AI を使い捨てにしない」の条件2）──────
 *
 * `projects.ai_reviewed_at` は「人が見た」時刻しか持っておらず、
 * **何が間違っていたかを1バイトも教えてくれません**。これでは AI 側の
 * 取り違え（お客様を別会社にした・日付を読み違えた）が永久に直りません。
 *
 * v4 の ② 受付は**まさに人が AI の起票を直す場所**なので、
 * ここで差分を残せばその日から教師データが貯まります。
 *
 * ── 3つの落とし穴（`.claude/skills/ai-feedback-loop/` の失敗パターン）──
 *
 * ① **通常の業務更新を「AI の誤り」と数えない。** 案件は数ヶ月にわたって
 *    更新され続けるので、窓を切らないと全部が誤りになります。
 *    → `CORRECTION_WINDOW_DAYS`(7日) 以内の更新だけを見ます。
 * ② **無修正で採用されたことも記録する。** これが正解ラベルで、
 *    無いと修正率の分母が壊れます (`type: 'none'`)。
 * ③ **人に差分を入力させない。** before/after はサーバーが自動で比べます。
 *
 * ── 業務を止めない ────────────────────────────────────────
 *
 * 記録に失敗しても案件の保存は成功させます（`ai-output.service` 側が
 * すべて try/catch で握りつぶす作り）。**学習の都合で保存を落とさない。**
 */
import { config } from '../../../config';
import {
  findLatestAiOutput,
  hasCorrections,
  recordCorrections,
  type CorrectionInput,
} from '../../../shared/services/ai-output.service';

/** AI 出力の種類。`create_project` (MCP) が起票時に残す */
export const PROJECT_DRAFT_KIND = 'project_draft';

/**
 * 突き合わせる項目。**AI が埋められるものだけ**を並べる。
 *
 * `application_form` や `box_url_*` のような**業務の進行に伴って変わる列は入れない** —
 * 申込書が返ってきてチェックを付けただけで「AI が間違えた」と数えてしまう。
 */
const FIELDS: { path: string; label: string }[] = [
  { path: 'name', label: '案件名' },
  { path: 'customer_id', label: 'お客様' },
  { path: 'expected_amount', label: '想定金額' },
  { path: 'event_start', label: '開始日' },
  { path: 'event_end', label: '終了日' },
  { path: 'project_type', label: '案件種別' },
  // ⚠️ `customer_type`（グループ内 / グループ外）は**外しました**（migration 192）。
  // 取引先マスターの印から自動で決まる列になったので、**人が直せません** —
  // 残すと必ず「無修正」に数えられ、無修正採用率の分母だけが水増しされます
  { path: 'gls_category', label: '案件分類' },
  { path: 'assigned_to', label: '担当者' },
  { path: 'notes', label: '備考' },
  // 登録の16項目のうち AI が入れられるもの (migration 165 / 170)。
  // **足したら必ずここにも足す** — 抜けるとその項目だけ黙って差分が取れなくなる
  { path: 'contact_name', label: 'ご担当' },
  { path: 'recurrence', label: '継続区分' },
  { path: 'attendee_count', label: '来場人数' },
  { path: 'goal', label: '案件内容' },
  { path: 'reply_due', label: '返事の期限' },
  { path: 'wants', label: '求められているもの' },
  { path: 'intake_channel', label: 'リード経路' },
  // 2段分類 (migration 182)。**`project_type` と両方見る** — 旧分類は4種しかなく
  // 「有観客の収録」と「有観客の配信」が同じ `hybrid_event` に寄るので、
  // 種類だけを見ていると人が直した分類の半分が「無修正」に数えられる
  { path: 'audience', label: '客入れの有無' },
  { path: 'project_category', label: '案件分類（配信/収録/イベント）' },
];

/** 見た目が違うだけの値を「直した」と数えないための正規化 */
function norm(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return String(v);
  // 数字として読めるものは数値で比べる (0 と '0'、1000 と '1000')
  const s = String(v).trim();
  const n = Number(s);
  return Number.isFinite(n) && s !== '' ? String(n) : s;
}

/**
 * 案件の保存時に呼ぶ。AI 起票でなければ何もしない。
 *
 * @param before 保存前の行 (projects の全列)
 * @param after  保存後の行
 */
export async function recordProjectCorrections(
  projectId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  userId: string,
): Promise<void> {
  /*
   * ⚠️ **AI が自分で直した分を「人の修正」として数えない**（レビューでの指摘 #52）。
   *
   * MCP の `update_project` は**人が居ないときは `config.mcpActorId` で呼ばれます**
   * （メール取込のスキルが毎日叩く）。同じ AI が下書きを直しているだけなのに、
   * 前の版はそれを**人が直した差分**として記録していました
   * ＝ **自分の間違いを自分で直すたびに修正率が上がる**ので、
   * 数字を見ても「人がどれだけ直しているか」は分かりません。
   * 人が MCP 越しに操作したときは `currentActorId()` がその人を返すので、
   * **本当に AI 単独のときだけ**外れます。
   */
  if (userId === config.mcpActorId) return;

  const output = await findLatestAiOutput('projects', projectId, PROJECT_DRAFT_KIND);
  if (!output) return;   // AI 起票でない / 7日を過ぎている

  const diffs: CorrectionInput[] = [];
  for (const f of FIELDS) {
    const b = norm(before[f.path]);
    const a = norm(after[f.path]);
    if (b === a) continue;
    diffs.push({
      fieldPath: f.path,
      before: before[f.path] ?? null,
      after: after[f.path] ?? null,
      // 空 → 値 は「AI が取れなかったものを人が足した」= 追記。
      // 値 → 別の値 は取り違え = 誤り。**この2つを混ぜると直す先が分からない**
      type: b === '' ? 'enrich' : 'fix',
    });
  }
  if (diffs.length === 0) return;

  // 直さなかった項目も残す (無修正採用率の分母)。**直した回だけ**記録する —
  // 開くたびに 'none' を積むと、よく開かれる案件ほど精度が高く見える
  for (const f of FIELDS) {
    if (diffs.some((d) => d.fieldPath === f.path)) continue;
    diffs.push({ fieldPath: f.path, type: 'none' });
  }

  await recordCorrections(output.id, diffs, userId);
}

/**
 * **人が確かめて、1文字も直さなかった**ことを記録する（無修正採用）。
 *
 * ⚠️ これが無いと**受入率が永久に 0** になります（レビューでの指摘 #52）。
 * `recordProjectCorrections` は「直したときだけ」書くので、
 * **直さずに承認した案件は分母にも分子にも入りません** —
 * つまり「AI の下書きがそのまま通った」という**いちばん良い結果が
 * 1件も記録されない**ことになります。
 *
 * ⚠️ **開くたびに積まないこと。** よく開かれる案件ほど精度が高く見えます。
 * 積むのは**「確認しました」を押した1回だけ**（`ai_reviewed_at` が入る瞬間）で、
 * すでに差分が残っている案件（＝人が直した）には積みません。
 */
export async function recordProjectAccepted(
  projectId: string,
  userId: string,
): Promise<void> {
  const output = await findLatestAiOutput('projects', projectId, PROJECT_DRAFT_KIND);
  if (!output) return;
  if (await hasCorrections(output.id)) return;   // 直した記録があるなら無修正ではない
  await recordCorrections(
    output.id,
    FIELDS.map((f) => ({ fieldPath: f.path, type: 'none' as const })),
    userId,
  );
}

/**
 * 受付での「決めた」を記録する。
 *
 * **`ai_outcomes` に行を足さない。** 案件になったか / 見送りかは
 * `projects.stage` から always-fresh に導出できる (`ai-feedback.service`)。
 * 既存データで表現できるものに新しいテーブルを作らない、という決めごと。
 * ここに残すのは**判断そのもの**ではなく、判断が AI 出力の不採用だった場合だけ。
 */
export async function recordIntakeDecision(
  projectId: string,
  decision: 'promoted' | 'dropped',
  userId: string,
  note?: string | null,
): Promise<void> {
  if (decision !== 'dropped') return;   // 案件になった側はステージから読める
  const output = await findLatestAiOutput('projects', projectId, PROJECT_DRAFT_KIND);
  if (!output) return;
  // 見送り = AI が拾ってきたものが業務にならなかった。**拾いすぎの指標**になる
  await recordCorrections(
    output.id,
    [{ fieldPath: '(案件全体)', before: output.payload ?? null, after: null, type: 'reject', note: note ?? null }],
    userId,
  );
}
