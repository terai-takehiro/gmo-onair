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
  /**
   * **承認待ちかどうか**（`none` / `pending` / `approved`）。
   * 呼ぶ側（口）が「社外フォルダに置くか」を決めるのに使います。
   */
  approvalState: string;
}

/**
 * 明細の分類（帯の文字）。
 *
 * `estimate_items.category` に入るのは**画面が持つ3つの鍵**
 * （`client/src/contexts/sales/pages/projectDetail/EstimateItems.tsx` の `CATEGORIES`）で、
 * **そのまま紙に出すと帯が「studio」「tech」と英語で並びます**（実際にそう出ていた）。
 *
 * 知らない値は**そのまま出します** — 売上の明細（請求書・検収書）は分類が自由入力で、
 * 「音響」のように日本語がそのまま入っており、ここで落とすと帯が消えます。
 * 値引きの行（`値引き`）も同じ道を通ります。
 *
 * ⚠️ 画面と食い違うと**同じ見積が画面と紙で違う分け方に見える**ので、
 * `shared/tests/estimateCategory.test.ts` が画面側の表と突き合わせます。
 */
export const ESTIMATE_CATEGORY_LABEL: Record<string, string> = {
  studio: 'スタジオ',
  tech: '技術・人員',
  other: '制作・その他',
};

function categoryLabel(category: string | null): string | null {
  if (!category) return null;
  return ESTIMATE_CATEGORY_LABEL[category] ?? category;
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
    // **`sent_at` だけは TIMESTAMP**（ほかの日付は全部 TEXT）なので、
    // pg は文字列ではなく Date を返します。`String(...).slice(0, 10)` にすると
    // 紙の右上が **「Thu Jun 18」**になる（`toDateString()` の頭を切った形。実際にそう出ていた）。
    //
    // 日付は SQL で作ります。**時間帯を2回変える**のが要点で:
    //  ・`sent_at` は時間帯を持たない列に `NOW()` を入れたもの＝**DB の設定の壁時計**
    //    （コンテナは UTC なので UTC の時刻が入っている）
    //  ・`AT TIME ZONE current_setting('TimeZone')` で**書いたときと同じ時間帯として読み**、
    //    `AT TIME ZONE 'Asia/Tokyo'` で日本の壁時計にする
    // 片方だけ書くと、夕方に出した見積の発行日が1日ずれます（JST の朝 = 前日の UTC）。
    // 'UTC' とベタ書きしないのは、DB の時間帯が JST の環境で逆に9時間ずれるため
    `SELECT e.id, e.project_id, e.version, e.title, e.status, e.tax_category, e.approval_state,
            e.subtotal, e.discount, e.valid_until, e.notes, e.created_at,
            to_char(e.sent_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Tokyo',
                    'YYYY-MM-DD') AS sent_on,
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
    `SELECT description, quantity, unit_price, amount, category, item_notes, item_date
       FROM estimate_items WHERE estimate_id = ? ORDER BY sort_order, created_at`,
    [estimateId],
  )) as Record<string, unknown>[];

  const discount = Math.max(0, Number(est.discount) || 0);
  const rows = items.map((it) => {
    // **行ごとの日付（migration 194）を紙にも出す。** 無ければ null のまま
    // （PDF レンダラーは null を「期間なし」として案件全体の日付にフォールバックする）
    const itemDate = (it.item_date as string | null) ?? null;
    return {
      description:  String(it.description ?? ''),
      quantity:     Number(it.quantity) || 0,
      unit_price:   Number(it.unit_price) || 0,
      amount:       Number(it.amount) || 0,
      period_start: itemDate,
      period_end:   itemDate,
      item_notes:   (it.item_notes as string | null) ?? null,
      category:     categoryLabel(it.category as string | null),
    };
  });
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
    billing_date: (est.sent_on as string | null) || null,
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
    /**
     * **承認待ちかどうか。** 呼ぶ側（口）が「社外フォルダに置くか」を決めます —
     * 値引きが上限を超えた見積は送れない決めごとなのに、置き先は社外と
     * 共有するフォルダなので、置いた時点で送ったのと同じになります
     */
    approvalState: (est.approval_state as string | null) ?? 'none',
  };
}
