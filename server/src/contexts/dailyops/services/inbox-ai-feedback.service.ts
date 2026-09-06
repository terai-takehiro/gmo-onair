/**
 * AI が取り込んだメール（受領書類 / 入ってきた情報）を
 * 「人がどこを直したか」として残す。
 *
 * ── なぜ要るか（会社方針「AI を使い捨てにしない」の条件2）──────
 *
 * `record_inquiry` / `record_finance_doc` は**取込のたびに AI が判断している**のに、
 * 直された内容がどこにも残っていませんでした（`recordAiOutput` を1回も呼んでいなかった）。
 * その結果、AI が毎回同じところを間違えても**永久に直りません**。
 *
 * 取込された行は**必ず人が確かめて直す**（承認する・重要度を変える・金額を直す）ので、
 * ここで差分を残せばその日から教師データが貯まります。
 *
 * ── 3つの落とし穴（`.claude/skills/ai-feedback-loop/`）──────────
 *
 * ① **通常の業務更新を「AI の誤り」と数えない。** 取込から `CORRECTION_WINDOW_DAYS`
 *    (7日) 以内の更新だけを見ます。3か月後に金額を直したのは AI の間違いではありません。
 * ② **無修正で採用されたことも記録する** (`type: 'none'`)。これが正解ラベルで、
 *    無いと修正率の分母が壊れます（かつては修正0件のとき何も書かずに戻していた
 *    バグがあり、この2種の無修正採用率が**構造的に常に0**でした —
 *    docs/core-redesign-plan.md §3-6 で修正）。ただし**同じ出力に二度は積みません**
 *    （`hasCorrections` で守る。更新のたびに積むと、よく触られる行ほど
 *    精度が高く見える）。
 * ③ **人に差分を入力させない。** before/after はサーバーが自動で比べます。
 *
 * ── 数えない列 ────────────────────────────────────────────
 *
 * `status` / `state` / `handled_at` / `processed_by` / `task_id` / `project_id` / `linked_*` /
 * `stock_review_on`（ストックを机に戻す日・migration 247）は
 * **業務が進んだ印**であって
 * AI の誤りではありません。承認しただけで「AI が間違えた」と数えると、
 * 修正率が「処理した件数」と同じ数字になります。
 *
 * ── 業務を止めない ────────────────────────────────────────
 *
 * 記録に失敗しても取込・更新は成功させます（`ai-output.service` 側がすべて
 * try/catch で握りつぶす作り）。**学習の都合で保存を落とさない。**
 */
import {
  findLatestAiOutput,
  hasCorrections,
  recordCorrections,
  type CorrectionInput,
} from '../../../shared/services/ai-output.service';

export const FINANCE_DOC_INTAKE_KIND = 'finance_doc_intake';
export const INQUIRY_INTAKE_KIND = 'inquiry_intake';

/** 突き合わせる項目。**AI が埋めるものだけ** */
const FD_FIELDS: { path: string; label: string }[] = [
  { path: 'doc_type', label: '種類' },
  { path: 'sender', label: '送付者' },
  { path: 'subject', label: '件名' },
  { path: 'content', label: '内容' },
  { path: 'amount', label: '金額' },
  { path: 'closing_month', label: '締月' },
  { path: 'payment_due', label: '支払期日' },
  { path: 'gls_number', label: 'GLS番号' },
  { path: 'details', label: '読める形の中身' },
  /*
    281: **当て先も AI が埋める**（`project_hint` から探して仮で置く）。
    ⚠️ **ここに足さないと、人が案件を付け替えても記録に残りません** —
    この PR の主目的そのものが「AI の当て先を人が直す」なのに、
    直した差分が1件も貯まらず、**間違った当て先が「そのまま採用された」と数えられます**
    （会社方針「AI を使い捨てにしない」の条件2。171 で `source`/`tags` を
    足し忘れていたのとまったく同じ形）。
  */
  { path: 'project_id', label: '当て先の案件' },
  { path: 'expense_kind', label: '行き先（仕入／販管費）' },
  { path: 'vendor_name', label: '取引先' },
  { path: 'processing_month', label: '処理月' },
  { path: 'payment_terms_days', label: '支払サイト' },
];

