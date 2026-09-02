import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction, type Row } from '../../../shared/db/connection';
import {
  requireAuth, requirePermission, meetsPermissionLevel,
} from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateEstimatePdf } from '../../../shared/services/pdf.service';
import { categoryLabel } from '../../sales/services/estimate-pdf.service';
import { computeDueDate } from '../services/money-rules.service';
import { fileFinanceDocToBox, applyDocBoxHeaders, docBoxSkipped } from '../../../shared/services/doc-box.service';
import { generateCsv, csvResponse } from '../../../shared/utils/csv-export';
import { buildExcelWorkbook, excelResponse } from '../../../shared/utils/excel';
import { buildRevenueWhere, buildRevenueOrder } from '../list-query';
import { taxBillingSuffix, normalizeTaxCategory, TAX_RATE_LABELS, toIncludedAmount } from '../../../shared/services/tax-category.service';
import { loadRevenueItemCarryover } from '../services/revenue-item-carryover.service';
import { BILLING_STATE_SQL } from '../../../shared/services/billing-state';
import { assertCustomerCompanyId } from '../../../shared/services/company-directory.service';
import { assignInvoiceNumbers } from '../services/invoice-number.service';

const router = Router();

/**
 * 帳票 PDF だけ全体のゲートより前に置いています。
 *
 * 以前は `sales` と `budget` が別区画で、この router 全体は `budget` しか
 * 要求していなかったため、**請求書・検収書PDFを出すボタンが `sales` だけの
 * 人には必ず403になる**事故があった（レビューでの指摘 #102）。権限モデル
 * 単純化で `budget` は `sales` に統合されたため、下の全体ゲートも `sales` に
 * なっており、この特別扱いはいまは重複（実質的には無害）。配置はそのまま
 * 残す（docs/reviews/permission-model-simplification-plan.md）。
 *
 * **紙にするだけなら止めない。** 金額は ⑤ の一覧にすでに出ているので、
 * 見えているものを PDF にするだけの操作を権限で分ける理由がありません
 * （見積書 PDF を reader に通したときと同じ判断・v4.0.11）。
 * **BOX に置くのは editor 以上**で、こちらは下の `canStore` が見ます。
 */
