// 案件管理アプリのExcel入出力
// customers / vendors / partners / projects / episodes
import { Router } from 'express';
import {
  createExcelResourceRouter, ResourceConfig, newId, asString, asInt, asDate,
} from '../../../shared/utils/excel-resource';

// ============================================================
// 顧客 (customers)
// ============================================================
const CUSTOMERS_CONFIG: ResourceConfig = {
  name: '顧客',
  filename: 'customers',
  permission: { module: 'sales', level: 'editor' },
  duplicate: { table: 'customers', column: 'name' },
  columns: [
    { key: 'name',         header: '会社名',     width: 28 },
    { key: 'short_name',   header: '略称',       width: 14 },
    { key: 'contact_name', header: '担当者',     width: 16 },
    { key: 'email',        header: 'Email',      width: 24 },
    { key: 'phone',        header: '電話',       width: 16 },
    { key: 'address',      header: '住所',       width: 40 },
    { key: 'notes',        header: '備考',       width: 30 },
  ],
  templateRows: [
    { name: '株式会社サンプル', short_name: 'サンプル社', contact_name: '山田太郎',
      email: 'yamada@example.com', phone: '03-1234-5678', address: '東京都港区...', notes: '' },
  ],
  exportQuery: `
    SELECT name, short_name, contact_name, email, phone, address, notes
    FROM customers WHERE deleted_at IS NULL ORDER BY name`,
  validateRow: (raw) => {
    const errors: string[] = [];
    const name = asString(raw.name);
    if (!name) errors.push('会社名は必須');
    return {
      data: {
        _displayName: name,
        name,
        short_name: asString(raw.short_name),
        contact_name: asString(raw.contact_name),
        email: asString(raw.email),
        phone: asString(raw.phone),
        address: asString(raw.address),
        notes: asString(raw.notes),
      },
      errors,
      uniqueKey: name,
    };
  },
  insert: async (client, d, userId) => {
    await client.query(
      `INSERT INTO customers (id, name, short_name, contact_name, email, phone, address, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [newId(), d.name, d.short_name, d.contact_name, d.email, d.phone, d.address, d.notes, userId, userId],
    );
  },
  update: async (client, id, d, userId) => {
    await client.query(
      `UPDATE customers SET name=$1, short_name=$2, contact_name=$3, email=$4, phone=$5, address=$6, notes=$7,
       updated_by=$8, updated_at=NOW() WHERE id=$9`,
      [d.name, d.short_name, d.contact_name, d.email, d.phone, d.address, d.notes, userId, id],
    );
  },
};

// ============================================================
// 仕入先 (vendors)
// ============================================================
const VENDORS_CONFIG: ResourceConfig = {
  name: '仕入先',
  filename: 'vendors',
  permission: { module: 'budget', level: 'editor' },
  duplicate: { table: 'vendors', column: 'name' },
  columns: [
    { key: 'name',                        header: '会社名',           width: 28 },
    { key: 'contact_name',                header: '担当者',           width: 16 },
    { key: 'email',                       header: 'Email',            width: 24 },
    { key: 'phone',                       header: '電話',             width: 16 },
    { key: 'address',                     header: '住所',             width: 40 },
    { key: 'vendor_type',                 header: '区分',             width: 12 },
    { key: 'invoice_registration_number', header: '適格請求書登録番号', width: 24 },
    { key: 'notes',                       header: '備考',             width: 30 },
  ],
  templateRows: [
    { name: '株式会社サンプル仕入', contact_name: '佐藤花子', email: 'sato@example.com',
      phone: '03-9876-5432', address: '東京都新宿区...', vendor_type: '機材',
      invoice_registration_number: 'T1234567890123', notes: '' },
  ],
  exportQuery: `
    SELECT name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes
    FROM vendors WHERE deleted_at IS NULL ORDER BY name`,
  validateRow: (raw) => {
    const errors: string[] = [];
    const name = asString(raw.name);
    if (!name) errors.push('会社名は必須');
    return {
      data: {
        _displayName: name,
        name,
        contact_name: asString(raw.contact_name),
        email: asString(raw.email),
        phone: asString(raw.phone),
        address: asString(raw.address),
        vendor_type: asString(raw.vendor_type),
        invoice_registration_number: asString(raw.invoice_registration_number),
        notes: asString(raw.notes),
      },
      errors,
      uniqueKey: name,
    };
  },
  insert: async (client, d, userId) => {
    await client.query(
      `INSERT INTO vendors (id, name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [newId(), d.name, d.contact_name, d.email, d.phone, d.address, d.vendor_type, d.invoice_registration_number, d.notes, userId, userId],
    );
  },
  update: async (client, id, d, userId) => {
    await client.query(
      `UPDATE vendors SET name=$1, contact_name=$2, email=$3, phone=$4, address=$5, vendor_type=$6,
       invoice_registration_number=$7, notes=$8, updated_by=$9, updated_at=NOW() WHERE id=$10`,
      [d.name, d.contact_name, d.email, d.phone, d.address, d.vendor_type, d.invoice_registration_number, d.notes, userId, id],
    );
  },
};

// ============================================================
// パートナー (partners)
// ============================================================
const PARTNERS_CONFIG: ResourceConfig = {
  name: 'パートナー',
  filename: 'partners',
  permission: { module: 'budget', level: 'editor' },
  duplicate: { table: 'partners', column: 'name' },
  columns: [
    { key: 'name',        header: '氏名',     width: 20 },
    { key: 'email',       header: 'Email',    width: 24 },
    { key: 'phone',       header: '電話',     width: 16 },
    { key: 'role_title',  header: '役職',     width: 16 },
    { key: 'specialties', header: '専門分野', width: 30 },
    { key: 'notes',       header: '備考',     width: 30 },
  ],
  templateRows: [
    { name: '田中一郎', email: 'tanaka@example.com', phone: '090-1234-5678',
      role_title: 'カメラマン', specialties: 'カメラ,照明', notes: '' },
  ],
  guideSheet: {
    name: '入力ガイド',
    columns: [
      { key: 'col', header: '項目', width: 20 },
      { key: 'desc', header: '説明', width: 60 },
    ],
    rows: [
      { col: '専門分野', desc: 'カンマ区切りで複数指定可 (例: カメラ,照明,音声)' },
    ],
  },
  exportQuery: `
    SELECT name, email, phone, role_title, specialties, notes
    FROM partners WHERE deleted_at IS NULL ORDER BY name`,
  validateRow: (raw) => {
    const errors: string[] = [];
    const name = asString(raw.name);
    if (!name) errors.push('氏名は必須');
    // specialtiesがカンマ区切り文字列ならJSON配列に
    let specialties = asString(raw.specialties);
    if (specialties && !specialties.startsWith('[')) {
      const arr = specialties.split(',').map((s) => s.trim()).filter(Boolean);
      specialties = JSON.stringify(arr);
    }
    return {
      data: {
        _displayName: name,
        name,
        email: asString(raw.email),
        phone: asString(raw.phone),
        role_title: asString(raw.role_title),
        specialties: specialties || '[]',
        notes: asString(raw.notes),
      },
      errors,
      uniqueKey: name,
    };
  },
  insert: async (client, d, userId) => {
    await client.query(
      `INSERT INTO partners (id, name, email, phone, role_title, specialties, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [newId(), d.name, d.email, d.phone, d.role_title, d.specialties, d.notes, userId, userId],
    );
  },
  update: async (client, id, d, userId) => {
    await client.query(
      `UPDATE partners SET name=$1, email=$2, phone=$3, role_title=$4, specialties=$5, notes=$6,
       updated_by=$7, updated_at=NOW() WHERE id=$8`,
      [d.name, d.email, d.phone, d.role_title, d.specialties, d.notes, userId, id],
    );
  },
};

// ============================================================
// 案件 (projects) — 顧客lookup + ステージ正規化
// ============================================================
const STAGE_MAP: Record<string, string> = {
  neta: 'neta', 'ネタ': 'neta',
  d_hold: 'd_hold', '保留': 'd_hold',
  c_proposal: 'c_proposal', '提案中': 'c_proposal',
  b_verbal: 'b_verbal', '口頭内示': 'b_verbal',
  a_won: 'a_won', '受注': 'a_won',
  s_completed: 's_completed', '完了': 's_completed',
  e_lost: 'e_lost', '失注': 'e_lost',
};

const PROJECTS_CONFIG: ResourceConfig = {
  name: '案件',
  filename: 'projects',
  permission: { module: 'sales', level: 'editor' },
  duplicate: { table: 'projects', column: 'code' },
  columns: [
    { key: 'code',                 header: 'コード',         width: 16 },
    { key: 'gls_number',           header: 'GLS番号',        width: 14 },
    { key: 'name',                 header: '案件名',         width: 36 },
    { key: 'customer_name',        header: '顧客名',         width: 24 },
    { key: 'stage',                header: 'ステージ',       width: 12 },
    { key: 'project_type',         header: '案件種別',       width: 14 },
    { key: 'expected_amount',      header: '予定金額',       width: 14 },
    { key: 'event_start',          header: '開始日',         width: 12 },
    { key: 'event_end',            header: '終了日',         width: 12 },
    { key: 'broadcast_type',       header: '配信種別',       width: 12 },
    { key: 'media_platform',       header: 'メディア',       width: 14 },
    { key: 'assigned_to_email',    header: '担当者Email',    width: 24 },
    { key: 'tags',                 header: 'タグ',           width: 18 },
    { key: 'notes',                header: '備考',           width: 30 },
  ],
  templateRows: [
    { code: 'PRJ-2026-001', gls_number: '', name: 'サンプル案件',
      customer_name: '株式会社サンプル', stage: 'c_proposal', project_type: 'event',
      expected_amount: 1000000, event_start: '2026-06-01', event_end: '2026-06-02',
      broadcast_type: 'live', media_platform: 'YouTube',
      assigned_to_email: 'admin@example.com', tags: '配信,IR', notes: '' },
  ],
  guideSheet: {
    name: '入力ガイド',
    columns: [
      { key: 'col', header: '項目', width: 20 },
      { key: 'desc', header: '説明', width: 70 },
    ],
    rows: [
      { col: 'コード', desc: '【必須】案件固有コード (重複検出キー)。例: PRJ-2026-001' },
      { col: 'GLS番号', desc: '受注後に発番。空欄ならヨミ段階扱い' },
      { col: '案件名', desc: '【必須】' },
      { col: '顧客名', desc: '【必須】事前に登録済みの顧客名と完全一致' },
      { col: 'ステージ', desc: 'neta/d_hold/c_proposal/b_verbal/a_won/s_completed/e_lost (日本語OK: ネタ/保留/提案中/口頭内示/受注/完了/失注)' },
      { col: '担当者Email', desc: '【必須】事前に登録済みのユーザーEmailと完全一致' },
      { col: 'タグ', desc: 'カンマ区切り文字列' },
    ],
  },
  exportQuery: `
    SELECT p.code, p.gls_number, p.name, c.name as customer_name,
           p.stage, p.project_type, p.expected_amount, p.event_start, p.event_end,
           p.broadcast_type, p.media_platform, u.email as assigned_to_email, p.tags, p.notes
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN users u ON u.id = p.assigned_to
    WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC`,
  preloadLookups: async (client) => {
    const cust = await client.query('SELECT id, name FROM customers WHERE deleted_at IS NULL');
    const users = await client.query('SELECT id, email FROM users WHERE deleted_at IS NULL');
    return {
      customers: new Map(cust.rows.map((r) => [r.name as string, r.id as string])),
      users: new Map(users.rows.map((r) => [r.email as string, r.id as string])),
    };
  },
  validateRow: (raw, lookups) => {
    const errors: string[] = [];
    const code = asString(raw.code);
    const name = asString(raw.name);
    if (!code) errors.push('コードは必須');
    if (!name) errors.push('案件名は必須');

    let customer_id: string | null = null;
    const custName = asString(raw.customer_name);
    if (!custName) errors.push('顧客名は必須');
    else {
      const id = lookups.customers?.get(custName);
      if (!id) errors.push(`顧客 "${custName}" がマスタに存在しません`);
      else customer_id = id;
    }

    let assigned_to: string | null = null;
    const email = asString(raw.assigned_to_email);
    if (!email) errors.push('担当者Emailは必須');
    else {
      const id = lookups.users?.get(email);
      if (!id) errors.push(`ユーザー "${email}" がマスタに存在しません`);
      else assigned_to = id;
    }

    const stageRaw = String(raw.stage ?? '').trim().toLowerCase();
    const stage = STAGE_MAP[stageRaw] || 'neta';

    return {
      data: {
        _displayName: name,
        code, name, customer_id, assigned_to, stage,
        gls_number: asString(raw.gls_number),
        project_type: asString(raw.project_type) || 'other',
        expected_amount: asInt(raw.expected_amount) ?? 0,
        event_start: asString(raw.event_start),
        event_end: asString(raw.event_end),
        broadcast_type: asString(raw.broadcast_type),
        media_platform: asString(raw.media_platform),
        tags: asString(raw.tags) || '',
        notes: asString(raw.notes),
      },
      errors,
      uniqueKey: code,
    };
  },
  insert: async (client, d, userId) => {
    await client.query(
      `INSERT INTO projects (id, code, gls_number, name, customer_id, stage, project_type,
                             expected_amount, event_start, event_end, broadcast_type, media_platform,
                             assigned_to, tags, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [newId(), d.code, d.gls_number, d.name, d.customer_id, d.stage, d.project_type,
       d.expected_amount, d.event_start, d.event_end, d.broadcast_type, d.media_platform,
       d.assigned_to, d.tags, d.notes, userId, userId],
    );
  },
  update: async (client, id, d, userId) => {
    await client.query(
      `UPDATE projects SET code=$1, gls_number=$2, name=$3, customer_id=$4, stage=$5, project_type=$6,
                           expected_amount=$7, event_start=$8, event_end=$9, broadcast_type=$10, media_platform=$11,
                           assigned_to=$12, tags=$13, notes=$14, updated_by=$15, updated_at=NOW()
       WHERE id=$16`,
      [d.code, d.gls_number, d.name, d.customer_id, d.stage, d.project_type,
       d.expected_amount, d.event_start, d.event_end, d.broadcast_type, d.media_platform,
       d.assigned_to, d.tags, d.notes, userId, id],
    );
  },
};

// ============================================================
// エピソード (episodes) — project_idは GLS番号 or code でlookup
// ============================================================
const EPISODES_CONFIG: ResourceConfig = {
  name: 'エピソード',
  filename: 'episodes',
  permission: { module: 'sales', level: 'editor' },
  duplicate: { table: 'episodes', column: 'episode_code' },
  columns: [
    { key: 'project_key',    header: '案件コード/GLS', width: 16 },
    { key: 'episode_code',   header: 'エピソードコード', width: 18 },
    { key: 'episode_number', header: '話数',           width: 8 },
    { key: 'recording_date', header: '収録日',         width: 12 },
    { key: 'broadcast_date', header: '放送日',         width: 12 },
    { key: 'delivery_date',  header: '納品日',         width: 12 },
    { key: 'notes',          header: '備考',           width: 30 },
  ],
  templateRows: [
    { project_key: 'PRJ-2026-001', episode_code: 'PRJ-2026-001-001', episode_number: 1,
      recording_date: '2026-06-01', broadcast_date: '2026-06-15', delivery_date: '2026-06-10', notes: '' },
  ],
  guideSheet: {
    name: '入力ガイド',
    columns: [{ key: 'col', header: '項目', width: 20 }, { key: 'desc', header: '説明', width: 60 }],
    rows: [
      { col: '案件コード/GLS', desc: '【必須】projectsテーブルのcodeまたはgls_numberと一致' },
      { col: 'エピソードコード', desc: '【必須】システム全体で一意' },
      { col: '話数', desc: '【必須】整数' },
    ],
  },
  exportQuery: `
    SELECT COALESCE(p.gls_number, p.code) as project_key, e.episode_code, e.episode_number,
           e.recording_date, e.broadcast_date, e.delivery_date, e.notes
    FROM episodes e JOIN projects p ON p.id = e.project_id
    WHERE e.deleted_at IS NULL ORDER BY p.code, e.episode_number`,
  preloadLookups: async (client) => {
    const projects = await client.query(
      'SELECT id, code, gls_number FROM projects WHERE deleted_at IS NULL',
    );
    const map = new Map<string, string>();
    for (const r of projects.rows) {
      if (r.code) map.set(r.code as string, r.id as string);
      if (r.gls_number) map.set(r.gls_number as string, r.id as string);
    }
    return { projects: map };
  },
  validateRow: (raw, lookups) => {
    const errors: string[] = [];
    const projectKey = asString(raw.project_key);
    const episodeCode = asString(raw.episode_code);
    const episodeNumber = asInt(raw.episode_number);

    if (!projectKey) errors.push('案件コード/GLSは必須');
    if (!episodeCode) errors.push('エピソードコードは必須');
    if (episodeNumber == null) errors.push('話数は必須(整数)');

    let project_id: string | null = null;
    if (projectKey) {
      const id = lookups.projects?.get(projectKey);
      if (!id) errors.push(`案件 "${projectKey}" がマスタに存在しません`);
      else project_id = id;
    }

    return {
      data: {
        _displayName: episodeCode,
        project_id,
        episode_code: episodeCode,
        episode_number: episodeNumber,
        recording_date: asDate(raw.recording_date),
        broadcast_date: asDate(raw.broadcast_date),
        delivery_date: asDate(raw.delivery_date),
        notes: asString(raw.notes),
      },
      errors,
      uniqueKey: episodeCode,
    };
  },
  insert: async (client, d, userId) => {
    await client.query(
      `INSERT INTO episodes (id, project_id, episode_number, episode_code,
                             recording_date, broadcast_date, delivery_date, notes,
                             created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [newId(), d.project_id, d.episode_number, d.episode_code,
       d.recording_date, d.broadcast_date, d.delivery_date, d.notes, userId, userId],
    );
  },
  update: async (client, id, d, userId) => {
    await client.query(
      `UPDATE episodes SET project_id=$1, episode_number=$2, recording_date=$3,
                           broadcast_date=$4, delivery_date=$5, notes=$6,
                           updated_by=$7, updated_at=NOW() WHERE id=$8`,
      [d.project_id, d.episode_number, d.recording_date, d.broadcast_date,
       d.delivery_date, d.notes, userId, id],
    );
  },
};

export function createSalesExcelRouter(): Router {
  const router = Router();
  router.use('/customers/excel', createExcelResourceRouter(CUSTOMERS_CONFIG));
  router.use('/vendors/excel', createExcelResourceRouter(VENDORS_CONFIG));
  router.use('/partners/excel', createExcelResourceRouter(PARTNERS_CONFIG));
  router.use('/projects/excel', createExcelResourceRouter(PROJECTS_CONFIG));
  router.use('/episodes/excel', createExcelResourceRouter(EPISODES_CONFIG));
  return router;
}