const IQ_FIELDS: { path: string; label: string }[] = [
  { path: 'sender', label: '送信者' },
  { path: 'subject', label: '件名' },
  { path: 'summary', label: '要約' },
  { path: 'importance', label: '重要度' },
  { path: 'action_needed', label: '推奨アクション' },
  { path: 'url', label: '参考URL' },
  { path: 'details', label: '読める形の中身' },
  // 171: 出どころとタグも AI が埋める。**足さないと、直されても記録に残らない**
  { path: 'source', label: '出どころ' },
  { path: 'tags', label: 'タグ' },
  // `category` は `tags` の1つ目の写しなので**数えない** — 同じ修正が2件に見える
];

/**
 * 見た目が違うだけの値を「直した」と数えないための正規化。
 *
 * `details` は JSONB なので、**キーの並び順が違うだけで別物と判定されない**よう
 * 安定した形にしてから比べます（`pg` は列の順序を保つとは限りません）。
 */
function norm(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  // タグは**並べ替えただけを「直した」と数えない**（順序に意味が無い）。
  // `details` は要素がオブジェクトなのでここには来ない（順序に意味がある）
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
    return stableJson([...(v as string[])].sort());
  }
  if (typeof v === 'object') return stableJson(v);
  if (typeof v === 'number') return String(v);
  const s = String(v).trim();
  const n = Number(s);
  return Number.isFinite(n) && s !== '' ? String(n) : s;
}

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

async function record(
  table: 'finance_docs' | 'misc_inquiries',
  kind: string,
  fields: { path: string; label: string }[],
  id: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  userId: string,
): Promise<void> {
  const output = await findLatestAiOutput(table, id, kind);
  if (!output) return;   // AI 取込でない / 7日を過ぎている

  const diffs: CorrectionInput[] = [];
  for (const f of fields) {
    const b = norm(before[f.path]);
    const a = norm(after[f.path]);
    if (b === a) continue;
    diffs.push({
      fieldPath: f.path,
      before: before[f.path] ?? null,
      after: after[f.path] ?? null,
      // 空 → 値 は「AI が取れなかったものを人が足した」= 追記。
      // 値 → 別の値 は取り違え = 誤り。**混ぜると直す先が分からない**
      type: b === '' ? 'enrich' : a === '' ? 'reject' : 'fix',
      note: f.label,
    });
  }

  if (diffs.length === 0) {
    // **無修正で採用された**ことを残す（`activity-log` / `minutes` と同じ正解ラベル）。
    // 承認・状態変更だけの更新（冒頭の「数えない列」）でもここに来る。
    // ここで何も書かずに戻すと、この2種の無修正採用率が永久に0のまま。
    //
    // ⚠️ **同じ出力に二度積まない**（`recordProjectAccepted` と同じ守り）。
    // `activity-log` / `minutes` は確定1回きりだが、ここは7日以内の
    // 更新のたびに呼ばれるため、`hasCorrections` の確認が必須
    if (await hasCorrections(output.id)) return;
    await recordCorrections(output.id, [{ fieldPath: '(全体)', type: 'none' }], userId);
    return;
  }
  // 直した回は、直さなかった項目も `none` で積む（無修正採用率の分母）
  for (const f of fields) {
    if (diffs.some((d) => d.fieldPath === f.path)) continue;
    diffs.push({ fieldPath: f.path, before: after[f.path] ?? null, after: after[f.path] ?? null, type: 'none', note: f.label });
  }

  await recordCorrections(output.id, diffs, userId);
}

/** 受領書類を直したとき */
export async function recordFinanceDocCorrections(
  id: string, before: Record<string, unknown>, after: Record<string, unknown>, userId: string,
): Promise<void> {
  await record('finance_docs', FINANCE_DOC_INTAKE_KIND, FD_FIELDS, id, before, after, userId);
}

/** 入ってきた情報を直したとき */
export async function recordInquiryCorrections(
  id: string, before: Record<string, unknown>, after: Record<string, unknown>, userId: string,
): Promise<void> {
  await record('misc_inquiries', INQUIRY_INTAKE_KIND, IQ_FIELDS, id, before, after, userId);
}