router.get('/:id/pdf',
  requireAuth, requirePermission('sales'),
  async (req, res, next) => {
  try {
    const row = await queryOne(
      `SELECT r.*, p.name as project_name, p.gls_number, e.episode_code,
              p.event_start as project_start, p.event_end as project_end,
              c.name as customer_name,
              c.address as customer_address,
              c.contact_name as customer_contact
       FROM revenues r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN companies c ON c.id = r.customer_id
       LEFT JOIN episodes e ON e.id = r.episode_id
       WHERE r.id = ? AND r.deleted_at IS NULL`,
      [req.params.id]
    ) as any;
    if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

    const items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [req.params.id]) as any[];

    // ?type=estimate|invoice|inspection で帳票種別を明示指定可 (未指定は売上ステータスに従う)。
    // これにより確定売上からも「見積書」を、概算見積からも「請求書」を、いずれからも「検収書」を発行できる。
    const typeParam = req.query.type as string | undefined;
    const docStatus = typeParam === 'estimate' ? 'estimate'
      : typeParam === 'invoice' ? 'confirmed'
      : typeParam === 'inspection' ? 'inspection'
      : (row.status || 'confirmed');

    const pdfBuffer = await generateEstimatePdf({
      billing_key: row.billing_key,
      subtitle: row.subtitle,
      customer_name: row.customer_name || '',
      customer_address: row.customer_address || null,
      customer_contact: row.customer_contact || null,
      project_name: row.project_name || '',
      // 月次ユニット等エピソード紐づき時は帳票ヘッダーにも月コード (GLS-B005-2607) を出す
      gls_number: row.episode_code || row.gls_number,
      tax_category: row.tax_category,
      amount: row.amount,
      recognition_date: row.recognition_date,
      billing_date: row.billing_date,
      payment_due_date: row.payment_due_date,
      notes: row.notes,
      status: docStatus,
      project_start: row.project_start || null,
      project_end: row.project_end || null,
      // 発行済みなら請求書番号を紙に出す (migration 163)。未発行なら請求KEYのまま
      invoice_no: row.invoice_no || null,
      items: items.map((it: any) => ({
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount,
        period_start: it.period_start || null,
        period_end: it.period_end || null,
        item_notes: it.item_notes || null,
        // 見積から変換した売上は明細の分類が画面の鍵（`studio`/`tech`/`other`）の
        // ままのことがある（`estimate.service.ts` の `convertToRevenue`）。
        // 見積書 PDF と同じ表で日本語に直す（知らない値＝自由入力はそのまま通す）
        category: categoryLabel(it.category || null),
      })),
    });

    const docLabel = docStatus === 'estimate' ? '見積書' : docStatus === 'inspection' ? '検収書' : '請求書';
    // v2.8.107+: ファイル名は project.gls_number (live) を使う。
    // billing_key は revenue 作成時のスナップショット (例: "GLS001-001-1") のため、
    // 後で project の GLS を変更してもそのままだと古い GLS のファイル名で出てしまう。
    // billing_key の最初のダッシュまでが GLS-prefix なので、そこだけを live gls_number で
    // 置換し、エピソード/税枝番のサフィックスは保つ。GLS 未発番ケースは billing_key そのまま。
    let filenameKey = row.billing_key || '';
    if (row.gls_number && filenameKey) {
      const dash = filenameKey.indexOf('-');
      if (dash > 0 && /^GLS\d+$/i.test(filenameKey.slice(0, dash))) {
        filenameKey = row.gls_number + filenameKey.slice(dash);
      }
    }
    const filename = `${docLabel}_${filenameKey}.pdf`;

    /*
     * ── 出したら BOX に入る（ご指示）────────────────────────────
     *
     * 「PDF を出す」操作がそのまま発行なので、その場で案件の BOX フォルダへ
     * 置きます。行き先は `doc-box.service` の表（請求書・検収書は社内限りの
     * `03_請求`、見積書は社外と共有する `01_見積・提案`）。
     *
     * **ダウンロードは止めません。** BOX が落ちている日に請求書を出せなく
     * なるほうが困ります。ただし**入ったかどうかは必ずヘッダーで返し**、
     * 画面がそのまま出します（黙って落とすと「保存されたつもり」になる）。
     *
     * 置くのは editor 以上。この口は reader でも通る
     * （レガシー画面・プロジェクト管理の見積タブも呼んでいる）ので、
     * 権限で分けずに置くと**読むだけの人が BOX に書けて**しまいます。
     *
     * `sales` の editor で通します（`budget` は権限モデル単純化で `sales` に
     * 統合済み。以前は `sales` か `budget` のどちらかの editor で通していたが、
     * いまは1区画に一本化されている）。
     */
    const user = (req as { user?: { role?: string; permissions?: Record<string, string> } }).user;
    const canStore = meetsPermissionLevel(user?.role, user?.permissions?.sales, 'editor');
    const boxKind = docStatus === 'estimate' ? 'estimate'
      : docStatus === 'inspection' ? 'inspection' : 'invoice';
    applyDocBoxHeaders(res, canStore
      ? await fileFinanceDocToBox(row.project_id, boxKind, filename, pdfBuffer)
      : docBoxSkipped(boxKind, 'NO_PERMISSION'));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});


// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

