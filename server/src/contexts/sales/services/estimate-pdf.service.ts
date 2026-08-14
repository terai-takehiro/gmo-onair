/**
 * 見積書 PDF (v4 ⑥ 見積タブ)
 *
 * ── なぜ新しく要るのか ──────────────────────────────────────
 *
 * PDF を作る道具（`shared/services/pdf.service.ts`）は前からありますが、
 * **読んでいるのは `revenues` だけ**でした。v4 の見積は migration 138 で
 * `estimates` / `estimate_items` という別の表になった（`revenues` を読む
 * 41 か所が `status` を見ておらず、見積を相乗りさせると売上に足されるため）
 * ので、**見積タブから PDF を出す道がどこにも無い**状態でした。
 *
 * ここは `estimates` を `pdf.service` が読める形に**詰め替えるだけ**です。
 * **PDF の描き方は写しません** — 写すと、様式を直した日から見積書だけ
 * 古い形のまま出ます。
 *
 * ── 値引きは明細の1行にする ─────────────────────────────────
 *
 * `estimates.discount` は見積そのものが持つ1つの数（モックの「値引きは単価を
 * 下げず別建て」）。`pdf.service` は**金額がマイナスの明細**を割引として数え、
 * 「定価 / 割引額 / お見積金額」の3列を出します。そこで**マイナス1行として
 * 渡します** — 合計だけ引いて渡すと、紙の上で値引きが消えて
 * 「なぜこの金額なのか」が相手に伝わりません。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateEstimatePdf } from '../../../shared/services/pdf.service';

export interface EstimatePdf {
  buffer: Buffer;
  /** ダウンロード時のファイル名 */
  filename: string;
  /** BOX の格納先を引くための案件 id */
  projectId: string;
}

/** BOX / OS のファイル名で使えない文字を落とす（案件名がそのまま入るため） */
function safeName(name: string): string {
  return name.replace(/[/\\:?*|"<>]/g, '').trim();
}

/**
 * 見積 1 件を PDF にする。
 *
 * ファイル名は `見積書_GLS001_v2_案件名.pdf`。**版を必ず入れる** —
 * 入れないと v1 と v2 が同じ名前になり、BOX では同じファイルの版として
 * 積み上がって「v1 として出したもの」が一覧から消えます。
 */
export async function buildEstimatePdf(estimateId: string): Promise<EstimatePdf> {
  const est = await queryOne(
    `SELECT e.id, e.project_id, e.version, e.title, e.status, e.tax_category,
            e.subtotal, e.discount, e.valid_until, e.notes, e.sent_at, e.created_at,
            p.name AS project_name, p.gls_number,
            p.event_start AS project_start, p.event_end AS project_end,
            c.name AS customer_name, c.address AS customer_address,
            c.contact_name AS customer_contact
       FROM estimates e
       JOIN projects p ON p.id = e.project_id
       LEFT JOIN customers c ON c.id = COALESCE(e.customer_id, p.customer_id)
      WHERE e.id = ? AND e.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [estimateId],
  ) as Record<string, unknown> | undefined;
  if (!est) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');

  const items = (await queryAll(
    `SELECT description, quantity, unit_price, amount, category, item_notes
       FROM estimate_items WHERE estimate_id = ? ORDER BY sort_order, created_at`,
    [estimateId],
  )) as Record<string, unknown>[];

  const discount = Math.max(0, Number(est.discount) || 0);
  const rows = items.map((it) => ({
    description:  String(it.description ?? ''),
    quantity:     Number(it.quantity) || 0,
    unit_price:   Number(it.unit_price) || 0,
    amount:       Number(it.amount) || 0,
    period_start: null,
    period_end:   null,
    item_notes:   (it.item_notes as string | null) ?? null,
    category:     (it.category as string | null) ?? null,
  }));
  if (discount > 0) {
    // **明細と同じ分類には入れない。** 入れるとその分類の小計から値引きが引かれ、
    // 「スタジオの小計」が定価と合わなくなる（値引きは見積全体に掛かるもの）。
    // かといって分類なしにすると、分類を使っている見積では
    // **「（未分類）」という帯**の下に値引きが並んで何の行か読めないので、
    // 値引き専用の分類にして帯にもそう出す
    rows.push({
      description: 'お値引き', quantity: 1, unit_price: -discount, amount: -discount,
      period_start: null, period_end: null, item_notes: null, category: '値引き',
    });
  }

  const glsNumber = (est.gls_number as string | null) || null;
  const projectName = String(est.project_name ?? '');
  const version = Number(est.version) || 1;

  const buffer = await generateEstimatePdf({
    // 紙に出す「見積コード」。GLS が無い（ヨミ段階の）案件では版だけを出す
    billing_key: glsNumber ? `${glsNumber}-v${version}` : `v${version}`,
    subtitle: (est.title as string | null) || null,
    customer_name: (est.customer_name as string | null) || '',
    customer_address: (est.customer_address as string | null) || null,
    customer_contact: (est.customer_contact as string | null) || null,
    project_name: projectName,
    gls_number: glsNumber,
    tax_category: String(est.tax_category ?? 'tax10'),
    amount: (Number(est.subtotal) || 0) - discount,
    // 発行日は「出した日」。まだ出していない下書きは今日の日付で出す
    recognition_date: null,
    billing_date: est.sent_at ? String(est.sent_at).slice(0, 10) : null,
    payment_due_date: null,
    notes: (est.notes as string | null) || null,
    status: 'estimate',
    project_start: (est.project_start as string | null) || null,
    project_end: (est.project_end as string | null) || null,
    valid_until: (est.valid_until as string | null) || null,
    items: rows,
  });

  const label = safeName([glsNumber, `v${version}`, projectName].filter(Boolean).join('_'));
  return {
    buffer,
    filename: `見積書_${label || est.id}.pdf`,
    projectId: String(est.project_id),
  };
}
