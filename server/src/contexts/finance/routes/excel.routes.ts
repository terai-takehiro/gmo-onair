// 予算管理アプリのExcel入出力
// revenues / purchases / sga_expenses
import { Router } from 'express';
import {
  createExcelResourceRouter, ResourceConfig, newId, asString, asInt, asDate,
} from '../../../shared/utils/excel-resource';
import {
  buildPurchaseWhere, buildPurchaseOrder,
  buildRevenueWhere, buildRevenueOrder,
  buildSgaWhere, buildSgaOrder,
} from '../list-query';

const TAX_MAP: Record<string, string> = {
  tax10: 'tax10', '10%': 'tax10', '税10': 'tax10',
  tax8: 'tax8', '8%': 'tax8', '軽減税率': 'tax8',
  exempt: 'exempt', '非課税': 'exempt', '免税': 'exempt',
};
function normTax(v: unknown): string {
  return TAX_MAP[String(v ?? '').trim().toLowerCase()] || 'tax10';
}

// ============================================================
// 売上 (revenues)
// ============================================================
const REVENUES_CONFIG: ResourceConfig = {
  name: '売上',
  filename: 'revenues',
  permission: { module: 'budget', level: 'editor' },
  // billing_keyは任意 — UNIQUE制約なし。重複検出は使わない (毎回INSERTでOK)
  columns: [
    { key: 'billing_key',      header: '請求キー',     width: 16 },
    { key: 'project_key',      header: '案件コード/GLS', width: 16 },
    { key: 'project_name',     header: '案件名',       width: 24 },
    { key: 'episode_code',     header: 'エピソードコード', width: 18 },
    { key: 'customer_name',    header: '顧客名',       width: 24 },
    { key: 'amount',           header: '金額',         width: 12 },
    { key: 'tax_category',     header: '税区分',       width: 10 },
    { key: 'recognition_date', header: '計上日',       width: 12 },
    { key: 'billing_date',     header: '請求日',       width: 12 },
    { key: 'payment_due_date', header: '支払期日',     width: 12 },
    { key: 'assigned_to_email', header: '担当者Email', width: 24 },
    { key: 'notes',            header: '備考',         width: 30 },
  ],
  templateRows: [
    { billing_key: 'INV-2026-001', project_key: 'PRJ-2026-001', project_name: '', episode_code: 'PRJ-2026-001-001',
      customer_name: '株式会社サンプル', amount: 1000000, tax_category: 'tax10',
      recognition_date: '2026-06-30', billing_date: '2026-06-30', payment_due_date: '2026-07-31',
      assigned_to_email: 'admin@example.com', notes: '' },
  ],
  guideSheet: {
    name: '入力ガイド',
    columns: [{ key: 'col', header: '項目', width: 20 }, { key: 'desc', header: '説明', width: 60 }],
    rows: [
      { col: '案件コード/GLS', desc: '【必須】projectsテーブルのcodeまたはgls_numberと一致' },
      { col: '顧客名', desc: '【必須】取引先マスター(companies, 顧客)のnameと一致' },
      { col: '税区分', desc: 'tax10 (10%) / tax8 (軽減税率) / exempt (非課税)。日本語OK' },
      { col: 'エピソードコード', desc: '任意 — 空欄なら案件全体の売上扱い' },
    ],
  },
  exportQuery: `
    SELECT r.billing_key, COALESCE(p.gls_number, p.code) as project_key, p.name as project_name, e.episode_code,
           c.name as customer_name, r.amount, r.tax_category,
           r.recognition_date, r.billing_date, r.payment_due_date,
           u.email as assigned_to_email, r.notes
    FROM revenues r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN episodes e ON e.id = r.episode_id
    LEFT JOIN companies c ON c.id = r.customer_id
    LEFT JOIN users u ON u.id = r.assigned_to
    WHERE r.deleted_at IS NULL ORDER BY r.recognition_date DESC`,
  buildExportQuery: (q) => {
    const { where, params } = buildRevenueWhere(q);
    const orderBy = buildRevenueOrder(q);
    return {
      sql: `
        SELECT r.billing_key, COALESCE(p.gls_number, p.code) as project_key, p.name as project_name, e.episode_code,
               c.name as customer_name, r.amount, r.tax_category,
               r.recognition_date, r.billing_date, r.payment_due_date,
               u.email as assigned_to_email, r.notes
        FROM revenues r
        LEFT JOIN projects p ON p.id = r.project_id
        LEFT JOIN episodes e ON e.id = r.episode_id
        LEFT JOIN companies c ON c.id = r.customer_id
        LEFT JOIN users u ON u.id = r.assigned_to
        ${where} ORDER BY ${orderBy}`,
      params,
    };
  },
  preloadLookups: async (client) => {
    const projects = await client.query('SELECT id, code, gls_number FROM projects WHERE deleted_at IS NULL');
    const episodes = await client.query('SELECT id, episode_code FROM episodes WHERE deleted_at IS NULL');
    // Phase 3-2a: revenues.customer_id は companies.id を直接指すので companies から引く。
    // **customers 行が生きている会社に限る**（レビュー指摘・PR #199 P2 の2巡目）
    // — 消えていないと、削除済みの顧客の名前で取込んだ行が誤って紐づいてしまう。
    const customers = await client.query(
      `SELECT co.id, co.name FROM companies co
       WHERE co.is_customer = TRUE AND co.deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM customers cu WHERE cu.company_id = co.id AND cu.deleted_at IS NULL)`,
    );
    const users = await client.query('SELECT id, email FROM users WHERE deleted_at IS NULL');
    const projMap = new Map<string, string>();
    for (const r of projects.rows) {
      if (r.code) projMap.set(r.code as string, r.id as string);
      if (r.gls_number) projMap.set(r.gls_number as string, r.id as string);
    }
    return {
      projects: projMap,
      episodes: new Map(episodes.rows.map((r) => [r.episode_code as string, r.id as string])),
      customers: new Map(customers.rows.map((r) => [r.name as string, r.id as string])),
      users: new Map(users.rows.map((r) => [r.email as string, r.id as string])),
    };
  },
  validateRow: (raw, lookups) => {
    const errors: string[] = [];
    const projectKey = asString(raw.project_key);
    const customerName = asString(raw.customer_name);
    const amount = asInt(raw.amount) ?? 0;

    if (!projectKey) errors.push('案件コード/GLSは必須');
    if (!customerName) errors.push('顧客名は必須');
    if (!amount) errors.push('金額は必須(数値)');

    let project_id: string | null = null;
    if (projectKey) {
      const id = lookups.projects?.get(projectKey);
      if (!id) errors.push(`案件 "${projectKey}" がマスタに存在しません`);
      else project_id = id;
    }
    let customer_id: string | null = null;
    if (customerName) {
      const id = lookups.customers?.get(customerName);
      if (!id) errors.push(`顧客 "${customerName}" がマスタに存在しません`);
      else customer_id = id;
    }
    let episode_id: string | null = null;
    const episodeCode = asString(raw.episode_code);
    if (episodeCode) {
      const id = lookups.episodes?.get(episodeCode);
      if (!id) errors.push(`エピソード "${episodeCode}" がマスタに存在しません`);
      else episode_id = id;
    }
    let assigned_to: string | null = null;
    const email = asString(raw.assigned_to_email);
    if (email) {
      const id = lookups.users?.get(email);
      if (id) assigned_to = id; // 任意項目なのでエラーにせず空のまま
    }

    return {
      data: {
        _displayName: `${asString(raw.billing_key) || projectKey} ¥${amount.toLocaleString()}`,
        billing_key: asString(raw.billing_key),
        project_id, episode_id, customer_id, assigned_to,
        amount,
        tax_category: normTax(raw.tax_category),
        recognition_date: asDate(raw.recognition_date),
        billing_date: asDate(raw.billing_date),
        payment_due_date: asDate(raw.payment_due_date),
        notes: asString(raw.notes),
      },
      errors,
    };
  },
  insert: async (client, d, userId) => {
    await client.query(
      `INSERT INTO revenues (id, billing_key, project_id, episode_id, customer_id, assigned_to,
                             amount, tax_category, recognition_date, billing_date, payment_due_date,
                             notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [newId(), d.billing_key, d.project_id, d.episode_id, d.customer_id, d.assigned_to,
       d.amount, d.tax_category, d.recognition_date, d.billing_date, d.payment_due_date,
       d.notes, userId, userId],
    );
  },
};

// ============================================================
// 仕入 (purchases)
// ============================================================
const PURCHASES_CONFIG: ResourceConfig = {
  name: '仕入',
  filename: 'purchases',
  permission: { module: 'budget', level: 'editor' },
  columns: [
    { key: 'billing_key',      header: '請求キー',     width: 16 },
    { key: 'project_key',      header: '案件コード/GLS', width: 16 },
    { key: 'project_name',     header: '案件名',       width: 24 },
    { key: 'episode_code',     header: 'エピソードコード', width: 18 },
    { key: 'vendor_name',      header: '仕入先名',     width: 24 },
    { key: 'amount',           header: '金額',         width: 12 },
    { key: 'tax_category',     header: '税区分',       width: 10 },
    { key: 'description',      header: '摘要',         width: 30 },
    { key: 'recognition_date', header: '計上日',       width: 12 },
    { key: 'inspection_date',  header: '検収日',       width: 12 },
    { key: 'payment_due_date', header: '支払期日',     width: 12 },
    { key: 'settlement_method', header: '精算方法',     width: 12 },
    { key: 'settlement_number', header: '精算番号',     width: 14 },
    { key: 'settlement_url',   header: '申請URL',      width: 30 },
    { key: 'assigned_to_email', header: '担当者Email', width: 24 },
    { key: 'notes',            header: '備考',         width: 30 },
  ],
  templateRows: [
    { billing_key: 'PUR-2026-001', project_key: 'PRJ-2026-001', project_name: '', episode_code: '',
      vendor_name: '株式会社サンプル仕入', amount: 300000, tax_category: 'tax10',
      description: 'カメラレンタル', recognition_date: '2026-06-15',
      inspection_date: '2026-06-15', payment_due_date: '2026-07-31',
      settlement_method: 'rakuraku', settlement_number: '', settlement_url: '',
      assigned_to_email: 'admin@example.com', notes: '' },
  ],
  guideSheet: {
    name: '入力ガイド',
    columns: [{ key: 'col', header: '項目', width: 20 }, { key: 'desc', header: '説明', width: 60 }],
    rows: [
      { col: '案件コード/GLS', desc: '【必須】projectsテーブルのcodeまたはgls_numberと一致' },
      { col: '仕入先名', desc: '【必須】vendorsテーブルのnameと一致' },
      { col: '精算方法', desc: 'rakuraku / xpoint / other' },
    ],
  },
  exportQuery: `
    SELECT pu.billing_key, COALESCE(p.gls_number, p.code) as project_key, p.name as project_name, e.episode_code,
           v.name as vendor_name, pu.amount, pu.tax_category, pu.description,
           pu.recognition_date, pu.inspection_date, pu.payment_due_date,
           pu.settlement_method, pu.settlement_number, pu.settlement_url, u.email as assigned_to_email, pu.notes
    FROM purchases pu
    LEFT JOIN projects p ON p.id = pu.project_id
    LEFT JOIN episodes e ON e.id = pu.episode_id
    LEFT JOIN vendors v ON v.id = pu.vendor_id
    LEFT JOIN users u ON u.id = pu.assigned_to
    WHERE pu.deleted_at IS NULL ORDER BY pu.recognition_date DESC`,
  buildExportQuery: (q) => {
    const { where, params } = buildPurchaseWhere(q);
    const orderBy = buildPurchaseOrder(q);
    return {
      sql: `
        SELECT pu.billing_key, COALESCE(p.gls_number, p.code) as project_key, p.name as project_name, e.episode_code,
               v.name as vendor_name, pu.amount, pu.tax_category, pu.description,
               pu.recognition_date, pu.inspection_date, pu.payment_due_date,
               pu.settlement_method, pu.settlement_number, pu.settlement_url, u.email as assigned_to_email, pu.notes
        FROM purchases pu
        LEFT JOIN projects p ON p.id = pu.project_id
        LEFT JOIN episodes e ON e.id = pu.episode_id
        LEFT JOIN vendors v ON v.id = pu.vendor_id
        LEFT JOIN users u ON u.id = pu.assigned_to
        ${where} ORDER BY ${orderBy}`,
      params,
    };
  },
  preloadLookups: async (client) => {
    const projects = await client.query('SELECT id, code, gls_number FROM projects WHERE deleted_at IS NULL');
    const episodes = await client.query('SELECT id, episode_code FROM episodes WHERE deleted_at IS NULL');
    const vendors = await client.query('SELECT id, name FROM vendors WHERE deleted_at IS NULL');
    const users = await client.query('SELECT id, email FROM users WHERE deleted_at IS NULL');
    const projMap = new Map<string, string>();
    for (const r of projects.rows) {
      if (r.code) projMap.set(r.code as string, r.id as string);
      if (r.gls_number) projMap.set(r.gls_number as string, r.id as string);
    }
    return {
      projects: projMap,
      episodes: new Map(episodes.rows.map((r) => [r.episode_code as string, r.id as string])),
      vendors: new Map(vendors.rows.map((r) => [r.name as string, r.id as string])),
      users: new Map(users.rows.map((r) => [r.email as string, r.id as string])),
    };
  },
  validateRow: (raw, lookups) => {
    const errors: string[] = [];
    const projectKey = asString(raw.project_key);
    const vendorName = asString(raw.vendor_name);
    const amount = asInt(raw.amount) ?? 0;

    if (!projectKey) errors.push('案件コード/GLSは必須');
    if (!vendorName) errors.push('仕入先名は必須');
    if (!amount) errors.push('金額は必須(数値)');

    let project_id: string | null = null;
    if (projectKey) {
      const id = lookups.projects?.get(projectKey);
      if (!id) errors.push(`案件 "${projectKey}" がマスタに存在しません`);
      else project_id = id;
    }
    let vendor_id: string | null = null;
    if (vendorName) {
      const id = lookups.vendors?.get(vendorName);
      if (!id) errors.push(`仕入先 "${vendorName}" がマスタに存在しません`);
      else vendor_id = id;
    }
    let episode_id: string | null = null;
    const ec = asString(raw.episode_code);
    if (ec) {
      const id = lookups.episodes?.get(ec);
      if (!id) errors.push(`エピソード "${ec}" がマスタに存在しません`);
      else episode_id = id;
    }
    let assigned_to: string | null = null;
    const email = asString(raw.assigned_to_email);
    if (email) assigned_to = lookups.users?.get(email) ?? null;

    let settlement = asString(raw.settlement_method)?.toLowerCase() || null;
    if (settlement && !['rakuraku', 'xpoint', 'other'].includes(settlement)) settlement = 'other';

    return {
      data: {
        _displayName: `${asString(raw.billing_key) || projectKey} ¥${amount.toLocaleString()}`,
        billing_key: asString(raw.billing_key),
        project_id, episode_id, vendor_id, assigned_to,
        amount,
        tax_category: normTax(raw.tax_category),
        description: asString(raw.description),
        recognition_date: asDate(raw.recognition_date),
        inspection_date: asDate(raw.inspection_date),
        payment_due_date: asDate(raw.payment_due_date),
        settlement_method: settlement,
        settlement_number: asString(raw.settlement_number),
        settlement_url: asString(raw.settlement_url),
        notes: asString(raw.notes),
      },
      errors,
    };
  },
  insert: async (client, d, userId) => {
    await client.query(
      `INSERT INTO purchases (id, billing_key, project_id, episode_id, vendor_id, assigned_to,
                              settlement_method, settlement_number, settlement_url, amount, tax_category, description,
                              recognition_date, inspection_date, payment_due_date,
                              notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [newId(), d.billing_key, d.project_id, d.episode_id, d.vendor_id, d.assigned_to,
       d.settlement_method, d.settlement_number, d.settlement_url, d.amount, d.tax_category, d.description,
       d.recognition_date, d.inspection_date, d.payment_due_date,
       d.notes, userId, userId],
    );
  },
};

// ============================================================
// 販管費 (sga_expenses)
// ============================================================
const SGA_CONFIG: ResourceConfig = {
  name: '販管費',
  filename: 'sga_expenses',
  permission: { module: 'budget', level: 'editor' },
  columns: [
    { key: 'billing_key',       header: '請求キー',   width: 16 },
    { key: 'vendor_name',       header: 'ベンダー名', width: 24 },
    { key: 'description',       header: '摘要',       width: 30 },
    { key: 'amount',            header: '金額',       width: 12 },
    { key: 'tax_category',      header: '税区分',     width: 10 },
    { key: 'expense_type',      header: '費用区分',   width: 12 },
    { key: 'recognition_date',  header: '計上日',     width: 12 },
    { key: 'payment_due_date',  header: '支払期日',   width: 12 },
    { key: 'amortize_start',    header: '償却開始',   width: 12 },
    { key: 'amortize_end',      header: '償却終了',   width: 12 },
    { key: 'settlement_method', header: '精算方法',   width: 12 },
    { key: 'settlement_number', header: '精算番号',   width: 14 },
    { key: 'settlement_url',    header: '申請URL',    width: 30 },
    { key: 'assigned_to_email', header: '担当者Email', width: 24 },
    { key: 'notes',             header: '備考',       width: 30 },
  ],
  templateRows: [
    { billing_key: 'SGA-2026-001', vendor_name: 'Adobe', description: 'Creative Cloud月額',
      amount: 7000, tax_category: 'tax10', expense_type: 'fixed',
      recognition_date: '2026-04-01', payment_due_date: '2026-04-27',
      amortize_start: '', amortize_end: '', settlement_method: 'other',
      settlement_number: '', settlement_url: '',
      assigned_to_email: 'admin@example.com', notes: '' },
  ],
  guideSheet: {
    name: '入力ガイド',
    columns: [{ key: 'col', header: '項目', width: 20 }, { key: 'desc', header: '説明', width: 60 }],
    rows: [
      { col: 'ベンダー名', desc: '【必須】文字列。マスタ登録不要(自由入力)' },
      { col: '費用区分', desc: 'fixed (固定費) / spot (スポット)' },
      { col: '償却開始/終了', desc: '保険料・年額契約等を月割りする場合に指定' },
    ],
  },
  exportQuery: `
    SELECT s.billing_key, s.vendor_name, s.description, s.amount, s.tax_category,
           s.expense_type, s.recognition_date, s.payment_due_date,
           s.amortize_start, s.amortize_end, s.settlement_method,
           s.settlement_number, s.settlement_url,
           u.email as assigned_to_email, s.notes
    FROM sga_expenses s
    LEFT JOIN users u ON u.id = s.assigned_to
    WHERE s.deleted_at IS NULL ORDER BY s.recognition_date DESC`,
  buildExportQuery: (q) => {
    const { where, params } = buildSgaWhere(q);
    const orderBy = buildSgaOrder(q);
    return {
      sql: `
        SELECT s.billing_key, s.vendor_name, s.description, s.amount, s.tax_category,
               s.expense_type, s.recognition_date, s.payment_due_date,
               s.amortize_start, s.amortize_end, s.settlement_method,
               s.settlement_number, s.settlement_url,
               u.email as assigned_to_email, s.notes
        FROM sga_expenses s
        LEFT JOIN users u ON u.id = s.assigned_to
        ${where} ORDER BY ${orderBy}`,
      params,
    };
  },
  preloadLookups: async (client) => {
    const users = await client.query('SELECT id, email FROM users WHERE deleted_at IS NULL');
    return { users: new Map(users.rows.map((r) => [r.email as string, r.id as string])) };
  },
  validateRow: (raw, lookups) => {
    const errors: string[] = [];
    const billingKey = asString(raw.billing_key);
    const vendorName = asString(raw.vendor_name);
    const amount = asInt(raw.amount) ?? 0;

    if (!billingKey) errors.push('請求キーは必須');
    if (!vendorName) errors.push('ベンダー名は必須');
    if (!amount) errors.push('金額は必須(数値)');

    let assigned_to: string | null = null;
    const email = asString(raw.assigned_to_email);
    if (email) assigned_to = lookups.users?.get(email) ?? null;

    const expenseType = String(raw.expense_type ?? 'spot').trim().toLowerCase();
    const expense_type = ['fixed', 'spot'].includes(expenseType) ? expenseType : 'spot';

    let settlement = asString(raw.settlement_method)?.toLowerCase() || null;
    if (settlement && !['rakuraku', 'xpoint', 'other'].includes(settlement)) settlement = 'other';

    return {
      data: {
        _displayName: `${billingKey} ¥${amount.toLocaleString()}`,
        billing_key: billingKey,
        vendor_name: vendorName,
        description: asString(raw.description),
        amount,
        tax_category: normTax(raw.tax_category),
        expense_type,
        recognition_date: asDate(raw.recognition_date),
        payment_due_date: asDate(raw.payment_due_date),
        amortize_start: asDate(raw.amortize_start),
        amortize_end: asDate(raw.amortize_end),
        settlement_method: settlement,
        settlement_number: asString(raw.settlement_number),
        settlement_url: asString(raw.settlement_url),
        assigned_to,
        notes: asString(raw.notes),
      },
      errors,
    };
  },
  insert: async (client, d, userId) => {
    await client.query(
      `INSERT INTO sga_expenses (id, billing_key, vendor_name, description, amount,
                                 tax_category, expense_type, recognition_date, payment_due_date,
                                 amortize_start, amortize_end, settlement_method, settlement_number, settlement_url, assigned_to,
                                 notes, source, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [newId(), d.billing_key, d.vendor_name, d.description, d.amount,
       d.tax_category, d.expense_type, d.recognition_date, d.payment_due_date,
       d.amortize_start, d.amortize_end, d.settlement_method, d.settlement_number, d.settlement_url, d.assigned_to,
       d.notes, 'staff', userId, userId],
    );
  },
};

export function createFinanceExcelRouter(): Router {
  const router = Router();
  router.use('/revenues/excel', createExcelResourceRouter(REVENUES_CONFIG));
  router.use('/purchases/excel', createExcelResourceRouter(PURCHASES_CONFIG));
  router.use('/sga-expenses/excel', createExcelResourceRouter(SGA_CONFIG));
  return router;
}