// 売上一覧
router.get('/', async (req, res) => {
  const { page, limit, offset } = extractPagination(req);
  const projectId = req.query.project_id as string;
  const { where, params } = buildRevenueWhere(req.query);
  const orderBy = buildRevenueOrder(req.query);

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN companies c ON c.id = r.customer_id ${where}`, params)) as any).c;

  // allocated_amount: グループ按分時はこのプロジェクトへの配分額
  const allocJoin = projectId
    ? `LEFT JOIN revenue_allocations ra ON ra.revenue_id = r.id AND ra.project_id = ?`
    : '';
  const allocParams: unknown[] = projectId ? [projectId] : [];
  const allocCol = projectId ? ', ra.allocated_amount, pg.name as group_name' : '';

  const rows = await queryAll(
    `SELECT r.*, p.name as project_name, p.gls_number, p.project_type, p.event_end, c.name as customer_name, e.episode_code${allocCol}
     FROM revenues r
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN companies c ON c.id = r.customer_id
     LEFT JOIN episodes e ON e.id = r.episode_id
     ${allocJoin}
     ${projectId ? 'LEFT JOIN project_groups pg ON pg.id = r.group_id' : ''}
     ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...allocParams, ...params, limit, offset]
  );

  /*
   * プロジェクト絞込み時は明細行も付与。
   *
   * ⚠️ **1行ずつ引かない（N+1）。** ここは以前 `for (const row of rows)` の中で
   * 1件ずつ `SELECT` していた。この画面は `limit=100` で叩かれる（財務ダッシュボードの
   * 内訳）ので、**案件で絞った瞬間に往復が 100 本増えて**いた。1本 5ms でも 0.5 秒、
   * DB が混んで 1本 500ms になれば 50 秒で、nginx の 60 秒に届いて 504 になる
   * （ユーザー報告「絞り込みを行っていると『サーバー側で処理が止まりました』が頻繁に出る」）。
   * まとめて1回引いて、メモリ上で行に配る。
   */
  if (projectId) {
    const ids = (rows as any[]).map((r) => r.id);
    if (ids.length > 0) {
      const items = await queryAll(
        'SELECT * FROM revenue_items WHERE revenue_id = ANY(?) ORDER BY revenue_id, sort_order',
        [ids],
      );
      const byRevenue = new Map<string, Row[]>();
      for (const item of items) {
        const key = String((item as any).revenue_id);
        const bucket = byRevenue.get(key);
        if (bucket) bucket.push(item); else byRevenue.set(key, [item]);
      }
      // 明細が1件も無い売上にも空配列を入れる（以前と同じ形＝画面が `.map` できる）
      for (const row of rows as any[]) row.items = byRevenue.get(String(row.id)) ?? [];

      /*
       * ⚠️ **見積との差異検知（仕様変更 #13・#15）に使う2列を足す。**
       *
       * 見積から変換された売上には、サーバー側の制約（`estimate.service.ts`）が
       * 及ばない — 財務台帳の `PUT /revenues/:id` は金額・明細を無条件に上書きできる
       * （案件詳細の売上・請求ペインを編集可能にした今回の変更でも、あえてロックしない
       * というご判断）。見積の値と食い違ったまま気づけないと困るので、差があれば
       * 画面側に気づけるようにするための情報だけをここで足す（保存は止めない）。
       *
       * 対応は `estimates.revenue_id → revenues.id`（逆向きの参照）。同じ売上に
       * 複数の見積行が紐づくことがある — 見積の版を重ねたあと受注し直すと、
       * 新しい行を作らず前の版が作った売上をそのまま書き換える仕様のため
       * (`convertToRevenue` の sibling 引き継ぎ)。**版が一番新しいものを「いまの元」
       * とみなす**（DISTINCT ON で1売上につき1行に絞る）。
       */
      const linkedEstimates = await queryAll(
        `SELECT DISTINCT ON (revenue_id) revenue_id, id, subtotal, discount
           FROM estimates
          WHERE revenue_id = ANY(?) AND deleted_at IS NULL
          ORDER BY revenue_id, version DESC`,
        [ids],
      ) as { revenue_id: string; id: string; subtotal: number; discount: number }[];
      const estimateByRevenue = new Map(linkedEstimates.map((e) => [String(e.revenue_id), e]));
      for (const row of rows as any[]) {
        const est = estimateByRevenue.get(String(row.id));
        row.estimate_id = est?.id ?? null;
        // 見積の合計 = 明細合計 (subtotal) − 値引き。`convertToRevenue` が
        // revenues.amount に書き込む式そのまま（そちらと直接比較できる）
        row.estimate_total_amount = est ? Number(est.subtotal) - Number(est.discount) : null;
      }
    }
  }

  // 画面の下に出す「全 N 件 ・ 合計 ￥X」。**表示中のページではなく絞り込み全体**を数える。
  // ページの合計を出すと、2ページ目に行くたびに合計が変わって読み間違える。
  const sum = (await queryOne(
    `SELECT COALESCE(SUM(r.amount), 0) as s FROM revenues r
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN companies c ON c.id = r.customer_id ${where}`, params)) as { s: string } | null;

  /*
   * ⚠️ **案件で絞ったときは「この案件のぶん」も返す**（レビューでの指摘 #87）。
   *
   * `r.amount` は**グループ請求ならグループ全体の額**です。案件詳細が行を足し算して
   * いたので、**1案件の粗利が他案件のぶんだけ膨らんで**いました。しかも画面は
   * 100 件で切って足しており、**101 件目からは合計に入っていません**でした。
   *
   * 分け合っている行は `revenue_allocations` の配分額を使います
   * （`COALESCE` なので、分け合っていない行は今までどおり `amount`）。
   * **確定した売上だけの合計も別に返します** — 画面が状態で絞って足し直すと、
   * また「表示中のぶんだけ」に戻ります。
   */
  const alloc = projectId ? (await queryOne(
    `SELECT COALESCE(SUM(COALESCE(ra.allocated_amount, r.amount)), 0) AS s,
            COALESCE(SUM(CASE WHEN r.status = 'confirmed'
                              THEN COALESCE(ra.allocated_amount, r.amount) ELSE 0 END), 0) AS confirmed
       FROM revenues r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN companies c ON c.id = r.customer_id
       LEFT JOIN revenue_allocations ra ON ra.revenue_id = r.id AND ra.project_id = ?
       ${where}`,
    [projectId, ...params],
  )) as { s: string; confirmed: string } | null : null;

  // 絞り込みチップの件数。**state 以外の絞り込みだけ**を掛けて数える
  // (全件の内訳を出すと、検索中に押した先が 0 件になる)。
  const { state: _state, ...restQuery } = req.query as Record<string, unknown>;
  const base = buildRevenueWhere(restQuery as typeof req.query);
  /*
   * ⚠️ **数える式も絞る式と同じものを読む**（`shared/services/billing-state.ts`・指摘 #125）。
   * ここに書き写すと、**チップの数字と押した先の行数がずれます**
   * （どちらもそれらしい数字なので、画面を見ても気づけません）。
   */
  const counts = (await queryOne(
    `SELECT ${Object.entries(BILLING_STATE_SQL)
      .map(([key, sql]) => `COUNT(*) FILTER (WHERE ${sql}) as ${key}`)
      .join(',\n            ')},
            COUNT(*) as all
     FROM revenues r
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN companies c ON c.id = r.customer_id ${base.where}`, base.params)) as Record<string, string>;

  res.json({
    ...paginatedResponse(rows, total, page, limit),
    total_amount: Number(sum?.s ?? 0),
    // 案件で絞ったときだけ。分け合う請求は**この案件への配分額**で足す
    ...(alloc ? {
      total_allocated_amount: Number(alloc.s),
      confirmed_allocated_amount: Number(alloc.confirmed),
    } : {}),
    state_counts: Object.fromEntries(Object.entries(counts ?? {}).map(([k, v]) => [k, Number(v)])),
  });
});

