import { Router } from 'express';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';

const router = Router();

// Helper: wrap HTML content in a printable page
function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif; color: #333; padding: 40px; max-width: 800px; margin: 0 auto; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
  h1 { font-size: 22px; text-align: center; margin-bottom: 30px; border-bottom: 2px solid #005bac; padding-bottom: 10px; }
  h2 { font-size: 16px; margin: 20px 0 10px; color: #005bac; }
  .meta { margin-bottom: 20px; font-size: 13px; color: #666; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 20px; font-size: 13px; }
  th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
  th { background: #f5f7fa; font-weight: 600; white-space: nowrap; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .total-row { background: #eef3fb; font-weight: 600; }
  .stamp-area { margin-top: 30px; display: flex; justify-content: flex-end; gap: 20px; }
  .stamp-box { width: 80px; height: 80px; border: 1px solid #ccc; text-align: center; line-height: 80px; font-size: 11px; color: #999; }
  .print-btn { display: block; margin: 20px auto; padding: 8px 24px; background: #005bac; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
  .print-btn:hover { background: #004a8f; }
</style>
</head>
<body>
${body}
<button class="print-btn no-print" onclick="window.print()">印刷 / PDF出力</button>
</body>
</html>`;
}

function formatYen(amount: number): string {
  return `¥${(amount || 0).toLocaleString('ja-JP')}`;
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// GET /reports/estimate/:opportunityId - 見積書 HTML
router.get('/estimate/:opportunityId', requireAuth, (req, res) => {
  const { opportunityId } = req.params;

  const opp = queryOne(
    `SELECT o.*, c.name as customer_name FROM opportunities o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.id = ? AND o.deleted_at IS NULL`,
    [opportunityId]
  ) as Record<string, any> | undefined;

  if (!opp) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '見積対象のヨミが見つかりません' } });
    return;
  }

  const simItems = queryAll(
    `SELECT os.*, pi.name as item_name, pc.name as category_name
     FROM opportunity_simulations os
     LEFT JOIN pricing_items pi ON pi.id = os.pricing_item_id
     LEFT JOIN pricing_categories pc ON pc.id = pi.category_id
     WHERE os.opportunity_id = ?
     ORDER BY pc.sort_order, pi.sort_order`,
    [opportunityId]
  ) as Record<string, any>[];

  const totalAmount = simItems.reduce((sum: number, item: Record<string, any>) => sum + (item.subtotal || 0), 0);
  const tax = Math.floor(totalAmount * 0.1);
  const grandTotal = totalAmount + tax;
  const today = new Date().toISOString().split('T')[0];

  let rows = '';
  simItems.forEach((item: Record<string, any>, i: number) => {
    rows += `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(item.category_name)} / ${escapeHtml(item.item_name)}</td>
      <td class="num">${item.quantity || 1}</td>
      <td class="num">${item.days || 1}</td>
      <td class="num">${formatYen(item.unit_price)}</td>
      <td class="num">${formatYen(item.subtotal)}</td>
    </tr>`;
  });

  const body = `
    <h1>御 見 積 書</h1>
    <div class="meta">
      <div class="meta-row"><span>見積番号: EST-${escapeHtml(opp.opp_code)}</span><span>発行日: ${today}</span></div>
      <div class="meta-row"><span>宛先: ${escapeHtml(opp.customer_name)} 御中</span></div>
      <div class="meta-row"><span>件名: ${escapeHtml(opp.title)}</span></div>
    </div>
    <h2>見積金額: ${formatYen(grandTotal)}（税込）</h2>
    <table>
      <thead>
        <tr><th>#</th><th>項目</th><th>数量</th><th>日数</th><th>単価</th><th>小計</th></tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total-row"><td colspan="5">小計</td><td class="num">${formatYen(totalAmount)}</td></tr>
        <tr class="total-row"><td colspan="5">消費税 (10%)</td><td class="num">${formatYen(tax)}</td></tr>
        <tr class="total-row"><td colspan="5">合計</td><td class="num">${formatYen(grandTotal)}</td></tr>
      </tbody>
    </table>
    <div class="stamp-area">
      <div class="stamp-box">承認</div>
      <div class="stamp-box">確認</div>
      <div class="stamp-box">担当</div>
    </div>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(htmlPage(`見積書 - ${opp.title}`, body));
});

// GET /reports/invoice/:invoiceGroupId - 請求書 HTML
router.get('/invoice/:invoiceGroupId', requireAuth, (req, res) => {
  const { invoiceGroupId } = req.params;

  const ig = queryOne(
    `SELECT ig.*, p.name as project_name, p.gls_number, c.name as customer_name
     FROM invoice_groups ig
     LEFT JOIN projects p ON p.id = ig.project_id
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE ig.id = ? AND ig.deleted_at IS NULL`,
    [invoiceGroupId]
  ) as Record<string, any> | undefined;

  if (!ig) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '請求グループが見つかりません' } });
    return;
  }

  const episodes = queryAll(
    `SELECT e.*,
       COALESCE((SELECT SUM(r.amount) FROM revenues r WHERE r.episode_id = e.id AND r.deleted_at IS NULL), 0) as actual_revenue
     FROM episodes e
     JOIN invoice_group_episodes ige ON ige.episode_id = e.id
     WHERE ige.invoice_group_id = ? AND e.deleted_at IS NULL
     ORDER BY e.episode_number`,
    [invoiceGroupId]
  ) as Record<string, any>[];

  const totalRevenue = episodes.reduce((sum: number, ep: Record<string, any>) => sum + (ep.actual_revenue || 0), 0);
  const tax = Math.floor(totalRevenue * 0.1);
  const grandTotal = totalRevenue + tax;
  const invoiceDate = ig.invoice_date || new Date().toISOString().split('T')[0];

  let rows = '';
  episodes.forEach((ep: Record<string, any>) => {
    rows += `<tr>
      <td>${escapeHtml(ep.episode_code)}</td>
      <td>第${ep.episode_number}話</td>
      <td>${ep.broadcast_date || '-'}</td>
      <td class="num">${formatYen(ep.actual_revenue)}</td>
    </tr>`;
  });

  const body = `
    <h1>請 求 書</h1>
    <div class="meta">
      <div class="meta-row"><span>請求日: ${invoiceDate}</span></div>
      <div class="meta-row"><span>宛先: ${escapeHtml(ig.customer_name)} 御中</span></div>
      <div class="meta-row"><span>案件: ${escapeHtml(ig.gls_number)} ${escapeHtml(ig.project_name)}</span></div>
      <div class="meta-row"><span>請求名: ${escapeHtml(ig.title)}</span></div>
    </div>
    <h2>ご請求金額: ${formatYen(grandTotal)}（税込）</h2>
    <table>
      <thead>
        <tr><th>エピソードコード</th><th>話数</th><th>放送日</th><th>金額</th></tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total-row"><td colspan="3">小計</td><td class="num">${formatYen(totalRevenue)}</td></tr>
        <tr class="total-row"><td colspan="3">消費税 (10%)</td><td class="num">${formatYen(tax)}</td></tr>
        <tr class="total-row"><td colspan="3">合計</td><td class="num">${formatYen(grandTotal)}</td></tr>
      </tbody>
    </table>
    <div class="stamp-area">
      <div class="stamp-box">承認</div>
      <div class="stamp-box">確認</div>
      <div class="stamp-box">担当</div>
    </div>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(htmlPage(`請求書 - ${ig.title}`, body));
});

// GET /reports/performance/:projectId - 案件別損益 CSV
router.get('/performance/:projectId', requireAuth, (req, res) => {
  const { projectId } = req.params;

  const project = queryOne(
    `SELECT p.*, c.name as customer_name FROM projects p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.id = ? AND p.deleted_at IS NULL`,
    [projectId]
  ) as Record<string, any> | undefined;

  if (!project) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '案件が見つかりません' } });
    return;
  }

  const episodes = queryAll(
    `SELECT e.*,
       COALESCE((SELECT SUM(r.amount) FROM revenues r WHERE r.episode_id = e.id AND r.deleted_at IS NULL), 0) as actual_revenue,
       COALESCE((SELECT SUM(pu.amount) FROM purchases pu WHERE pu.episode_id = e.id AND pu.deleted_at IS NULL), 0) as actual_purchase
     FROM episodes e
     WHERE e.project_id = ? AND e.deleted_at IS NULL
     ORDER BY e.episode_number`,
    [projectId]
  ) as Record<string, any>[];

  // Build CSV
  const BOM = '\uFEFF';
  const header = '案件番号,案件名,顧客名,話数コード,話数,実績売上,実績仕入,粗利,粗利率(%)';
  const rows = episodes.map((ep: Record<string, any>) => {
    const grossProfit = (ep.actual_revenue || 0) - (ep.actual_purchase || 0);
    const marginRate = ep.actual_revenue > 0 ? Math.round((grossProfit / ep.actual_revenue) * 1000) / 10 : 0;
    return [
      project.gls_number,
      `"${(project.name || '').replace(/"/g, '""')}"`,
      `"${(project.customer_name || '').replace(/"/g, '""')}"`,
      ep.episode_code,
      ep.episode_number,
      ep.actual_revenue || 0,
      ep.actual_purchase || 0,
      grossProfit,
      marginRate,
    ].join(',');
  });

  // Add total row
  const totals = episodes.reduce(
    (acc: Record<string, number>, ep: Record<string, any>) => {
      acc.revenue += ep.actual_revenue || 0;
      acc.purchase += ep.actual_purchase || 0;
      return acc;
    },
    { revenue: 0, purchase: 0 }
  );
  const totalProfit = totals.revenue - totals.purchase;
  const totalMargin = totals.revenue > 0 ? Math.round((totalProfit / totals.revenue) * 1000) / 10 : 0;
  rows.push([
    '', '"合計"', '', '', '',
    totals.revenue, totals.purchase,
    totalProfit, totalMargin,
  ].join(','));

  const csv = BOM + header + '\n' + rows.join('\n') + '\n';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=performance-${project.gls_number}.csv`);
  res.send(csv);
});

// GET /reports/vendor-summary?from=&to=&format= - 仕入先別集計
router.get('/vendor-summary', requireAuth, (req, res) => {
  const from = req.query.from as string || '';
  const to = req.query.to as string || '';
  const format = req.query.format as string || 'json';

  let whereClause = 'p.deleted_at IS NULL';
  const params: string[] = [];

  if (from) {
    whereClause += ' AND p.recognition_date >= ?';
    params.push(from);
  }
  if (to) {
    whereClause += ' AND p.recognition_date <= ?';
    params.push(to);
  }

  const rows = queryAll(
    `SELECT v.id as vendor_id, v.name as vendor_name, v.vendor_type,
            COUNT(p.id) as purchase_count,
            COALESCE(SUM(p.amount), 0) as total_amount
     FROM purchases p
     JOIN vendors v ON v.id = p.vendor_id
     WHERE ${whereClause}
     GROUP BY v.id, v.name, v.vendor_type
     ORDER BY total_amount DESC`,
    params
  ) as Record<string, any>[];

  const grandTotal = rows.reduce((sum: number, r: Record<string, any>) => sum + (r.total_amount || 0), 0);

  if (format === 'csv') {
    const BOM = '\uFEFF';
    const header = '仕入先名,種別,件数,合計額,構成比(%)';
    const csvRows = rows.map((r: Record<string, any>) => {
      const pct = grandTotal > 0 ? Math.round(((r.total_amount || 0) / grandTotal) * 1000) / 10 : 0;
      return [
        `"${(r.vendor_name || '').replace(/"/g, '""')}"`,
        `"${(r.vendor_type || '').replace(/"/g, '""')}"`,
        r.purchase_count,
        r.total_amount,
        pct,
      ].join(',');
    });
    csvRows.push(['"合計"', '', rows.reduce((s: number, r: Record<string, any>) => s + r.purchase_count, 0), grandTotal, 100].join(','));

    const csv = BOM + header + '\n' + csvRows.join('\n') + '\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=vendor-summary-${from || 'all'}-${to || 'all'}.csv`);
    res.send(csv);
    return;
  }

  // JSON response
  const data = rows.map((r: Record<string, any>) => ({
    ...r,
    percentage: grandTotal > 0 ? Math.round(((r.total_amount || 0) / grandTotal) * 1000) / 10 : 0,
  }));

  res.json({ success: true, data: { items: data, grand_total: grandTotal } });
});

export default router;