// CSV Export
router.get('/export', requirePermission('sales', 'exporter'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT p.name as project_name, r.subtitle, r.amount, r.tax_category, r.amount as total, r.status, r.recognition_date as date
     FROM revenues r
     LEFT JOIN projects p ON p.id = r.project_id
     WHERE r.deleted_at IS NULL
     ORDER BY r.billing_key ASC, r.created_at DESC`
  ) as Record<string, unknown>[];
  const columns = ['project_name', 'subtitle', 'amount', 'tax_category', 'total', 'status', 'date'];
  csvResponse(res, 'revenues.csv', generateCsv(rows, columns));
});

// 売上詳細（明細行つき）
router.get('/:id', async (req, res) => {
  const row = await queryOne(`SELECT r.*, p.name as project_name, p.gls_number, p.project_type, p.event_end, c.name as customer_name, e.episode_code FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN companies c ON c.id = r.customer_id LEFT JOIN episodes e ON e.id = r.episode_id WHERE r.id = ? AND r.deleted_at IS NULL`, [req.params.id]) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

  const items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [req.params.id]);
  row.items = items;
  res.json({ success: true, data: row });
});

// 請求書 Excel 出力 (業務推進への監査提出用・BOX 格納フォーマット準拠)
// 1 明細行 = 1 レコードのフラットな表 (請求先情報は各行に反復)。
router.get('/:id/excel', async (req, res, next) => {
  try {
    const row = await queryOne(
      `SELECT r.*, p.name as project_name, p.gls_number, e.episode_code,
              p.event_start as project_start, p.event_end as project_end,
              c.name as customer_name,
              c.address as customer_address,
              c.contact_name as customer_contact
       FROM revenues r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN companies c ON c.id = r.customer_id
       LEFT JOIN episodes e ON e.id = r.episode_id
       WHERE r.id = ? AND r.deleted_at IS NULL`,
      [req.params.id]
    ) as any;
    if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

    const items = await queryAll('SELECT * FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order', [req.params.id]) as any[];

    // YYYY/M/D 形式 (ゼロ埋めなし)
    const dateSlash = (d: string | null | undefined): string => {
      if (!d) return '';
      const p = String(d).slice(0, 10).split('-');
      return p.length >= 3 ? `${parseInt(p[0])}/${parseInt(p[1])}/${parseInt(p[2])}` : String(d);
    };
    // 税区分 → 税率ラベル + 税込への係数
    const tc = row.tax_category as string;
    // 税率は tax-category.service に一本化する。
    // 以前はここで三項演算子を連ねており、**知らない区分は 10% に落ちていた**。
    // migration 156 で足した不課税 (nontax) がまさにそれに当たり、
    // 税額 0 円であるべき請求書・見積書が 10% 課税で出てしまう。
    const rateLabel = TAX_RATE_LABELS[normalizeTaxCategory(tc)];
    // 端数の丸め方は**お金のルール ⑤** が持つ (既定 = 切り捨て)。
    // ここで `Math.round` を書くと、設定を切り替えても帳票だけ四捨五入のまま残る
    const inclusive = (net: number): number => toIncludedAmount(net, tc);

    // 請求先住所は 1 カラムのため住所1 に全文を入れる (郵便番号/建物名は分離保持していない)
    const addr1 = (row.customer_address || '').replace(/\n/g, ' ').trim();

    // 明細行 → フラット行。明細が無ければ売上金額で 1 行組み立てる。
    type Src = { description: string; quantity: number; unit_price: number; amount: number; period_start: string | null; period_end: string | null; item_notes: string | null };
    const srcItems: Src[] = items.length > 0
      ? items.map((it) => ({
          description: it.description || '',
          quantity: it.quantity ?? 1,
          unit_price: it.unit_price ?? 0,
          amount: it.amount ?? 0,
          period_start: it.period_start || null,
          period_end: it.period_end || null,
          item_notes: it.item_notes || null,
        }))
      : [{
          description: row.subtitle || row.project_name || '',
          quantity: 1,
          unit_price: row.amount ?? 0,
          amount: row.amount ?? 0,
          period_start: null,
          period_end: null,
          item_notes: row.notes || null,
        }];

    const rows = srcItems.map((it, i) => {
      const pS = it.period_start || row.project_start;
      const pE = it.period_end || row.project_end;
      const period = pS || pE ? `${dateSlash(pS)}${pE ? '～' + dateSlash(pE) : ''}` : '';
      const net = it.amount ?? 0;
      return {
        billTo: row.customer_name || '',
        billZip: '',
        billAddr1: addr1,
        billBldg: '',
        contact: row.customer_contact || '',
        honorific: '様',
        no: i + 1,
        itemCode: 'M' + String(10000 * 1000 + i + 1).padStart(11, '0'),
        period,
        productName: it.description,
        note: it.item_notes || '',
        net,
        rate: rateLabel,
        inclusive: inclusive(net),
        paymentDue: dateSlash(row.payment_due_date),
      };
    });

    const buffer = await buildExcelWorkbook([
      {
        name: '請求データ',
        columns: [
          { key: 'billTo', header: '請求先名称', width: 24 },
          { key: 'billZip', header: '請求先郵便番号', width: 14 },
          { key: 'billAddr1', header: '請求先住所1', width: 30 },
          { key: 'billBldg', header: '請求先住所(建物名）', width: 20 },
          { key: 'contact', header: '担当者名', width: 14 },
          { key: 'honorific', header: '敬称', width: 6 },
          { key: 'no', header: 'No', width: 6 },
          { key: 'itemCode', header: '明細番号', width: 16 },
          { key: 'period', header: '期間', width: 22 },
          { key: 'productName', header: '商品名', width: 30 },
          { key: 'note', header: '備考', width: 30 },
          { key: 'net', header: '税抜', width: 12 },
          { key: 'rate', header: '消費税率', width: 10 },
          { key: 'inclusive', header: '消費税込', width: 12 },
          { key: 'paymentDue', header: '入金予定日', width: 14 },
        ],
        rows,
      },
    ]);

    // ファイル名は project.gls_number (live) を優先 (PDF と同じ方針)
    let filenameKey = row.billing_key || '';
    if (row.gls_number && filenameKey) {
      const dash = filenameKey.indexOf('-');
      if (dash > 0 && /^GLS\d+$/i.test(filenameKey.slice(0, dash))) {
        filenameKey = row.gls_number + filenameKey.slice(dash);
      }
    }
    excelResponse(res, `請求書_${filenameKey || row.id}.xlsx`, buffer);
  } catch (err) {
    next(err);
  }
});

// 新規売上（明細行対応、episode_id任意）
router.post('/', requirePermission('sales', 'editor'), async (req, res) => {
  const { project_id, customer_id, episode_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, items, subtitle, status: reqStatus, is_advance_payment, invoice_issued } = req.body;
  if (!project_id || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件と顧客は必須です');
  // `customer_id` は companies.id（Phase 3-2a）を直接指すため、DB の FK は
  // 「顧客ロールの会社か」を保証しない（レビュー指摘・PR #199 P2 の2巡目）
  await assertCustomerCompanyId(customer_id);

  const revenueStatus = reqStatus === 'estimate' ? 'estimate' : 'confirmed';

  const taxSuffix = taxBillingSuffix(tax_category);

  // 月次ユニット等でエピソードに紐づく場合は、そのエピソードコードを請求KEYの基底にする
  // (例: GLS-B001-2607 → GLS-B001-2607-1)。月締め請求で「1月=1請求単位」を成立させる。
  let episodeCode: string | null = null;
  if (episode_id) {
    const ep = await queryOne('SELECT episode_code FROM episodes WHERE id = ? AND deleted_at IS NULL', [episode_id]) as any;
    episodeCode = ep?.episode_code || null;
  }

  const id = uuidv4();

  // 明細行がある場合は合計を計算
  const finalAmount = Array.isArray(items) && items.length > 0
    ? items.reduce((sum: number, it: any) => sum + (it.amount || 0), 0)
    : (amount || 0);

  const isAdvancePayment = is_advance_payment ? true : false;
  const invoiceIssued = invoice_issued ? true : false;
  /*
   * ⚠️ **見込み (`status='estimate'`) では「請求書発行済」で登録させない。**
   * `PUT /:id` と `PATCH /billing/invoices/:id` は同じ検査を持っているので、
   * ここだけ通すと**新規登録が抜け道**になります（見込みのまま発行済みの行は
   * 請求の一覧に出ないため、立ったことに誰も気づけません）。
   */
  if (invoiceIssued && revenueStatus !== 'confirmed') {
    throw new AppError(400, 'VALIDATION_ERROR',
      '確定した売上だけ請求書の発行を記録できます（見込みの行は対象外です）');
  }

  /*
   * ⚠️ **支払期日は設定から埋める**（レビューでの指摘 #63 の周辺で分かったこと）。
   *
   * お金のルール（設定 ⑤）は締め日・支払日・休業日の寄せ方まで決められますが、
   * **`computeDueDate` を呼んでいる場所が1つもありませんでした** — 下見の画面が
   * 使うだけで、**保存される行には入りません**。つまり設定を直しても
   * 台帳の期日は空のままで、「遅れているもの」も数えられません。
   *
   * **人が入れた期日は上書きしません**（渡ってきたらそちらが勝つ）。
   * 埋めるのは**空のときだけ**です。
   */
  const dueDate = payment_due_date || await computeDueDate(recognition_date, customer_id);

  // 本体 + 明細 + 案件想定金額の同期を単一トランザクションで実行 (途中失敗で明細が
  // 半端に残らないように)
  await withTransaction(async (tx) => {
    // billing_key生成。連番は案件行を FOR UPDATE で押さえてから数え、他の採番経路
    // (見積の売上変換・グループ売上) と直列化する (ロック無しの COUNT だと
    // 同時作成が同じ値を読み、同じ請求キーの行が2つできる。billing_key は
    // 請求書PDF・検収書のファイル名にもなるので、重複すると BOX で互いに上書きされる)
    const project = await tx.queryOne('SELECT gls_number, code FROM projects WHERE id = ? FOR UPDATE', [project_id]) as any;
    // billing_key の連番は「作成回数」ベースで採番する。
    // deleted_at IS NULL でフィルタすると、売上を1件削除したとき count が減り、
    // 次の新規作成が生存中の既存行と同じ連番を再利用して billing_key (請求キー) が
    // 重複する。ソフトデリート分も含めて数え、削除しても連番が減らないようにする
    // (連番が飛んでも一意性を優先)。
    const existingCount = ((await tx.queryOne(
      `SELECT COUNT(*) as c FROM revenues WHERE project_id = ?`,
      [project_id]
    )) as any).c;
    const seqNum = String(existingCount + 1).padStart(3, '0');

    let billing_key: string;
    if (revenueStatus === 'estimate') {
      // 概算見積: EST-{案件コード}-連番-税枝番。
      // 案件コードを含めないと全案件横断で EST-001-1 が量産され、別案件の見積 PDF が
      // 同名になる (billing_key はファイル名にも使われる)。code 未採番のヨミ案件は
      // project_id 先頭8桁で代替する。
      const estBase = (project?.code as string) || String(project_id).slice(0, 8);
      billing_key = `EST-${estBase}-${seqNum}-${taxSuffix}`;
    } else if (episodeCode) {
      // エピソード (月次ユニット等) 紐づき: {エピソードコード}-税枝番
      billing_key = `${episodeCode}-${taxSuffix}`;
    } else {
      // 確定: GLS番号-連番-税枝番
      const base = project?.gls_number || 'REV';
      billing_key = `${base}-${seqNum}-${taxSuffix}`;
    }

    await tx.execute(`INSERT INTO revenues (id, billing_key, project_id, customer_id, episode_id, assigned_to, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, subtitle, status, is_advance_payment, invoice_issued, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, billing_key, project_id, customer_id, episode_id || null, req.user!.id, tax_category || 'tax10', finalAmount, recognition_date || null, billing_date || null, dueDate || null, notes || null, subtitle || null, revenueStatus, isAdvancePayment, invoiceIssued, req.user!.id]);

    // 明細行を保存
    if (Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await tx.execute(
          `INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount, pricing_item_id, sort_order, period_start, period_end, item_notes, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), id, it.description || '', it.quantity || 1, it.unit_price || 0, it.amount || 0, it.pricing_item_id || null, i + 1, it.period_start || null, it.period_end || null, it.item_notes || null, it.category || null]
        );
      }
    }

    // 売上/概算見積登録時: 案件の想定金額を同期（estimateでも常に最新値で上書き）
    if (finalAmount > 0) {
      await tx.execute(`UPDATE projects SET expected_amount = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`, [finalAmount, project_id]);
    }
  });

  /*
   * **新規でも、請求書を出した状態で登録したら番号を採る**。
   * `PUT /:id`・`PATCH /billing/invoices/:id`・月次の一括発行と**同じ経路**を通します —
   * ここだけ採らないと「請求書発行済」で登録した行が請求の一覧に
   * **「番号未採番」で並び、入口で結果が変わります**。
   *
   * **取引の外（コミット後）で呼ぶのが作法**です。`assignInvoiceNumbers` は
   * 自分で1件ずつ取引を張り、対象行を `FOR UPDATE` で押さえてから
   * `sequences` を進めるため、コミット前に呼ぶと自分が入れた行を見つけられません。
   * すでに番号があれば飛ばすので、二重採番も番号の飛びも起きません。
   */
  if (invoiceIssued) {
    await assignInvoiceNumbers([id]);
  }

  // 採番の**あとで**読み直す（返す行に `invoice_no` が入るようにするため）
  const row = await queryOne('SELECT * FROM revenues WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// 売上更新（明細行対応）
router.put('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM revenues WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  // 配分グループの売上はこの口では触らない — 按分の内訳 (revenue_allocations) を
  // 直せないため、合計だけ変えると各案件への配分と食い違う
  // (estimate.service.convertToRevenue と同じエラーコードで止める)
  if (existing.group_id) {
    throw new AppError(400, 'REVENUE_IN_ALLOCATION_GROUP',
      'この売上は配分グループに入っています。費用を分け合うグループの画面（案件管理 > 費用を分け合うグループ）から編集してください');
  }
  // 請求キーはサーバーが組み立てる値なので、`req.body.billing_key` は受け取らない
  // (下の `finalBillingKey` が `existing.billing_key` から作る。取り出すだけで使っていなかった)
  const { project_id, customer_id, episode_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, items, subtitle, is_advance_payment, invoice_issued } = req.body;
  // **実際に変わったときだけ確かめる**（レビュー指摘・PR #199 P2 の2巡目 → #201 P1 で
  // 「渡されただけで再検証」の穴を修正。project.service.ts の update() と同じ判断）—
  // 画面は他の項目を直すときも今の customer_id を送り直すので、変化の有無を見ないと
  // あとから顧客ロールを外された会社の売上は無関係な直しまで止まってしまう
  if (customer_id && customer_id !== existing.customer_id) await assertCustomerCompanyId(customer_id);

  // 税区分変更時はbilling_keyの末尾税枝番を更新
  let finalBillingKey = existing.billing_key;
  if (tax_category && tax_category !== existing.tax_category) {
    const taxSuffix = taxBillingSuffix(tax_category);
    // 末尾の税枝番を置換 (GLS-A004-001-1 → GLS-A004-001-2)。
    // Excel取込の行は billing_key が NULL のことがある (請求キー列は空欄可) ので
    // null は null のまま通す (下の UPDATE は `finalBillingKey || null` で受ける)
    finalBillingKey = existing.billing_key ? existing.billing_key.replace(/-\d$/, `-${taxSuffix}`) : null;
  }

  // 明細行がある場合は合計を計算
  // items が未送信の場合は既存の revenue_items から再計算して revenues.amount を同期
  let finalAmount: number;
  if (Array.isArray(items) && items.length > 0) {
    finalAmount = items.reduce((sum: number, it: any) => sum + (it.amount || 0), 0);
  } else if (!Array.isArray(items)) {
    const existingItemsData = await queryOne(
      'SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt FROM revenue_items WHERE revenue_id = ?',
      [req.params.id]
    ) as any;
    finalAmount = Number(existingItemsData.cnt) > 0
      ? Number(existingItemsData.total)
      : (amount !== undefined ? amount : existing.amount);
  } else {
    finalAmount = amount !== undefined ? amount : existing.amount;
  }

  const isAdvancePayment = is_advance_payment !== undefined ? (is_advance_payment ? true : false) : existing.is_advance_payment;
  const invoiceIssued = invoice_issued !== undefined ? (invoice_issued ? true : false) : existing.invoice_issued;
  /*
   * ⚠️ **見込み (`status='estimate'`) の売上に「請求書発行済」を立てさせない。**
   *
   * 同じ列を書くもう1つの口 (`PATCH /billing/invoices/:id`) は
   * 「確定した売上だけ」で弾いています (レビューでの指摘 #53) が、**こちらには
   * その検査がありませんでした**。案件詳細の売上・請求ペインは見込みの行も
   * 並べるので、そこから直せるようにした途端に**この口が抜け道**になります。
   * 一覧はその状態の行を請求として出さないため、立ったことに誰も気づけません。
   *
   * **取り消し (false) は止めません** — 間違って立った印を消せなくなるため。
   */
  if (invoice_issued !== undefined && invoiceIssued && !existing.invoice_issued && existing.status !== 'confirmed') {
    throw new AppError(400, 'VALIDATION_ERROR',
      '確定した売上だけ請求書の発行を記録できます（見込みの行は対象外です）');
  }

  // 本体 UPDATE + 明細の全置換 (DELETE→INSERT) を単一トランザクションで実行する。
  // トランザクション無しだと DELETE 後の INSERT が途中失敗したとき明細が全損するため。
  await withTransaction(async (tx) => {
    await tx.execute(`UPDATE revenues SET billing_key=?, project_id=?, customer_id=?, episode_id=?, tax_category=?, amount=?, recognition_date=?, billing_date=?, payment_due_date=?, notes=?, subtitle=?, is_advance_payment=?, invoice_issued=?, updated_at=NOW(), updated_by=? WHERE id=?`,
      [finalBillingKey || null, project_id || existing.project_id, customer_id || existing.customer_id, episode_id !== undefined ? (episode_id || null) : existing.episode_id, tax_category || existing.tax_category, finalAmount,
       recognition_date !== undefined ? (recognition_date || null) : existing.recognition_date,
       billing_date !== undefined ? (billing_date || null) : existing.billing_date,
       payment_due_date !== undefined ? (payment_due_date || null) : existing.payment_due_date,
       notes !== undefined ? (notes || null) : existing.notes,
       subtitle !== undefined ? (subtitle || null) : existing.subtitle, isAdvancePayment, invoiceIssued, req.user!.id, req.params.id]);

    // 明細行を置換
    if (Array.isArray(items)) {
      // この画面が知らない列 (単位・行ごとの仕入・仕入先・AI 由来) を引き継ぐ。
      // **DELETE の前に読む**。消してからでは引き継ぐ値が残っていない。
      const carryover = await loadRevenueItemCarryover(String(req.params.id), tx.queryAll);

      await tx.execute('DELETE FROM revenue_items WHERE revenue_id = ?', [req.params.id]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const kept = carryover(it.description);
        await tx.execute(
          `INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount, pricing_item_id, sort_order, period_start, period_end, item_notes, category, unit, cost_amount, cost_vendor_id, is_ai_suggested) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), req.params.id, it.description || '', it.quantity || 1, it.unit_price || 0, it.amount || 0, it.pricing_item_id || null, i + 1,
           // 画面から送られてくる列は送られてきた値を優先し、
           // 送られてこなかった (undefined) ときだけ既存の値を引き継ぐ。
           // `null` で送ってきたときは「消したい」なので引き継がない。
           it.period_start !== undefined ? (it.period_start || null) : kept.period_start,
           it.period_end !== undefined ? (it.period_end || null) : kept.period_end,
           it.item_notes !== undefined ? (it.item_notes || null) : kept.item_notes,
           it.category !== undefined ? (it.category || null) : kept.category,
           // ここから下はこの版の画面に入力欄が無い。常に引き継ぐ。
           kept.unit, kept.cost_amount, kept.cost_vendor_id, kept.is_ai_suggested]
        );
      }
    }
  });

  /*
   * **請求書を出した瞬間に番号を採る** (migration 163)。
   * `PATCH /billing/invoices/:id` と同じ扱いにそろえます — こちらだけ採らないと、
   * 案件詳細・財務台帳のダイアログで「請求書発行済」にした行が
   * **請求の一覧に「番号未採番」で並びます**（同じ操作なのに入口で結果が変わる）。
   * すでに番号があれば飛ばすので、取り消して出し直しても番号は変わりません。
   */
  if (invoiceIssued && !existing.invoice_issued) {
    await assignInvoiceNumbers([String(req.params.id)]);
  }

  // 売上/概算見積更新時: 案件の想定金額を同期（estimateでも常に最新値で上書き）
  const finalProjectId = project_id || existing.project_id;
  if (finalAmount > 0) {
    await execute(`UPDATE projects SET expected_amount = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`, [finalAmount, finalProjectId]);
  }

  const row = await queryOne('SELECT * FROM revenues WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// 売上削除
router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await execute(`UPDATE revenues SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
